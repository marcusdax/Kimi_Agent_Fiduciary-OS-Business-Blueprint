/**
 * features/formula.ts — F11: a declarative sandbox for partner calculators.
 *
 * The requirement: let a third party (an IMO, a carrier, a partner fintech) contribute
 * a calculator without giving their code the ability to read client data, open a
 * socket, or run for a minute.
 *
 * Why not `node:vm` or `eval`: neither is a security boundary in Node. `vm` shares the
 * isolate, and escape techniques are routine. Shipping it as a "sandbox" would be
 * worse than shipping nothing, because it invites trust it cannot earn.
 *
 * What is actually safe: do not execute their code at all. Execute their *formula* —
 * a data structure — against a fixed variable set, with a hand-written parser and
 * evaluator that has no property access, no strings, no assignment and no host
 * objects. That is the same model insurers already use for illustration formulas, and
 * it is verifiable by reading this file.
 *
 * Limits are explicit and enforced: token count, nesting depth, operation count.
 * Every result carries the evaluation trace, so a partner's number can be explained
 * line by line rather than trusted.
 *
 * For genuinely arbitrary third-party code (a compiled model, a data transform),
 * the correct boundary is a WASM instance or a separate process with no credentials —
 * see `docs/02_FEATURE_CONCEPTS.md` F11.
 */
import { derive, type DataPoint } from '../provenance.ts';

export class FormulaError extends Error {
  override readonly name = 'FormulaError';
}

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

const ALLOWED_FUNCTIONS = new Set(['min', 'max', 'abs', 'round', 'floor', 'ceil', 'clamp']);

export interface FormulaLimits {
  maxTokens: number;
  maxDepth: number;
  maxOperations: number;
  maxFormulaLength: number;
}

export const DEFAULT_LIMITS: FormulaLimits = {
  maxTokens: 256,
  maxDepth: 32,
  maxOperations: 10_000,
  maxFormulaLength: 2_048,
};

export interface Evaluation {
  value: number;
  trace: string[];
  operations: number;
  variablesUsed: string[];
}

function tokenize(source: string, limits: FormulaLimits): Token[] {
  if (source.length > limits.maxFormulaLength) {
    throw new FormulaError(`formula exceeds ${limits.maxFormulaLength} characters`);
  }
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9._]/.test(source[j]!)) j++;
      if (/[eE]/.test(source[j] ?? '')) {
        j++;
        if (/[+-]/.test(source[j] ?? '')) j++;
        while (j < source.length && /[0-9]/.test(source[j]!)) j++;
      }
      const literal = source.slice(i, j).replace(/_/g, '');
      const value = Number(literal);
      if (!Number.isFinite(value)) throw new FormulaError(`invalid number "${literal}"`);
      tokens.push({ kind: 'number', value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j]!)) j++;
      tokens.push({ kind: 'ident', name: source.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/%^'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i++;
      continue;
    }
    // Nothing else is a legal character. Notably: `[`, `]`, `.`, `:`, `"`, `;`, `{`, `}`,
    // `=`, `<`, `>` — the characters any escape attempt would need.
    throw new FormulaError(`illegal character "${ch}" at position ${i}`);
  }
  if (tokens.length > limits.maxTokens) throw new FormulaError(`formula exceeds ${limits.maxTokens} tokens`);
  if (tokens.length === 0) throw new FormulaError('formula is empty');
  return tokens;
}

/**
 * Pratt parser producing an AST. Precedence: ^ (right), unary -, * / %, + -.
 * Depth is bounded here so a deeply nested formula cannot exhaust the stack.
 */
type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'unary'; op: '-' | '+'; operand: Node }
  | { t: 'bin'; op: string; left: Node; right: Node }
  | { t: 'call'; name: string; args: Node[] };

class Parser {
  readonly #tokens: Token[];
  #pos = 0;
  readonly #limits: FormulaLimits;

  constructor(tokens: Token[], limits: FormulaLimits) {
    this.#tokens = tokens;
    this.#limits = limits;
  }

