import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { AI_DISCLOSURE } from './aiGuardrails';

/**
 * Firm-branded household plan PDF. Built with pdf-lib (CommonJS; @react-pdf/renderer 4.x is ESM-only and does not load in this backend). Shows only values already stored/projected; it adds no new advice, and always
 * carries the educational disclosure.
 */
export interface PlanSection { client: string; rows: Array<[string, string]> }
export interface PlanPdfInput { firmName: string; brandColor: string; household: string; generatedOn: string; sections: PlanSection[] }

export function flatten(value: unknown, prefix = ''): Array<[string, string]> {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [[prefix, String(value)]];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Standard fonts only cover WinAnsi; replace anything else so a stray character cannot fail the render.
const safe = (t: string) => t.replace(/[^\x20-\x7E]/g, '?');

export async function renderPlanPdf(p: PlanPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${safe(p.household)} plan`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const W = 612, H = 792, M = 40;
  const brand = hexToRgb(p.brandColor);
  const foot = safe(`${AI_DISCLOSURE} Educational illustration based on the inputs shown; not a recommendation.`);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const footer = () => {
    // Wrap the footer over two lines at 7pt.
    const mid = foot.lastIndexOf(' ', Math.floor(foot.length / 2));
    page.drawText(foot.slice(0, mid), { x: M, y: 30, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(foot.slice(mid + 1), { x: M, y: 21, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  };
  const newPage = () => { footer(); page = pdf.addPage([W, H]); y = H - M; };
  const band = () => {
    page.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: brand });
    page.drawText(safe(p.firmName), { x: M, y: H - 38, size: 18, font, color: rgb(1, 1, 1) });
    page.drawText(safe(`${p.household} household plan summary - ${p.generatedOn}`), { x: M, y: H - 58, size: 10, font, color: rgb(1, 1, 1) });
    y = H - 110;
  };
  band();
  for (const sec of p.sections) {
    if (y < 90) newPage();
    page.drawText(safe(sec.client), { x: M, y, size: 13, font, color: brand });
    y -= 18;
    const rows = sec.rows.length ? sec.rows : ([['No plan on file.', '']] as Array<[string, string]>);
    for (const [k, v] of rows) {
      if (y < 60) newPage();
      page.drawText(safe(k).slice(0, 60), { x: M, y, size: 9, font, color: rgb(0.33, 0.33, 0.33) });
      page.drawText(safe(v).slice(0, 50), { x: M + 300, y, size: 9, font, color: rgb(0, 0, 0) });
      page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
      y -= 14;
    }
    y -= 8;
  }
  footer();
  return Buffer.from(await pdf.save());
}
