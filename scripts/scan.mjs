// Bulk scan: reads /robots.txt only, one request per host, nothing else on the site.
// Usage: UV_THREADPOOL_SIZE=32 node scan.mjs <dataDir>
// The larger thread pool matters: with Node's default of 4, DNS lookups queue up
// behind each other and sites look unreachable when they are not.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { analyse, looksLikeRobots } from './robots-lib.mjs';

const dataDir = process.argv[2];
const CONCURRENCY = 16, TIMEOUT_MS = 10000, RETRY_TIMEOUT_MS = 25000, MAX_BYTES = 524288;
const UA = 'Mozilla/5.0 (compatible; robots-ai-allowlist-study/1.0)';

const top = fs.readFileSync(path.join(dataDir, 'tranco-K9YYW-top10000.csv'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(l => { const [rank, domain] = l.split(','); return { sample: 'tranco-top-10000', rank: +rank, domain }; });
const extra = JSON.parse(fs.readFileSync(path.join(dataDir, 'extra-samples.json'), 'utf8'));
const targets = [...top, ...Object.entries(extra).flatMap(([sample, list]) => list.map(domain => ({ sample, rank: '', domain: domain.replace(/^www\./, '') })))];

async function fetchOne(host, timeout) {
  const res = await fetch(`https://${host}/robots.txt`, {
    headers: { 'user-agent': UA, accept: 'text/plain,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(timeout),
  });
  const text = (await res.text()).slice(0, MAX_BYTES);
  return { status: res.status, text, finalUrl: res.url };
}

async function scan(t, timeout) {
  const base = { sample: t.sample, rank: t.rank, domain: t.domain };
  let lastStatus = '', lastError = '';
  for (const host of [t.domain, 'www.' + t.domain]) {
    try {
      const r = await fetchOne(host, timeout);
      lastStatus = r.status;
      if (r.status !== 200) continue;
      if (!looksLikeRobots(r.text)) return { ...base, outcome: 'not-a-robots-file', http_status: 200, final_url: r.finalUrl };
      const sha = crypto.createHash('sha256').update(r.text).digest('hex');
      return { ...base, outcome: 'read', http_status: 200, final_url: r.finalUrl, bytes: r.text.length, sha256: sha, ...analyse(r.text), raw: r.text };
    } catch (e) { lastError = e.cause?.code || e.name || 'error'; }
  }
  return { ...base, outcome: lastStatus ? 'no-file' : 'unreachable', http_status: lastStatus, error: lastError };
}

async function pool(items, timeout, onDone) {
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) { const idx = i++; onDone(idx, await scan(items[idx], timeout)); }
  }));
}

// Each finished site is appended to the checkpoint, so a stopped run resumes
// where it left off. Saved rows are re-analysed with the current rules.
const checkpoint = path.join(dataDir, 'scan-checkpoint.jsonl');
const key = t => `${t.sample}|${t.domain}`;
const saved = new Map();
if (fs.existsSync(checkpoint)) {
  for (const line of fs.readFileSync(checkpoint, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    saved.set(key(r), r.outcome === 'read' ? { ...r, ...analyse(r.raw) } : r);
  }
}
const save = r => fs.appendFileSync(checkpoint, JSON.stringify(r) + '\n');

const started = new Date().toISOString();
const results = targets.map(t => saved.get(key(t)));
const todo = results.flatMap((r, idx) => (r ? [] : [idx]));
console.log(`resumed ${saved.size}, to scan ${todo.length}`);
let done = 0;
await pool(todo.map(idx => targets[idx]), TIMEOUT_MS, (i, r) => {
  results[todo[i]] = r;
  save(r);
  if (++done % 100 === 0) console.log(`${new Date().toISOString().slice(11, 19)} ${done}/${todo.length}`);
});
const retry = results.map((r, idx) => ({ r, idx })).filter(x => x.r.outcome === 'unreachable');
console.log('retrying unreachable:', retry.length);
await pool(retry.map(x => targets[x.idx]), RETRY_TIMEOUT_MS, (i, r) => { results[retry[i].idx] = r; save(r); });
const finished = new Date().toISOString();

const cols = ['sample','rank','domain','outcome','http_status','final_url','bytes','sha256','has_wildcard_group','wildcard_disallows','default_deny','ai_bots_named','ai_bots_blocked','ai_bots_allowed','finding','bots_cancelling','plain_bots','rules_cancelled','sensitive_rules_cancelled','sensitive_examples','search_engines_cancelling','error'];
const esc = v => { const s = Array.isArray(v) ? v.join(' ') : (v ?? ''); return /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s); };
fs.writeFileSync(path.join(dataDir, 'results.csv'), [cols.join(','), ...results.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));

const flagged = results.filter(r => ['plain', 'partial', 'default-deny'].includes(r.finding));
fs.writeFileSync(path.join(dataDir, 'flagged-robots-files.jsonl.gz'), zlib.gzipSync(flagged.map(r => JSON.stringify({ domain: r.domain, sample: r.sample, final_url: r.final_url, sha256: r.sha256, finding: r.finding, robots_txt: r.raw })).join('\n')));
fs.writeFileSync(path.join(dataDir, 'run-info.json'), JSON.stringify({ started, finished, resumed_rows: saved.size, tranco_list_id: 'K9YYW', tranco_date: '2026-11-05', user_agent: UA, concurrency: CONCURRENCY, timeout_ms: TIMEOUT_MS, retry_timeout_ms: RETRY_TIMEOUT_MS, targets: targets.length, node: process.version }, null, 2));
console.log('DONE', started, finished);
