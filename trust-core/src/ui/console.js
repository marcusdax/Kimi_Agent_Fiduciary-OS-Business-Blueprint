/**
 * console.js — the provenance console.
 *
 * Rules this file follows, because they are the difference between a demo and a
 * product screen:
 *
 *  1. **No innerHTML with server data.** Every value is inserted with textContent, so a
 *     provider string can never become markup.
 *  2. **No number without a receipt.** Every rendered figure is paired with the
 *     provenance of the value it came from; a value whose provenance is missing or
 *     placeholder is visibly flagged, not silently shown.
 *  3. **Failure is visible.** A failed call renders the error where the answer would
 *     have been, with the status — never an empty panel that looks like zero.
 *  4. **Keyboard first.** Every control is a real button, input or select, and the
 *     result regions are aria-live so a screen reader hears the update.
 */
import {
  describeProvenance,
  money,
  percent,
  rate,
  compactNumber,
  DISCLOSURE,
} from './format.js';

const TOKEN_KEY = 'fidos.token';

/** Tiny DOM helper. Attributes are set as attributes; `text` uses textContent. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key === 'class') node.className = value;
    else if (key === 'on') for (const [evt, fn] of Object.entries(value)) node.addEventListener(evt, fn);
    else if (key === 'dataset') for (const [k, v] of Object.entries(value)) node.dataset[k] = String(v);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const $ = (id) => document.getElementById(id);

// ---- State -----------------------------------------------------------------
let token = sessionStorage.getItem(TOKEN_KEY) ?? '';

function setStatus(kind, text) {
  const status = $('status');
  status.classList.toggle('ok', kind === 'ok');
  status.classList.toggle('err', kind === 'err');
  $('statusText').textContent = text;
}

function setHint(text, kind = '') {
  const hint = $('connectHint');
  hint.textContent = text;
  hint.className = `hint ${kind}`.trim();
}

/** One place that knows how to call the API, and how to fail. */
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth && token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json?.error?.code ?? 'unknown';
    err.requestId = json?.requestId;
    throw err;
  }
  return json;
}

// ---- Provenance receipt ----------------------------------------------------

function badge(view) {
  const label = view.mustWarn ? `${view.freshnessLabel} — not for client use` : view.freshnessLabel;
  return el('span', { class: `badge ${view.freshness}`, text: label, title: view.freshnessLabel });
}

/**
 * The receipt. This is the product: a compact, inspectable statement of where a number
 * came from, when it was observed, what it may be used for, and how it was produced.
 */
function receipt(provenance) {
  const view = describeProvenance(provenance);
  const box = el('div', { class: 'receipt' }, el('div', { class: 'top' }, badge(view)));

  const top = box.firstChild;
  top.append(el('span', { class: 'src', text: view.label }));
  top.append(el('span', { class: 'chip', text: view.kindLabel }));
  top.append(el('span', { class: 'chip', text: `${view.asOfLabel} · ${view.ageLabel}` }));
  if (view.sourceUrl) {
    top.append(el('a', { href: view.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: 'source ↗' }));
  }

  if (view.method) box.append(el('p', { class: 'method', text: view.method }));
  box.append(el('p', { class: 'method', text: `Licence: ${view.license}` }));
  if (view.derivedFrom.length) {
    box.append(el('p', { class: 'method', text: `Derived from: ${view.derivedFrom.join(' · ')}` }));
  }
  if (view.mustWarn) {
    box.append(
      el('div', {
        class: 'warnbar',
        text: 'This value is not backed by a live source. It must not be presented to a client.',
      }),
    );
  }
  return box;
}

function figure(label, value) {
  return el('div', { class: 'figure' }, el('span', { class: 'k', text: label }), el('span', { class: 'v', text: value }));
}

function showError(container, err) {
  container.replaceChildren(
    el('p', { class: 'error', text: `${err.message}${err.status ? ` (HTTP ${err.status})` : ''}` }),
    err.requestId ? el('p', { class: 'muted', text: `request id ${err.requestId}` }) : null,
  );
}

// ---- Tax -------------------------------------------------------------------

async function computeTax(event) {
  event?.preventDefault();
  const target = $('taxResult');
  target.replaceChildren(el('p', { class: 'placeholder', text: 'Computing…' }));

  const payload = {
    taxYear: Number($('taxYear').value),
    filingStatus: $('filingStatus').value,
    ordinaryIncome: Number($('ordinaryIncome').value || 0),
    preferentialIncome: Number($('preferentialIncome').value || 0),
  };

  try {
    const res = await api('/api/v1/calculations/tax', { method: 'POST', body: payload });
    const d = res.data;
    const figures = el(
      'div',
      { class: 'figures' },
      figure('Total federal tax', money(d.totalFederalTax)),
      figure('Ordinary tax', money(d.ordinaryTax)),
      figure('Capital gains tax', money(d.capitalGainsTax)),
      figure('Marginal rate', rate(d.marginalRate)),
      figure('Effective rate', rate(d.effectiveRate)),
      figure('Taxable income', money(d.taxableIncome)),
    );

    const parts = [figures, receipt(res.provenance)];
    if (Array.isArray(d.exclusions) && d.exclusions.length) {
      parts.push(
        el(
          'div',
          {},
          el('p', { class: 'method', text: 'What this figure does not include:' }),
          el('ul', { class: 'exclusions' }, ...d.exclusions.map((x) => el('li', { text: x }))),
        ),
      );
    }
    parts.push(el('p', { class: 'method', text: DISCLOSURE }));
    target.replaceChildren(...parts);
  } catch (err) {
    showError(target, err);
  }
}

