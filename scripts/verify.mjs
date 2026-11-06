// Re-checks every flagged site with a separate parser, robots-parser on npm.
// Usage: npm install robots-parser, then node scripts/verify.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { parseRobots, groupFor, isAllowed, analyse } from './robots-lib.mjs';

const require = createRequire(import.meta.url);
const robotsParser = require('robots-parser');

const file = new URL('../data/flagged-robots-files.jsonl.gz', import.meta.url);
const rows = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').trim().split('\n')
  .map(l => JSON.parse(l))
  .filter(r => r.finding === 'plain' || r.finding === 'partial');

const samplePath = p => {
  const s = p.replace(/\$$/, '').replace(/\*/g, 'a');
  return s.startsWith('/') ? s : '/' + s;
};

let sitesOk = 0, tested = 0, agreed = 0;
const unconfirmed = [];

for (const r of rows) {
  const { bots_cancelling } = analyse(r.robots_txt);
  const groups = parseRobots(r.robots_txt);
  const wild = groupFor(groups, '*');
  const origin = new URL(r.final_url).origin;
  const other = robotsParser(`${origin}/robots.txt`, r.robots_txt);
  let confirmed = 0;

  for (const bot of bots_cancelling) {
    const rules = groupFor(groups, bot);
    for (const w of wild) {
      if (w.type !== 'disallow' || w.path === '/') continue;
      const p = samplePath(w.path);
      if (isAllowed(wild, p) || !isAllowed(rules, p)) continue;
      const url = origin + p;
      try { new URL(url); } catch { continue; }
      tested++;
      if (other.isAllowed(url, 'SomeOtherCrawler') === false && other.isAllowed(url, bot) === true) {
        confirmed++;
        agreed++;
      }
    }
  }
  if (confirmed) sitesOk++;
  else unconfirmed.push(r.domain);
}

console.log(`Sites confirmed: ${sitesOk} of ${rows.length}`);
console.log(`Rule checks agreed: ${agreed} of ${tested} (${(100 * agreed / tested).toFixed(2)}%)`);
console.log(`Not confirmed: ${unconfirmed.join(', ') || 'none'}`);