  #peek(): Token | undefined {
    return this.#tokens[this.#pos];
  }

  #next(): Token | undefined {
    return this.#tokens[this.#pos++];
  }

  parse(): Node {
    const node = this.#expression(0, 0);
    if (this.#pos !== this.#tokens.length) throw new FormulaError('unexpected trailing input');
    return node;
  }

  #expression(minPrecedence: number, depth: number): Node {
    if (depth > this.#limits.maxDepth) throw new FormulaError(`expression nesting exceeds ${this.#limits.maxDepth}`);
    let left = this.#prefix(depth);

    for (;;) {
      const token = this.#peek();
      if (!token || token.kind !== 'op') break;
      const precedence = precedenceOf(token.op);
      if (precedence < minPrecedence) break;
      this.#next();
      const right = this.#expression(precedence + (token.op === '^' ? 0 : 1), depth + 1);
      left = { t: 'bin', op: token.op, left, right };
    }
    return left;
  }

  #prefix(depth: number): Node {
    const token = this.#next();
    if (!token) throw new FormulaError('unexpected end of formula');

    if (token.kind === 'number') return { t: 'num', v: token.value };

    if (token.kind === 'op' && (token.op === '-' || token.op === '+')) {
      return { t: 'unary', op: token.op, operand: this.#expression(4, depth + 1) };
    }

    if (token.kind === 'lparen') {
      const inner = this.#expression(0, depth + 1);
      const closing = this.#next();
      if (!closing || closing.kind !== 'rparen') throw new FormulaError('missing closing parenthesis');
      return inner;
    }

    if (token.kind === 'ident') {
      const next = this.#peek();
      if (next && next.kind === 'lparen') {
        if (!ALLOWED_FUNCTIONS.has(token.name)) {
          throw new FormulaError(`function "${token.name}" is not allowed (allowed: ${[...ALLOWED_FUNCTIONS].join(', ')})`);
        }
        this.#next();
        const args: Node[] = [];
        if (this.#peek()?.kind !== 'rparen') {
          for (;;) {
            args.push(this.#expression(0, depth + 1));
            const sep = this.#peek();
            if (sep?.kind === 'comma') {
              this.#next();
              continue;
            }
            break;
          }
        }
        const closing = this.#next();
        if (!closing || closing.kind !== 'rparen') throw new FormulaError('missing closing parenthesis in call');
        return { t: 'call', name: token.name, args };
      }
      return { t: 'var', name: token.name };
    }

    throw new FormulaError(`unexpected token "${token.kind}"`);
  }
}

function precedenceOf(op: string): number {
  switch (op) {
    case '+':
    case '-':
      return 1;
    case '*':
    case '/':
    case '%':
      return 2;
    case '^':
      return 3;
    default:
      return -1;
  }
}

/** A formula bound to an allow-listed variable set. This is what a partner submits. */
export interface FormulaSpec {
  id: string;
  /** Human description shown to the advisor. */
  description: string;
  expression: string;
  /** Variables the formula may reference; anything else is a compile error. */
  variables: Record<string, { label: string; unit?: string }>;
}

export class Formula {
  readonly spec: FormulaSpec;
  readonly #ast: Node;
  readonly limits: FormulaLimits;

  private constructor(spec: FormulaSpec, ast: Node, limits: FormulaLimits) {
    this.spec = spec;
    this.#ast = ast;
    this.limits = limits;
  }

  /**
   * Compile once at registration time. A malformed or over-budget formula is rejected
   * when the partner submits it, not when a client runs it.
   */
  static compile(spec: FormulaSpec, limits: FormulaLimits = DEFAULT_LIMITS): Formula {
    if (!spec.id.trim()) throw new FormulaError('formula id is required');
    const tokens = tokenize(spec.expression, limits);
    const ast = new Parser(tokens, limits).parse();

    // Reject unknown variables at compile time: a typo should fail the submission, not
    // silently evaluate to NaN for a client six weeks later.
    const allowed = new Set(Object.keys(spec.variables));
    const used = collectVariables(ast);
    for (const name of used) {
      if (!allowed.has(name)) {
        throw new FormulaError(`unknown variable "${name}" (declared: ${[...allowed].join(', ') || 'none'})`);
      }
    }
    return new Formula(spec, ast, limits);
  }

  evaluate(inputs: Record<string, number>): DataPoint<Evaluation> {
    const trace: string[] = [];
    let operations = 0;
    const used: string[] = [];

    const evaluateNode = (node: Node): number => {
      if (++operations > this.limits.maxOperations) {
        throw new FormulaError(`evaluation exceeded ${this.limits.maxOperations} operations`);
      }
      switch (node.t) {
        case 'num':
          return node.v;
        case 'var': {
          const value = inputs[node.name];
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new FormulaError(`variable "${node.name}" must be a finite number`);
          }
          if (!used.includes(node.name)) used.push(node.name);
          trace.push(`${node.name} = ${value}`);
          return value;
        }
        case 'unary': {
          const v = evaluateNode(node.operand);
          return node.op === '-' ? -v : v;
        }
        case 'bin': {
          const left = evaluateNode(node.left);
          const right = evaluateNode(node.right);
          const result = applyOperator(node.op, left, right);
          trace.push(`${left} ${node.op} ${right} = ${result}`);
          return result;
        }
        case 'call': {
          const args = node.args.map(evaluateNode);
          const result = applyFunction(node.name, args);
          trace.push(`${node.name}(${args.join(', ')}) = ${result}`);
          return result;
        }
        default:
          throw new FormulaError('unreachable');
      }
    };

    const value = evaluateNode(this.#ast);
    if (!Number.isFinite(value)) throw new FormulaError('formula produced a non-finite result');

    return derive(
      { value, trace, operations, variablesUsed: used },
      [
        {
          source: `formula:${this.spec.id}`,
          sourceKind: 'user-input',
          sourceUrl: '',
          retrievedAt: new Date().toISOString(),
          asOf: null,
          license: 'Partner-supplied',
          method: `Declarative formula "${this.spec.expression}" evaluated in an allow-listed sandbox (no host access, no property access).`,
        },
      ],
      `Declarative formula "${this.spec.expression}" for ${this.spec.description}: evaluated in an allow-listed sandbox ` +
        `(no host access, no property access, no assignment) with ${used.length} inputs and ${operations} operations. ` +
        'The evaluation trace is retained for explainability.',
      'fiduciary-os:formula-sandbox',
    );
  }
}

function applyOperator(op: string, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) throw new FormulaError('division by zero');
      return a / b;
    case '%':
      if (b === 0) throw new FormulaError('modulo by zero');
      return a % b;
    case '^':
      return Math.pow(a, b);
    default:
      throw new FormulaError(`unsupported operator "${op}"`);
  }
}

