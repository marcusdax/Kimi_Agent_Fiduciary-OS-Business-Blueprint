import assert from 'node:assert/strict';
import { E2E_TIMEOUT_MS } from './config.mjs';

/**
 * Opaque-box HTTP client built on Node 22 native fetch + AbortSignal.timeout.
 */
export async function apiFetch(baseUrl, endpointPath, opts = {}) {
  const {
    method = 'GET',
    headers = {},
    json,
    body,
    binary = false,
    timeoutMs = E2E_TIMEOUT_MS,
  } = opts;

  const normalizedPath = endpointPath.startsWith('/')
    ? endpointPath
    : `/${endpointPath}`;
  const url = `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;

  const reqHeaders = new Headers(headers);
  let reqBody = body;

  if (json !== undefined) {
    if (!reqHeaders.has('content-type')) {
      reqHeaders.set('content-type', 'application/json');
    }
    reqBody = JSON.stringify(json);
  }

  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: reqBody,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (binary) {
      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      let parsedBody = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          parsedBody = JSON.parse(buffer.toString('utf8'));
        } catch {
          parsedBody = null;
        }
      }
      return {
        status: res.status,
        ok: res.ok,
        headers: res.headers,
        body: parsedBody,
        rawText: contentType.includes('zip') ? '' : buffer.toString('utf8'),
        buffer,
        url,
        networkError: null,
      };
    }

    const rawText = await res.text();
    let parsedBody = null;
    const contentType = res.headers.get('content-type') || '';
    if (
      rawText.length > 0 &&
      (contentType.includes('json') ||
        rawText.trimStart().startsWith('{') ||
        rawText.trimStart().startsWith('['))
    ) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = null;
      }
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body: parsedBody,
      rawText,
      buffer: null,
      url,
      networkError: null,
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      headers: new Headers(),
      body: null,
      rawText: '',
      buffer: null,
      url,
      networkError: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Asserts expected HTTP status code(s) with actionable [F#/M#] diagnostics.
 */
export function assertStatus(res, expected, tag, context = '') {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (res.networkError) {
    assert.fail(
      `[${tag}] Network/timeout error calling ${res.url}${context ? ` (${context})` : ''}: ${res.networkError}`,
    );
  }
  if (!allowed.includes(res.status)) {
    const snippet = (res.rawText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    assert.fail(
      `[${tag}] Expected HTTP ${allowed.join(' or ')} from ${res.url}${context ? ` (${context})` : ''}, got HTTP ${res.status}. Body: ${snippet || '<empty>'}`,
    );
  }
}

/**
 * Asserts that a JSON response body is a non-null object.
 */
export function assertJsonObject(res, tag, context = '') {
  assert.ok(
    res.body !== null && typeof res.body === 'object' && !Array.isArray(res.body),
    `[${tag}] Expected JSON object from ${res.url}${context ? ` (${context})` : ''}, got ${typeof res.body} (raw: ${(res.rawText || '').slice(0, 160)})`,
  );
  return res.body;
}

/**
 * Asserts that a live Vite frontend module request returned actual JS/TS module code
 * rather than an HTTP 200 SPA index.html fallback.
 */
export function assertFrontendModule(res, tag, context = '') {
  assertStatus(res, 200, tag, context);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const trimmed = (res.rawText || '').trimStart().toLowerCase();
  const isHtmlFallback =
    ct.includes('text/html') ||
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html');
  assert.equal(
    isHtmlFallback,
    false,
    `[${tag}] Expected live frontend module at ${res.url}${context ? ` (${context})` : ''}, but Vite returned HTML SPA fallback (module does not exist yet)`,
  );
}

