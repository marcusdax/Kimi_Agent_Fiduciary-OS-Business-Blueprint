/**
 * trust/compliance-audit.ts — Native EU AI Act (Annex III, point 5) and Federal Reserve SR 11-7
 * compliance audit engine backed by Fiduciary OS's EvidenceLedger.
 *
 * Uses `ledger.verify()` for full cryptographic hash and chain-link verification so
 * payload tampering, reordering, or truncation is detected deterministically.
 */

import { createHash } from 'node:crypto';
import type { EvidenceLedger, LedgerEntry } from './ledger.ts';

export interface SystemRegistration {
  system_id: string;
  name: string;
  provider: string;
  risk_category: 'high_risk' | 'limited_risk' | 'minimal_risk';
  eu_ai_act_annex: string;
  sr11_7_tier: string;
  intended_purpose: string;
  zero_pii_certified: boolean;
}

export interface ComplianceAuditReport {
  generated_at: string;
  system: SystemRegistration;
  total_events: number;
  merkle_root: string;
  chain_integrity_valid: boolean;
  verification_reason: string | null;
  broken_at: number | null;
  compliance_status: 'CONFORMANT' | 'NON_CONFORMANT';
  frameworks: {
    eu_ai_act_article_12: boolean;
    eu_ai_act_article_14: boolean;
    sr_11_7_model_inventory: boolean;
    sr_11_7_audit_trail: boolean;
  };
}

export class ComplianceAuditEngine {
  public readonly system: SystemRegistration = {
    system_id: 'fiduciary-os-wealth-v1',
    name: 'Fiduciary OS Wealth & Advisory Engine',
    provider: 'Odasi Technologies, Inc. / Marcus Dax',
    risk_category: 'high_risk',
    eu_ai_act_annex: 'Annex III, point 5 (Credit/Financial Risk Assessment)',
    sr11_7_tier: 'Tier 1 (High-impact fiduciary calculation engine)',
    intended_purpose:
      'Deterministic fiduciary financial planning, annuity modeling, tax bracket calculation, exact Shapley attribution, and Monte Carlo wealth projection.',
    zero_pii_certified: true,
  };

  /**
   * Compute pairwise SHA-256 Merkle root over all entry hashes in the ledger.
   */
  public computeMerkleRoot(entries: readonly LedgerEntry[]): string {
    if (entries.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }
    let currentLevel = entries.map((e) => e.hash);
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i] ?? '';
        const right = currentLevel[i + 1] ?? left;
        nextLevel.push(createHash('sha256').update(left + right).digest('hex'));
      }
      currentLevel = nextLevel;
    }
    return currentLevel[0] ?? createHash('sha256').update('').digest('hex');
  }

  /**
   * Verify full mathematical and cryptographic integrity of the EvidenceLedger
   * via `ledger.verify()` (recomputes entry hashes + prevHash linkage).
   */
  public verifyLedger(ledger: EvidenceLedger): {
    valid: boolean;
    brokenAt: number | null;
    reason: string | null;
  } {
    const result = ledger.verify();
    return {
      valid: result.valid,
      brokenAt: result.brokenAt,
      reason: result.reason,
    };
  }

  /**
   * Generate an EU AI Act Art. 12/14 & SR 11-7 compliance audit report.
   */
  public generateComplianceAudit(ledger: EvidenceLedger): ComplianceAuditReport {
    const entries = ledger.entries();
    const verification = this.verifyLedger(ledger);
    const merkleRoot = this.computeMerkleRoot(entries);

    return {
      generated_at: new Date().toISOString(),
      system: this.system,
      total_events: entries.length,
      merkle_root: merkleRoot,
      chain_integrity_valid: verification.valid,
      verification_reason: verification.reason,
      broken_at: verification.brokenAt,
      compliance_status: verification.valid ? 'CONFORMANT' : 'NON_CONFORMANT',
      frameworks: {
        eu_ai_act_article_12: verification.valid,
        eu_ai_act_article_14: true,
        sr_11_7_model_inventory: true,
        sr_11_7_audit_trail: verification.valid,
      },
    };
  }
}