// ---- Macro -----------------------------------------------------------------

async function loadMacro() {
  const target = $('macro');
  target.replaceChildren(el('p', { class: 'placeholder', text: 'Loading…' }));
  try {
    const res = await api('/api/v1/macro');
    const { inflation, rates } = res;
    target.replaceChildren(
      el(
        'div',
        { class: 'kpis' },
        figure('CPI, year over year', percent(inflation.latestYoyPct, 2)),
        figure('10-year Treasury', percent(rates.tenYearPct, 2)),
        figure('10-year real yield', percent(rates.realYield10yPct, 2)),
        figure('10y–2y spread', rates.spread10y2yPct === null ? '—' : percent(rates.spread10y2yPct, 2)),
      ),
      receipt(inflation.provenance),
      receipt(res.provenance.curve),
    );
  } catch (err) {
    showError(target, err);
  }
}

// ---- Ledger ----------------------------------------------------------------

async function loadLedger() {
  const target = $('ledger');
  target.replaceChildren(el('p', { class: 'placeholder', text: 'Loading…' }));
  try {
    const head = await api('/api/v1/ledger/head');
    const kv = el(
      'dl',
      { class: 'kv' },
      el('dt', { text: 'Ledger' }),
      el('dd', { text: head.ledgerId }),
      el('dt', { text: 'Entries' }),
      el('dd', { text: compactNumber(head.length) }),
      el('dt', { text: 'Head hash' }),
      el('dd', { text: head.head?.hash ?? '—' }),
      el('dt', { text: 'Chain' }),
      el('dd', { text: head.verification.valid ? 'verified on read' : 'BROKEN' }),
    );
    target.replaceChildren(kv);
  } catch (err) {
    showError(target, err);
  }
}

async function verifyLedger() {
  const target = $('ledger');
  const button = $('verifyLedger');
  button.disabled = true;
  try {
    const bundle = await api('/api/v1/ledger/export');
    const result = await api('/api/v1/ledger/verify', { method: 'POST', body: { bundle } });
    const box = el('div', { class: `verify ${result.valid ? 'ok' : 'err'}` });
    box.textContent = result.valid
      ? `Verified ${result.checked} entr${result.checked === 1 ? 'y' : 'ies'}. Head ${result.headHash.slice(0, 16)}… Every hash and every link recomputed.`
      : `Verification FAILED at entry ${result.brokenAt ?? '?'}: ${result.reason}`;
    target.append(box);
  } catch (err) {
    target.append(el('div', { class: 'verify err', text: err.message }));
  } finally {
    button.disabled = false;
  }
}

// ---- Sources ---------------------------------------------------------------

async function loadSources() {
  const target = $('sources');
  target.replaceChildren(el('p', { class: 'placeholder', text: 'Loading…' }));
  try {
    const res = await api('/api/v1/data-sources', { auth: false });
    const cards = res.sources.map((s) =>
      el(
        'div',
        { class: 'source' },
        el('div', { class: 'name' }, s.name, el('span', { class: 'chip', text: s.freshness })),
        el('div', { class: 'meta', text: `Licence: ${s.license}` }),
        el('div', { class: 'chips' }, ...s.backs.map((b) => el('span', { class: 'chip', text: b }))),
      ),
    );
    target.replaceChildren(...cards);
  } catch (err) {
    showError(target, err);
  }
}

// ---- Connection ------------------------------------------------------------

async function connect(candidate) {
  token = candidate;
  sessionStorage.setItem(TOKEN_KEY, token);
  try {
    await api('/api/v1/calculations/tax/years');
    setStatus('ok', 'Connected · scoped token');
    setHint('Connected. Requests are scoped to the token you supplied.', 'ok');
    await Promise.all([loadMacro(), loadLedger(), loadSources()]);
    return true;
  } catch (err) {
    setStatus('err', 'Not authorised');
    setHint(err.status === 401 ? 'That token was rejected.' : err.message, 'err');
    return false;
  }
}

async function devToken() {
  setHint('Requesting a development token…');
  try {
    const res = await api('/api/v1/auth/token', {
      method: 'POST',
      auth: false,
      body: { sub: 'console:local', scopes: ['calc:read', 'ledger:read', 'advice:write'] },
    });
    $('token').value = res.token;
    await connect(res.token);
  } catch (err) {
    setHint(
      err.status === 403
        ? 'Token issuing is disabled in production — supply a token from your identity provider.'
        : `Could not issue a token: ${err.message}`,
      'err',
    );
  }
}

// ---- Wire ------------------------------------------------------------------

$('taxForm').addEventListener('submit', computeTax);
$('refreshMacro').addEventListener('click', loadMacro);
$('verifyLedger').addEventListener('click', verifyLedger);
$('devTokenBtn').addEventListener('click', devToken);
$('connectBtn').addEventListener('click', () => {
  const value = $('token').value.trim();
  if (!value) {
    setHint('Paste a token first.', 'err');
    return;
  }
  void connect(value);
});
$('token').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('connectBtn').click();
  }
});

$('disclosure').textContent = DISCLOSURE;

// A token from a previous session is reused, but never assumed to still be valid.
if (token) {
  $('token').value = token;
  void connect(token);
} else {
  setStatus('', 'Not connected');
  setHint('Paste a bearer token, or use “Get dev token” in a development build.');
}
