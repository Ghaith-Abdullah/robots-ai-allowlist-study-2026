// Check one site: node check.mjs example.com
// Lists the wildcard rules that each named AI crawler no longer has to follow.
import { analyse, looksLikeRobots, parseRobots, groupFor, isAllowed } from './robots-lib.mjs';

const input = process.argv[2];
if (!input) { console.log('Usage: node check.mjs example.com'); process.exit(1); }
const host = input.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

const res = await fetch(`https://${host}/robots.txt`, { headers: { 'user-agent': 'robots-ai-allowlist-check/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
const text = await res.text();
if (res.status !== 200 || !looksLikeRobots(text)) {
  console.log(`No usable robots.txt at https://${host}/robots.txt (HTTP ${res.status}).`);
  process.exit(0);
}

const r = analyse(text);
console.log(`\n${res.url}`);
console.log(`Wildcard Disallow rules: ${r.wildcard_disallows}`);
console.log(`AI crawlers named: ${r.ai_bots_named} (${r.ai_bots_blocked} fully blocked, ${r.ai_bots_allowed} allowed)`);

if (r.finding === 'none') console.log('\nResult: no named AI crawler escapes your wildcard rules.');
if (r.finding === 'default-deny') console.log('\nResult: your wildcard group blocks everything and AI crawlers are allowed by exception. That is an explicit allow-list, so this check does not apply.');
if (r.finding === 'plain' || r.finding === 'partial') {
  console.log(`\nResult: ${r.rules_cancelled} wildcard rule(s) do not apply to: ${r.bots_cancelling.join(', ')}`);
  const groups = parseRobots(text);
  const wild = groupFor(groups, '*');
  for (const bot of r.bots_cancelling) {
    const rules = groupFor(groups, bot);
    const open = wild.filter(w => w.type === 'disallow' && w.path !== '/' && isAllowed(rules, w.path.replace(/\$$/, '').replace(/\*/g, 'a')));
    console.log(`\n${bot}: ${open.length} rule(s), for example`);
    open.slice(0, 8).forEach(w => console.log(`  ${w.path}`));
  }
  console.log('\nFix: repeat the rules you want inside each named group, or delete the named group so the bot falls back to User-agent: *.');
}
if (r.search_engines_cancelling.length) console.log(`\nNote: the same applies to ${r.search_engines_cancelling.join(', ')}.`);
