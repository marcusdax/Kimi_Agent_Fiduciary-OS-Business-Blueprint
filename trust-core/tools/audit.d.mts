export interface Violation {
  rule: string;
  file: string;
  line: number;
  message: string;
  excerpt: string;
}

export interface Rule {
  id: string;
  pattern: RegExp;
  files: RegExp;
  message: string;
}

export const RULES: Rule[];
export function findViolations(rel: string, text: string, options?: { checkDoc?: boolean }): Violation[];
export function auditTree(rootDir?: string): Promise<{ checked: number; files: string[]; findings: Violation[] }>;