function applyFunction(name: string, args: number[]): number {
  const require = (n: number) => {
    if (args.length !== n) throw new FormulaError(`${name} expects ${n} argument(s), got ${args.length}`);
  };
  switch (name) {
    case 'min':
      if (args.length === 0) throw new FormulaError('min expects at least one argument');
      return Math.min(...args);
    case 'max':
      if (args.length === 0) throw new FormulaError('max expects at least one argument');
      return Math.max(...args);
    case 'abs':
      require(1);
      return Math.abs(args[0]!);
    case 'round':
      require(1);
      return Math.round(args[0]!);
    case 'floor':
      require(1);
      return Math.floor(args[0]!);
    case 'ceil':
      require(1);
      return Math.ceil(args[0]!);
    case 'clamp': {
      require(3);
      const [value, lo, hi] = args as [number, number, number];
      if (lo > hi) throw new FormulaError('clamp lower bound exceeds upper bound');
      return Math.min(hi, Math.max(lo, value));
    }
    default:
      throw new FormulaError(`unsupported function "${name}"`);
  }
}

function collectVariables(node: Node, out = new Set<string>()): Set<string> {
  switch (node.t) {
    case 'var':
      out.add(node.name);
      break;
    case 'unary':
      collectVariables(node.operand, out);
      break;
    case 'bin':
      collectVariables(node.left, out);
      collectVariables(node.right, out);
      break;
    case 'call':
      for (const arg of node.args) collectVariables(arg, out);
      break;
    default:
      break;
  }
  return out;
}
