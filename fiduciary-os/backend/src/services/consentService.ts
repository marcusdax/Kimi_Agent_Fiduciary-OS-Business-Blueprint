/**
 * services/consentService.ts — CAN-SPAM, TCPA, GDPR & CCPA double-opt-in consent ledger.
 *
 * Every communication consent change is recorded with a SHA-256 proof hash and mirrored
 * into the append-only WORM provenance_records chain. Outbound dispatch guard
 * (`verifyOutboundConsent`) blocks email/sms/voice unless the latest record is both
 * `opted_in` AND `doubleOptInVerified === true`.
 */

import { createHash } from 'crypto';
import type { ConsentRecord } from '@prisma/client';
import { prisma } from '../config/database';
import { appendProvenance } from './crmService';

export type ConsentChannel = 'email' | 'sms' | 'voice';
export type ConsentStatus = 'opted_in' | 'opted_out';

export interface RecordConsentInput {
  userId: string;
  householdId?: string | null;
  channel: ConsentChannel;
  status: ConsentStatus;
  doubleOptInVerified?: boolean;
  source: string;
  ipAddress?: string | null;
}

export interface OutboundConsentCheck {
  allowed: boolean;
  reason: 'verified_opt_in' | 'no_consent_record' | 'opted_out' | 'double_opt_in_unverified';
  latestRecord: ConsentRecord | null;
}

export async function recordConsent(input: RecordConsentInput): Promise<ConsentRecord> {
  const recordedAt = new Date();
  const doubleOptInVerified = Boolean(input.doubleOptInVerified);

  const proofHash = createHash('sha256')
    .update(
      JSON.stringify({
        userId: input.userId,
        householdId: input.householdId ?? null,
        channel: input.channel,
        status: input.status,
        doubleOptInVerified,
        source: input.source,
        ipAddress: input.ipAddress ?? null,
        recordedAt: recordedAt.toISOString(),
      })
    )
    .digest('hex');

  const record = await prisma.consentRecord.create({
    data: {
      userId: input.userId,
      householdId: input.householdId ?? null,
      channel: input.channel,
      status: input.status,
      doubleOptInVerified,
      source: input.source,
      ipAddress: input.ipAddress ?? null,
      proofHash,
      recordedAt,
    },
  });

  await appendProvenance(input.userId, 'consent.recorded', {
    consentId: record.id,
    channel: record.channel,
    status: record.status,
    doubleOptInVerified: record.doubleOptInVerified,
    proofHash: record.proofHash,
  });

  return record;
}

export async function listConsent(
  userId: string,
  channel?: ConsentChannel
): Promise<ConsentRecord[]> {
  return prisma.consentRecord.findMany({
    where: {
      userId,
      ...(channel ? { channel } : {}),
    },
    orderBy: { recordedAt: 'desc' },
  });
}

export async function verifyOutboundConsent(
  userId: string,
  channel: ConsentChannel
): Promise<OutboundConsentCheck> {
  const latestRecord = await prisma.consentRecord.findFirst({
    where: { userId, channel },
    orderBy: { recordedAt: 'desc' },
  });

  if (!latestRecord) {
    return {
      allowed: false,
      reason: 'no_consent_record',
      latestRecord: null,
    };
  }

  if (latestRecord.status !== 'opted_in') {
    return {
      allowed: false,
      reason: 'opted_out',
      latestRecord,
    };
  }

  if (!latestRecord.doubleOptInVerified) {
    return {
      allowed: false,
      reason: 'double_opt_in_unverified',
      latestRecord,
    };
  }

  return {
    allowed: true,
    reason: 'verified_opt_in',
    latestRecord,
  };
}
