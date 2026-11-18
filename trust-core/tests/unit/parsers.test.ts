import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFredCsv } from '../../src/sources/fred.ts';
import { parseTreasuryCurveCsv, CURVE_TENORS } from '../../src/sources/treasury.ts';

describe('FRED CSV parsing', () => {
  test('parses the modern observation_date header', () => {
    const csv = 'observation_date,DGS10\n2026-11-05,4.12\n2026-11-06,4.09\n';
    const rows = parseFredCsv(csv);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], { date: '2026-11-06', value: 4.09 });
  });

  test('parses the legacy DATE header', () => {
    const rows = parseFredCsv('DATE,CPIAUCSL\n2026-01-01,320.5\n');
    assert.deepEqual(rows, [{ date: '2026-01-01', value: 320.5 }]);
  });

  test('missing observations become null, never zero', () => {
    const rows = parseFredCsv('observation_date,T10YIE\n2026-11-04,.\n2026-11-05,2.31\n');
    assert.equal(rows[0]?.value, null);
    assert.equal(rows[1]?.value, 2.31);
  });

  test('drops rows that are not ISO dates so a header change cannot shift the series', () => {
    const rows = parseFredCsv('observation_date,DGS10\n\nnot-a-date,4.1\n2026-11-06,4.09\n');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.date, '2026-11-06');
  });

  test('returns empty for a truncated body rather than throwing deep in a caller', () => {
    assert.deepEqual(parseFredCsv('observation_date,DGS10'), []);
    assert.deepEqual(parseFredCsv(''), []);
  });
});

describe('Treasury par-yield parsing', () => {
  const header = `Date,${CURVE_TENORS.map((t) => `"${t}"`).join(',')}`;
  const csv = [
    header,
    '11/06/2026,4.30,4.31,4.28,4.20,4.15,4.05,3.95,3.80,3.75,3.90,4.05,4.12,4.70,4.68',
    '11/05/2026,4.29,4.30,4.27,4.19,4.14,4.04,3.94,3.79,3.74,3.89,4.04,4.11,4.69,4.67',
  ].join('\n');

  test('parses quoted tenor headers and US date format', () => {
    const rows = parseTreasuryCurveCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[1]?.date, '2026-11-06');
    assert.equal(rows[1]?.yields['10 Yr'], 4.12);
    assert.equal(rows[1]?.yields['30 Yr'], 4.68);
  });

  test('sorts oldest-first so the last row is always the latest', () => {
    const rows = parseTreasuryCurveCsv(csv);
    assert.deepEqual(rows.map((r) => r.date), ['2026-11-05', '2026-11-06']);
  });

  test('skips N/A cells instead of coercing them to zero', () => {
    const withNa = [header, '11/06/2026,N/A,4.31,4.28,4.20,4.15,4.05,3.95,3.80,3.75,3.90,4.05,4.12,4.70,4.68'].join('\n');
    const rows = parseTreasuryCurveCsv(withNa);
    assert.equal(rows[0]?.yields['1 Mo'], undefined);
    assert.equal(rows[0]?.yields['10 Yr'], 4.12);
  });

  test('tolerates a BOM and CRLF line endings', () => {
    const bom = `\uFEFF${header}\r\n11/06/2026,4.30,4.31,4.28,4.20,4.15,4.05,3.95,3.80,3.75,3.90,4.05,4.12,4.70,4.68\r\n`;
    const rows = parseTreasuryCurveCsv(bom);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.yields['2 Yr'], 3.80);
  });
});
