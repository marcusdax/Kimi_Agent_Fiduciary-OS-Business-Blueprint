/**
 * trust/authz.ts — F6: a small relationship-based authorisation graph.
 *
 * Gap: the platform's authorisation was a single `role` string on a user. But the
 * B2B question is not "what role are you" — it is "which households may you see, on
 * whose authority, and for how long". A boolean cannot express that, and getting it
 * wrong is a data-breach class of bug.
 *
 * The model is deliberately the Zanzibar shape (userset rewrite), reduced to the
 * parts this product needs:
 *
 *   tuple(user:u1, member, firm:f1)        u1 belongs to firm f1
 *   tuple(firm:f1, serves, household:h1)   firm f1 is engaged by household h1
 *   tuple(household:h1, parent, document:d1)  d1 belongs to h1
 *
 * `check(user:u1, view, document:d1)` walks object -> parent -> ... and resolves the
 * *subject* side through membership, so "advisor at the firm that serves this
 * household may view its documents" is one traversal, not a hard-coded rule.
 *
 * Why in-house rather than OpenFGA in this commit: OpenFGA is the right long-term
 * server (it also solves distribution and audit), and the interface below is shaped
 * so it can be swapped for one. But a network dependency to answer "may this advisor
 * open this document" adds a failure mode to the most security-sensitive check in
 * the product. Start in-process, revisit when firm counts make delegation matter.
 */
import { point, type DataPoint } from '../provenance.ts';

export type Relation = 'member' | 'serves' | 'parent' | 'viewer' | 'editor' | 'owner';

export interface Tuple {
  subject: string;
  relation: Relation;
  object: string;
}

export interface CheckResult {
  allowed: boolean;
  /** The traversal that justified the decision, so a denial can be explained too. */
  path: string[];
  reason: string;
}

/** Which relations imply another, and which direction the walk goes. */
const IMPLIES: Array<{ from: Relation; to: Relation }> = [
  // An editor and an owner can both view.
  { from: 'editor', to: 'viewer' },
  { from: 'owner', to: 'viewer' },
];

export class AuthzGraph {
  readonly #tuples: Tuple[] = [];
  readonly #index = new Map<string, Tuple[]>();

  get size(): number {
    return this.#tuples.length;
  }

