import policy from './aiPolicy.json';

/**
 * Output guardrails for AI-generated financial content.
 *
 * Every AI response passes through `reviewAiOutput` before it reaches a user. Rules are
 * deliberately simple and deterministic so they can be unit-tested and audited. They are a
 * last line of defence behind the system prompt, not a substitute for human supervision.
 */

export const AI_DISCLOSURE: string = policy.disclosure;
export const AI_SYSTEM_PROMPT: string = policy.systemPrompt;
export const AI_POLICY_VERSION: string = policy.version;

export const BLOCKED_RESPONSE =
  'This response was withheld because it read as a specific recommendation or a promise about ' +
  'results, which this tool does not provide. For a decision about a specific product or ' +
  'account, speak with a licensed professional who can review your full situation.';

interface Rule {
  id: string;
  pattern: RegExp;
}

/** Any match withholds the response. */
const BLOCK_RULES: Rule[] = [
  {
    id: 'promised-returns',
    pattern:
      /\b(guaranteed\s+(returns?|profits?|gains?|growth)|risk[\s-]free|can(?:no|')t\s+lose|cannot\s+lose|will\s+definitely|sure\s+thing|you\s+will\s+(earn|make|gain)\b)/i,
  },
  {
    id: 'transaction-directive',
    pattern:
      /\byou\s+(should|must|need\s+to)\s+(buy|sell|purchase|short|surrender|cancel|replace|liquidate|cash\s+out)\b/i,
  },
  {
    // A trade verb followed by something that looks like a ticker (2-5 capitals).
    id: 'security-directive',
    pattern: /\b(?:[Bb]uy|[Ss]ell|[Ss]hort|BUY|SELL)\s+(?:shares\s+of\s+|more\s+)?\$?[A-Z]{2,5}\b/,
  },
  {
    id: 'carrier-recommendation',
    pattern:
      /\b(recommend|choose|go\s+with|pick|switch\s+to)\b[^.]{0,40}\b(carrier|insurer|insurance\s+company|annuity\s+from)\b/i,
  },
  {
    id: 'advisor-impersonation',
    pattern:
      /\b(as\s+your\s+(fiduciary|financial\s+advis[eo]r|planner)|I\s+am\s+(your|a)\s+(fiduciary|licensed|registered|certified|financial\s+advis[eo]r))\b/i,
  },
];

/** Matches are allowed through but recorded for supervisory review. */
const FLAG_RULES: Rule[] = [
  { id: 'mentions-guarantee', pattern: /\bguarante/i },
  { id: 'mentions-specific-amount', pattern: /\$\s?\d{1,3}(,\d{3})+/ },
  { id: 'mentions-tax-rule', pattern: /\b(roth\s+conversion|tax[\s-]loss\s+harvest|RMD|required\s+minimum)\b/i },
];

export interface GuardrailReview {
  blocked: boolean;
  /** Rule ids that matched, block rules first. */
  flags: string[];
}

export function reviewAiOutput(texts: Array<string | undefined | null>): GuardrailReview {
  const joined = texts.filter((t): t is string => typeof t === 'string').join('\n');
  const blockedBy = BLOCK_RULES.filter(r => r.pattern.test(joined)).map(r => r.id);
  const flaggedBy = FLAG_RULES.filter(r => r.pattern.test(joined)).map(r => r.id);
  return { blocked: blockedBy.length > 0, flags: [...blockedBy, ...flaggedBy] };
}

const PII_KEYS = /^(name|first_?name|last_?name|full_?name|email|phone|ssn|social_?security_?number|address|street|dob|date_?of_?birth|account_?number|routing_?number)$/i;

/**
 * Strip direct identifiers before data leaves for a third-party model. The AI needs
 * numbers and goals, not who the person is.
 */
export function minimizeForAi(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(minimizeForAi);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEYS.test(key)) continue;
      out[key] = minimizeForAi(v);
    }
    return out;
  }
  return value;
}
