// Rebuilds every number quoted in the article from data/results.csv.
// Usage: node scripts/summarize.mjs
import fs from 'node:fs';

const dataDir = new URL('../data/', import.meta.url);
const csv = fs.readFileSync(new URL('results.csv', dataDir), 'utf8');

const rows = [];
let row = [], cell = '', quoted = false;
for (let i = 0; i < csv.length; i++) {
  const c = csv[i];
  if (quoted) {
    if (c !== '"') cell += c;
    else if (csv[i + 1] === '"') { cell += '"'; i++; }
    else quoted = false;
  } else if (c === '"') quoted = true;
  else if (c === ',') { row.push(cell); cell = ''; }
  else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
  else cell += c;
}
row.push(cell);
rows.push(row);
const head = rows.shift();
const all = rows.map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));

const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null);
const escaped = r => r.finding === 'plain' || r.finding === 'partial';

function stats(list) {
  const outcomes = {};
  for (const r of list) outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
  const read = list.filter(r => r.outcome === 'read');
  const named = read.filter(r => +r.ai_bots_named > 0);
  const base = read.filter(r => +r.ai_bots_allowed > 0 && +r.wildcard_disallows > 0 && r.default_deny !== 'true');
  const hit = read.filter(escaped);
  const plain = read.filter(r => r.finding === 'plain');
  return {
    targets: list.length,
    outcomes,
    name_an_ai_crawler: named.length,
    name_an_ai_crawler_pct: pct(named.length, read.length),
    default_deny_excluded: read.filter(r => r.finding === 'default-deny').length,
    allow_ai_and_have_wildcard_rules: base.length,
    crawler_escapes_a_rule: hit.length,
    crawler_escapes_a_rule_pct: pct(hit.length, base.length),
    clearest_cases_plain: plain.length,
    clearest_cases_plain_pct: pct(plain.length, base.length),
  };
}

const top = all.filter(r => r.sample === 'tranco-top-10000');
const hits = top.filter(escaped);
const counts = hits.map(r => +r.rules_cancelled).sort((a, b) => a - b);
const crawlers = {};
for (const r of hits) for (const bot of r.bots_cancelling.split(' ')) crawlers[bot] = (crawlers[bot] || 0) + 1;
const inBand = (a, b) => top.filter(r => +r.rank >= a && +r.rank <= b);
const statuses = {};
for (const r of top.filter(r => r.outcome === 'no-file')) statuses[r.http_status] = (statuses[r.http_status] || 0) + 1;
const errors = {};
for (const r of top.filter(r => r.outcome === 'unreachable')) errors[r.error] = (errors[r.error] || 0) + 1;

const summary = {
  tranco_top_10000: stats(top),
  by_rank: {
    '1-1000': stats(inBand(1, 1000)),
    '1001-5000': stats(inBand(1001, 5000)),
    '5001-10000': stats(inBand(5001, 10000)),
  },
  rules_cancelled_per_site: {
    median: counts[counts.length >> 1],
    p90: counts[Math.floor(counts.length * 0.9)],
    max: counts.at(-1),
    total: counts.reduce((a, b) => a + b, 0),
  },
  sites_with_sensitive_word_rule: hits.filter(r => +r.sensitive_rules_cancelled > 0).length,
  sites_where_googlebot_escapes: top.filter(r => r.search_engines_cancelling.includes('googlebot')).length,
  sites_per_crawler: Object.fromEntries(Object.entries(crawlers).sort((a, b) => b[1] - a[1])),
  no_file_http_status: Object.fromEntries(Object.entries(statuses).sort((a, b) => b[1] - a[1])),
  unreachable_reason: Object.fromEntries(Object.entries(errors).sort((a, b) => b[1] - a[1])),
  regional_samples: {
    'mena-seo-agencies': stats(all.filter(r => r.sample === 'mena-seo-agencies')),
    'gulf-brands': stats(all.filter(r => r.sample === 'gulf-brands')),
  },
};

fs.writeFileSync(new URL('summary.json', dataDir), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary.tranco_top_10000, null, 2));