  #key(object: string): string {
    return object;
  }

  add(tuple: Tuple): void {
    if (!tuple.subject.includes(':') || !tuple.object.includes(':')) {
      throw new Error('subjects and objects must be namespaced, e.g. user:u1 / household:h1');
    }
    if (this.#tuples.some((t) => t.subject === tuple.subject && t.relation === tuple.relation && t.object === tuple.object)) return;
    this.#tuples.push(tuple);
    const list = this.#index.get(this.#key(tuple.object)) ?? [];
    list.push(tuple);
    this.#index.set(this.#key(tuple.object), list);
  }

  remove(tuple: Tuple): boolean {
    const idx = this.#tuples.findIndex((t) => t.subject === tuple.subject && t.relation === tuple.relation && t.object === tuple.object);
    if (idx === -1) return false;
    this.#tuples.splice(idx, 1);
    const list = (this.#index.get(tuple.object) ?? []).filter(
      (t) => !(t.subject === tuple.subject && t.relation === tuple.relation),
    );
    this.#index.set(tuple.object, list);
    return true;
  }

  /** Direct tuples granting `relation` (or something that implies it) on an object. */
  #grantingFor(object: string, relation: Relation): Tuple[] {
    const wanted = new Set<Relation>([relation]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of IMPLIES) {
        if (wanted.has(rule.to) && !wanted.has(rule.from)) {
          wanted.add(rule.from);
          changed = true;
        }
      }
    }
    return (this.#index.get(object) ?? []).filter((t) => wanted.has(t.relation));
  }

  /**
   * Expand a subject into the set of principals it acts for: the user, plus every
   * firm it belongs to, transitively.
   */
  #principals(subject: string): string[] {
    const out = new Set<string>([subject]);
    const queue = [subject];
    while (queue.length) {
      const current = queue.shift()!;
      for (const tuple of this.#tuples) {
        if (tuple.subject !== current) continue;
        if (tuple.relation === 'member') {
          if (!out.has(tuple.object)) {
            out.add(tuple.object);
            queue.push(tuple.object);
          }
        }
      }
    }
    return [...out];
  }

  /**
   * Can `subject` perform `relation` on `object`?
   *
   * Walks one direction only (object -> parent), and checks the subject side by
   * membership expansion. Bounded depth prevents a cycle from hanging the request.
   */
  check(subject: string, relation: Relation, object: string, maxDepth = 6): CheckResult {
    const principals = this.#principals(subject);
    const path: string[] = [];

    let current: string | null = object;
    let depth = 0;
    while (current && depth <= maxDepth) {
      path.push(current);
      for (const tuple of this.#grantingFor(current, relation)) {
        // `serves` is the B2B grant: the firm that serves a household may view it,
        // and (via the parent walk) everything beneath it.
        if (tuple.relation === 'serves' && principals.includes(tuple.subject) &&
            (relation === 'viewer' || relation === 'editor' || relation === 'owner')) {
          return {
            allowed: true,
            path: [...path, `granted by ${tuple.subject} serves ${current}`],
            reason: `engagement: ${tuple.subject} serves ${current}`,
          };
        }
      }

      for (const tuple of (this.#index.get(current) ?? [])) {
        if (tuple.relation !== 'serves') continue;
        if (!principals.includes(tuple.subject)) continue;
        if (relation !== 'viewer' && relation !== 'editor' && relation !== 'owner') continue;
        return {
          allowed: true,
          path: [...path, `granted by ${tuple.subject} serves ${current}`],
          reason: `engagement: ${tuple.subject} serves ${current}`,
        };
      }

      for (const tuple of this.#grantingFor(current, relation)) {
        if (principals.includes(tuple.subject)) {
          return {
            allowed: true,
            path: [...path, `granted by ${tuple.subject} ${tuple.relation} ${current}`],
            reason: `relationship: ${tuple.subject} is ${tuple.relation} of ${current}`,
          };
        }
        // A viewer on the household grants a viewer on its documents.
        if (tuple.relation === 'viewer' || tuple.relation === 'editor' || tuple.relation === 'owner') {
          if (this.#principals(tuple.subject).some((p) => principals.includes(p))) {
            return {
              allowed: true,
              path: [...path, `granted via ${tuple.subject} ${tuple.relation} ${current}`],
              reason: `delegated: ${tuple.subject} holds ${tuple.relation} on ${current}`,
            };
          }
        }
      }

      // `parent` is written as (child-side subject) -> (parent object)? No: the tuple is
      // { subject: household, relation: parent, object: document }, i.e. "household is the
      // parent OF document". So we walk up by taking the *subject* of the parent tuple.
      const parent: Tuple | undefined = (this.#index.get(current) ?? []).find((t) => t.relation === 'parent');
      current = parent ? parent.subject : null;
      depth++;
    }

    return {
      allowed: false,
      path,
      reason: depth > maxDepth ? 'traversal depth exceeded (possible cycle in the relationship graph)' : 'no relationship grants this access',
    };
  }

  /** Every object of a type the subject can act on — for "my clients" lists. */
  listObjects(subject: string, relation: Relation, objectType: string): string[] {
    // Candidate containers are the subjects of `parent` tuples (the households), plus
    // any directly granted object of the requested type.
    const candidates = new Set<string>();
    for (const tuple of this.#tuples) {
      if (tuple.relation === 'parent') candidates.add(tuple.subject);
      if (tuple.object.startsWith(`${objectType}:`)) candidates.add(tuple.object);
    }
    return [...candidates]
      .filter((o) => o.startsWith(`${objectType}:`))
      .filter((o) => this.check(subject, relation, o).allowed)
      .sort();
  }

  snapshot(): Tuple[] {
    return [...this.#tuples];
  }
}

export function describeGraph(graph: AuthzGraph): DataPoint<{ tuples: Tuple[]; subjects: number; objects: number }> {
  const tuples = graph.snapshot();
  return point(
    {
      tuples,
      subjects: new Set(tuples.map((t) => t.subject)).size,
      objects: new Set(tuples.map((t) => t.object)).size,
    },
    {
      source: 'fiduciary-os:authz-graph',
      sourceKind: 'derived',
      sourceUrl: '',
      retrievedAt: new Date().toISOString(),
      asOf: null,
      license: 'Proprietary',
      method: 'Relationship tuples (Zanzibar-style), resolved by membership expansion and parent traversal.',
      staleAfterSeconds: 300,
    },
  );
}
