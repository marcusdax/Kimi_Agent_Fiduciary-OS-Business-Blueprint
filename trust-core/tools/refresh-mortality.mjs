#!/usr/bin/env node
/**
 * refresh-mortality.mjs — the reviewed path for updating the SSA life table.
 *
 * Gap 7 was that the mortality table is a 2023 vintage with no update process.
 * Automated fetching is not possible (ssa.gov returns 403 to every automated client —
 * verified with both bot and browser user agents), and fetching it silently would be
 * wrong anyway: a period life table is published once a year with the Trustees Report,
 * and an advisory model must be able to state which vintage it used.
 *
 * So the process is: a human saves the published page, this script validates and
 * converts it, and the change is reviewed like any other data change.
 *
 *   # 1. save https://www.ssa.gov/oact/STATS/table4c6.html as ssa.html
 *   node tools/refresh-mortality.mjs --input ssa.html --year 2023 --check
 *   node tools/refresh-mortality.mjs --input ssa.html --year 2023 --write
 *
 * --check compares the saved page with the shipped artefact and exits non-zero on any
 * difference, so a refresh is a deliberate, reviewable change rather than a surprise.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TARGET = join(ROOT, 'src', 'data', 'ssa-period-life-table-2023.json');
const AGE_START = 50;
const AGE_END = 119;

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const input = arg('--input');
const year = Number(arg('--year', '2023'));
const write = args.includes('--write');
const check = args.includes('--check');

if (!input) {
  console.error('usage: node tools/refresh-mortality.mjs --input ssa.html [--year 2023] [--check|--write]');
  process.exit(2);
}

/** Strip tags and decode the handful of entities the SSA table uses. */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/**
 * Rows look like: "65 0.016455 79,084 18.12 0.010188 87,399 20.66".
 *
 * Token scanning rather than line matching: the published page's whitespace and tag
 * structure change between years, but the seven-value row shape does not.
 */
function extract(html) {
  const tokens = textOf(html).split(' ').filter(Boolean);
  const male = [];
  const female = [];
  const num = (v) => Number(String(v).replace(/,/g, ''));

  for (let i = 0; i + 6 < tokens.length; i++) {
    const age = Number(tokens[i]);
    if (!Number.isInteger(age) || age < AGE_START || age > AGE_END) continue;
    const [tQxM, tLivesM, tLeM, tQxF, tLivesF, tLeF] = tokens.slice(i + 1, i + 7);
    if ([tQxM, tLivesM, tLeM, tQxF, tLivesF, tLeF].some((v) => v === undefined)) continue;

    const qxMale = num(tQxM);
    const qxFemale = num(tQxF);
    // Require both death probabilities to look like probabilities and both survivor
    // counts to be plausible. This rejects coincidental numeric runs in the page
    // without depending on the table's tag structure.
    if (!(qxMale > 0 && qxMale < 1) || !(qxFemale > 0 && qxFemale < 1)) continue;
    if (!(num(tLivesM) >= 1) || !(num(tLivesF) >= 1)) continue;
    if (male[age - AGE_START] !== undefined) continue;

    male[age - AGE_START] = qxMale;
    female[age - AGE_START] = qxFemale;
  }
  return { male, female };
}
function validate(name, series) {
  const problems = [];
  if (series.length !== AGE_END - AGE_START + 1) {
    problems.push(`${name}: expected ${AGE_END - AGE_START + 1} values for ages ${AGE_START}-${AGE_END}, found ${series.length}`);
  }
  for (let i = 0; i < series.length; i++) {
    const qx = series[i];
    if (typeof qx !== 'number' || !(qx > 0) || !(qx < 1)) {
      problems.push(`${name}: qx at age ${AGE_START + i} is not a probability in (0,1): ${qx}`);
    }
    if (i > 0 && typeof qx === 'number' && typeof series[i - 1] === 'number' && qx < series[i - 1] * 0.5) {
      problems.push(`${name}: implausible drop in mortality at age ${AGE_START + i} (${series[i - 1]} -> ${qx})`);
    }
  }
  return problems;
}

const html = await readFile(input, 'utf8');
const { male, female } = extract(html);
const problems = [...validate('male', male), ...validate('female', female)];

if (problems.length) {
  console.error(`refusing to use this file:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const doc = {
  id: `ssa-period-life-table-${year}`,
  title: `SSA Period Life Table, ${year}`,
  source: 'US Social Security Administration, Office of the Chief Actuary',
  sourceUrl: 'https://www.ssa.gov/oact/STATS/table4c6.html',
  license: 'Public domain — US Government work',
  retrievedAt: new Date().toISOString(),
  notes:
    `qx is the probability of dying within one year at exact age x. Reproduced from the published table for exact ` +
    `ages ${AGE_START}-${AGE_END}, the range used for retirement-income and annuity-factor work.`,
  ageStart: AGE_START,
  ageEnd: AGE_END,
  qx: { male, female },
};

if (check) {
  const existing = JSON.parse(await readFile(TARGET, 'utf8'));
  const diffs = [];
  for (const sex of ['male', 'female']) {
    for (let i = 0; i < male.length; i++) {
      if (existing.qx[sex][i] !== doc.qx[sex][i]) {
        diffs.push(`${sex} age ${AGE_START + i}: shipped ${existing.qx[sex][i]} vs source ${doc.qx[sex][i]}`);
      }
    }
  }
  if (diffs.length) {
    console.error(`mismatch against the shipped table (${diffs.length} value(s)):\n  ${diffs.slice(0, 20).join('\n  ')}`);
    process.exit(1);
  }
  console.log(`verified: the shipped table matches the supplied ${year} source for ages ${AGE_START}-${AGE_END}`);
  process.exit(0);
}

if (write) {
  await writeFile(TARGET, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`wrote ${TARGET}`);
  console.log('review the diff, bump the citation in provenance, and commit — this is a data change, not a refresh.');
  process.exit(0);
}

console.log(JSON.stringify({ extracted: { male: male.length, female: female.length }, sample: { age65Male: male[15], age65Female: female[15] } }, null, 2));
console.log('re-run with --check to compare against the shipped table, or --write to replace it.');
