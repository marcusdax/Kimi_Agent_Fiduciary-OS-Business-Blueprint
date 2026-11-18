/**
 * Type declarations for format.js. The console ships plain ESM (so the browser and the
 * tests share one implementation); TypeScript consumers get types from here.
 */
export type SourceKind = 'live' | 'bundled-official' | 'derived' | 'user-input' | 'mock';
export type Freshness = 'fresh' | 'aging' | 'stale' | 'placeholder' | 'unknown';

export interface Provenance {
  source: string;
  sourceKind: SourceKind;
  sourceUrl?: string;
  retrievedAt: string;
  asOf?: string | null;
  license?: string;
  method?: string;
  staleAfterSeconds?: number;
  derivedFrom?: string[];
}

export interface ProvenanceView {
  label: string;
  kindLabel: string;
  freshness: Freshness;
  freshnessLabel: string;
  asOfLabel: string;
  ageLabel: string;
  license: string;
  sourceUrl: string | null;
  method: string;
  derivedFrom: string[];
  mustWarn: boolean;
}

export function relativeAge(retrievedAt: string, now?: number): string;
export function classifyFreshness(p: Provenance | null | undefined, now?: number): Freshness;
export const FRESHNESS_RANK: Record<Freshness, number>;
export function describeProvenance(p: Provenance, now?: number): ProvenanceView;
export function money(value: number): string;
export function percent(value: number, digits?: number): string;
export function rate(fraction: number, digits?: number): string;
export function compactNumber(value: number): string;
export const DISCLOSURE: string;