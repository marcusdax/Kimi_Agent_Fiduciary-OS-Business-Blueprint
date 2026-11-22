/**
 * embeddingService.ts — Phase 2 HuggingFace + pgvector semantic search service.
 *
 * Uses HuggingFace Inference API when HF_TOKEN is configured, and falls back to
 * a deterministic 1536-dim normalized trigram-hash projection when offline so
 * local Docker and CI environments work with zero external credentials.
 */

import { createHash, randomUUID } from 'crypto';
import { prisma } from '../config/database';

export const EMBEDDING_DIM = 1536;
const DEFAULT_HF_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

export interface IndexedDocument {
  id: string;
  entityType: string;
  entityId: string;
  content: string;
  model: string;
  score?: number;
}

// In-memory mirror used when pgvector is unavailable (e.g. unit tests without DB).
const memoryIndex = new Map<string, { entityType: string; entityId: string; content: string; model: string; vector: number[] }>();

/**
 * Deterministic 1536-dim unit-norm embedding via character trigram hashing.
 */
export function deterministicEmbed(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Float64Array(dim);
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) {
    vec[0] = 1;
    return Array.from(vec);
  }
  const padded = ` ${normalized} `;
  for (let i = 0; i < padded.length - 2; i++) {
    const trigram = padded.slice(i, i + 3);
    const digest = createHash('sha256').update(trigram).digest();
    const idx = digest.readUInt32BE(0) % dim;
    const sign = (digest[4] & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  // Word-level boost for stronger semantic overlap on domain keywords
  for (const token of normalized.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)) {
    const digest = createHash('sha256').update(`w:${token}`).digest();
    const idx = digest.readUInt32BE(0) % dim;
    const sign = (digest[4] & 1) === 0 ? 1 : -1;
    vec[idx] += sign * 2.5;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => Number((v / norm).toFixed(6)));
}

function padOrProject(raw: number[], targetDim = EMBEDDING_DIM): number[] {
  if (raw.length === targetDim) return raw;
  const out = new Array<number>(targetDim).fill(0);
  for (let i = 0; i < raw.length; i++) {
    out[i % targetDim] += raw[i];
  }
  let norm = 0;
  for (let i = 0; i < targetDim; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm) || 1;
  return out.map((v) => Number((v / norm).toFixed(6)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateEmbedding(text: string): Promise<{
  vector: number[];
  model: string;
  source: 'huggingface-live' | 'deterministic-local';
}> {
  const hfToken = process.env.HF_TOKEN;
  const model = process.env.HF_EMBEDDING_MODEL || DEFAULT_HF_MODEL;
  if (hfToken) {
    try {
      const res = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as unknown;
        if (Array.isArray(json) && json.length > 0) {
          const flat = Array.isArray(json[0]) ? (json[0] as number[]) : (json as number[]);
          if (flat.every((n) => typeof n === 'number')) {
            return {
              vector: padOrProject(flat, EMBEDDING_DIM),
              model,
              source: 'huggingface-live',
            };
          }
        }
      }
    } catch {
      // Fall back to deterministic embedding below.
    }
  }
  return {
    vector: deterministicEmbed(text, EMBEDDING_DIM),
    model: 'local-trigram-1536',
    source: 'deterministic-local',
  };
}

export async function upsertEmbedding(params: {
  entityType: string;
  entityId: string;
  content: string;
}): Promise<{
  id: string;
  entityType: string;
  entityId: string;
  model: string;
  source: 'huggingface-live' | 'deterministic-local';
  persistedToPgVector: boolean;
}> {
  const { vector, model, source } = await generateEmbedding(params.content);
  const key = `${params.entityType}:${params.entityId}`;
  memoryIndex.set(key, {
    entityType: params.entityType,
    entityId: params.entityId,
    content: params.content,
    model,
    vector,
  });

  const vectorLiteral = `[${vector.join(',')}]`;
  const id = randomUUID();
  let persistedToPgVector = false;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO embedding (id, "entityType", "entityId", vector, model, "createdAt")
       VALUES ($1, $2, $3, $4::vector, $5, NOW())
       ON CONFLICT ("entityType", "entityId")
       DO UPDATE SET vector = EXCLUDED.vector, model = EXCLUDED.model`,
      id,
      params.entityType,
      params.entityId,
      vectorLiteral,
      model
    );
    persistedToPgVector = true;
  } catch {
    // Graceful fallback when running without live pgvector table (e.g. unit tests)
    persistedToPgVector = false;
  }

  return {
    id,
    entityType: params.entityType,
    entityId: params.entityId,
    model,
    source,
    persistedToPgVector,
  };
}

export async function semanticSearch(params: {
  query: string;
  entityType?: string;
  limit?: number;
}): Promise<{
  query: string;
  source: 'huggingface-live' | 'deterministic-local';
  backend: 'pgvector' | 'memory';
  results: Array<{
    entityType: string;
    entityId: string;
    similarity: number;
    model: string;
    content?: string;
  }>;
}> {
  const limit = Math.max(1, Math.min(20, params.limit ?? 5));
  const { vector, source } = await generateEmbedding(params.query);
  const vectorLiteral = `[${vector.join(',')}]`;

  try {
    const rows = params.entityType
      ? await prisma.$queryRawUnsafe<Array<{ entityType: string; entityId: string; model: string; similarity: number }>>(
          `SELECT "entityType", "entityId", model, (1 - (vector <=> $1::vector)) AS similarity
           FROM embedding
           WHERE "entityType" = $2
           ORDER BY vector <=> $1::vector
           LIMIT $3`,
          vectorLiteral,
          params.entityType,
          limit
        )
      : await prisma.$queryRawUnsafe<Array<{ entityType: string; entityId: string; model: string; similarity: number }>>(
          `SELECT "entityType", "entityId", model, (1 - (vector <=> $1::vector)) AS similarity
           FROM embedding
           ORDER BY vector <=> $1::vector
           LIMIT $2`,
          vectorLiteral,
          limit
        );

    if (rows.length > 0) {
      return {
        query: params.query,
        source,
        backend: 'pgvector',
        results: rows.map((r) => ({
          entityType: r.entityType,
          entityId: r.entityId,
          model: r.model,
          similarity: Number(Number(r.similarity).toFixed(4)),
          content: memoryIndex.get(`${r.entityType}:${r.entityId}`)?.content,
        })),
      };
    }
  } catch {
    // Fall back to memory index below
  }

  const scored = Array.from(memoryIndex.values())
    .filter((entry) => !params.entityType || entry.entityType === params.entityType)
    .map((entry) => ({
      entityType: entry.entityType,
      entityId: entry.entityId,
      model: entry.model,
      content: entry.content,
      similarity: Number(cosineSimilarity(vector, entry.vector).toFixed(4)),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return {
    query: params.query,
    source,
    backend: 'memory',
    results: scored,
  };
}
