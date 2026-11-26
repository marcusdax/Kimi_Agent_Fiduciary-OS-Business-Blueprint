/**
 * huggingfaceService.ts — Phase 4 HuggingFace Inference API client.
 *
 * Centralises all HuggingFace API calls used by the document intelligence pipeline.
 * Every method is fully env-gated (HF_TOKEN) and falls back gracefully so the
 * application runs with zero external credentials in Docker / CI.
 *
 * Models used (all free on the HF Inference API):
 *   Classification : facebook/bart-large-mnli  (zero-shot, label set → document types)
 *   Sentiment/risk : ProsusAI/finbert           (financial positive/neutral/negative)
 *   Embeddings     : sentence-transformers/all-MiniLM-L6-v2 (also used in embeddingService)
 *
 * Override any model via env:
 *   HF_DOC_CLASSIFICATION_MODEL
 *   HF_SENTIMENT_MODEL
 *   HF_EMBEDDING_MODEL
 */

const HF_TOKEN = process.env.HF_TOKEN ?? null;
const HF_INFERENCE_BASE = 'https://api-inference.huggingface.co/models';

const DOC_CLASSIFICATION_MODEL =
  process.env.HF_DOC_CLASSIFICATION_MODEL ?? 'facebook/bart-large-mnli';
const SENTIMENT_MODEL = process.env.HF_SENTIMENT_MODEL ?? 'ProsusAI/finbert';
const EMBEDDING_MODEL =
  process.env.HF_EMBEDDING_MODEL ?? 'sentence-transformers/all-MiniLM-L6-v2';

const DOCUMENT_TYPE_LABELS = [
  'insurance policy',
  'estate document',
  'brokerage statement',
  'tax return',
  'advisory agreement',
  'general financial document',
];

export interface HfClassificationResult {
  label: string;
  score: number;
  source: 'huggingface-bart-mnli' | 'deterministic-fallback';
}

export interface HfSentimentResult {
  label: 'positive' | 'neutral' | 'negative';
  score: number;
  source: 'huggingface-finbert' | 'deterministic-fallback';
}

export interface HfEmbeddingResult {
  vector: number[];
  model: string;
  source: 'huggingface' | 'deterministic-fallback';
}

function hfHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}),
  };
}

async function hfPost<T>(model: string, body: unknown): Promise<T | null> {
  if (!HF_TOKEN) return null;
  try {
    const res = await fetch(`${HF_INFERENCE_BASE}/${model}`, {
      method: 'POST',
      headers: hfHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Zero-shot document classification using BART-MNLI.
 * Returns the best-matching document type label and its confidence score.
 * Falls back to null when HF_TOKEN is absent or the call fails.
 */
export async function classifyDocumentHf(
  text: string
): Promise<HfClassificationResult | null> {
  type BartResponse = {
    labels?: string[];
    scores?: number[];
    sequence?: string;
  };

  const data = await hfPost<BartResponse>(DOC_CLASSIFICATION_MODEL, {
    inputs: text.slice(0, 2000),
    parameters: {
      candidate_labels: DOCUMENT_TYPE_LABELS,
      multi_label: false,
    },
    options: { wait_for_model: true },
  });

  if (!data?.labels?.length || !data?.scores?.length) return null;

  return {
    label: data.labels[0],
    score: Number(data.scores[0].toFixed(3)),
    source: 'huggingface-bart-mnli',
  };
}

/**
 * Financial sentiment scoring via ProsusAI/finbert.
 * Returns positive / neutral / negative label and score.
 */
export async function scoreFinancialSentiment(
  text: string
): Promise<HfSentimentResult> {
  type FinBertResponse = Array<Array<{ label: string; score: number }>>;

  const data = await hfPost<FinBertResponse>(SENTIMENT_MODEL, {
    inputs: text.slice(0, 1500),
    options: { wait_for_model: true },
  });

  if (data?.[0]?.[0]) {
    const top = data[0][0];
    const raw = top.label.toLowerCase();
    const label = raw === 'positive' || raw === 'negative' ? raw : 'neutral';
    return { label, score: Number(top.score.toFixed(3)), source: 'huggingface-finbert' };
  }

  // Deterministic lexicon fallback
  const negHits = (
    text.match(/\b(risk|penalty|surrender|loss|decline|conflict|lawsuit|default|weakness)\b/gi) ?? []
  ).length;
  const posHits = (
    text.match(/\b(growth|dividend|surplus|compliant|diversified|low-cost|tax-efficient|fiduciary)\b/gi) ?? []
  ).length;
  if (negHits > posHits + 1) return { label: 'negative', score: 0.78, source: 'deterministic-fallback' };
  if (posHits > negHits + 1) return { label: 'positive', score: 0.81, source: 'deterministic-fallback' };
  return { label: 'neutral', score: 0.66, source: 'deterministic-fallback' };
}

/**
 * Text embedding via sentence-transformers on the HF Inference API.
 * Returns a float array; falls back to null when HF is unavailable.
 * (embeddingService has its own deterministic fallback for the full pipeline.)
 */
export async function embedText(text: string): Promise<HfEmbeddingResult | null> {
  type EmbedResponse = number[] | number[][];

  const data = await hfPost<EmbedResponse>(EMBEDDING_MODEL, {
    inputs: text.slice(0, 2000),
    options: { wait_for_model: true },
  });

  if (!data) return null;

  const vector = Array.isArray(data[0]) ? (data as number[][])[0] : (data as number[]);
  if (!vector?.length) return null;

  return { vector, model: EMBEDDING_MODEL, source: 'huggingface' };
}

/** Map BART-MNLI label string back to DocumentCategory enum value. */
export function bartLabelToCategory(
  label: string
): 'insurance_policy' | 'estate_document' | 'brokerage_statement' | 'tax_return' | 'advisory_agreement' | 'general_financial' {
  const map: Record<string, ReturnType<typeof bartLabelToCategory>> = {
    'insurance policy': 'insurance_policy',
    'estate document': 'estate_document',
    'brokerage statement': 'brokerage_statement',
    'tax return': 'tax_return',
    'advisory agreement': 'advisory_agreement',
    'general financial document': 'general_financial',
  };
  return map[label.toLowerCase()] ?? 'general_financial';
}
