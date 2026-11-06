// RFC 9309 parsing and matching. No dependencies.
// A crawler obeys only the most specific matching group. Groups for the same
// token are merged, and the "*" group applies only when no named group matches.

export const AI_BOTS = [
  'gptbot', 'oai-searchbot', 'chatgpt-user',
  'claudebot', 'claude-searchbot', 'claude-user', 'anthropic-ai',
  'perplexitybot', 'perplexity-user',
  'bytespider', 'ccbot', 'amazonbot', 'meta-externalagent', 'cohere-ai',
  'duckassistbot', 'mistralai-user', 'google-cloudvertexbot',
];
export const SEARCH_BOTS = ['googlebot', 'bingbot'];

// Paths whose names suggest the owner did not want them crawled. Label only.
const SENSITIVE = /(admin|login|logout|signin|signup|account|cart|checkout|basket|private|internal|api\b|api\/|wp-json|session|order|payment|profile|search)/i;

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if ((key === 'allow' || key === 'disallow') && value) current.rules.push({ type: key, path: value });
  }
  return groups;
}

export function groupFor(groups, token) {
  const matched = groups.filter(g => g.agents.includes(token));
  return matched.length ? matched.flatMap(g => g.rules) : null;
}

// "*" matches any run of characters and a final "$" anchors the end. This walks
// the pattern once instead of using a regex: real files contain rules with 88
// asterisks in a row, which send a backtracking regex into effectively endless work.
const compiled = new Map();
function compile(pattern) {
  let c = compiled.get(pattern);
  if (!c) {
    const anchored = pattern.endsWith('$');
    c = { anchored, parts: (anchored ? pattern.slice(0, -1) : pattern).split('*') };
    compiled.set(pattern, c);
  }
  return c;
}

function matches(pattern, path) {
  const { anchored, parts } = compile(pattern);
  if (!path.startsWith(parts[0])) return false;
  let pos = parts[0].length;
  const last = parts.length - 1;
  for (let i = 1; i < last; i++) {
    const at = path.indexOf(parts[i], pos);
    if (at === -1) return false;
    pos = at + parts[i].length;
  }
  if (last === 0) return !anchored || path === parts[0];
  if (!anchored) return path.indexOf(parts[last], pos) !== -1;
  return path.length - parts[last].length >= pos && path.endsWith(parts[last]);
}

// Longest match wins. Allow wins a tie. No match means allowed.
export function isAllowed(rules, path) {
  let best = null;
  for (const rule of rules) {
    if (!matches(rule.path, path)) continue;
    const len = rule.path.length;
    if (!best || len > best.len || (len === best.len && rule.type === 'allow')) best = { len, type: rule.type };
  }
  return !best || best.type === 'allow';
}

// Turn a Disallow pattern into a concrete path that the pattern matches.
function samplePath(pattern) {
  let p = pattern.replace(/\$$/, '').replace(/\*/g, 'a');
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

function cancelledBy(botRules, wildRules) {
  const out = [];
  for (const rule of wildRules) {
    if (rule.type !== 'disallow' || rule.path === '/') continue;
    const path = samplePath(rule.path);
    if (isAllowed(wildRules, path)) continue;       // the wildcard group itself allows it
    if (isAllowed(botRules, path)) out.push(rule.path);
  }
  return out;
}

export function analyse(text) {
  const groups = parseRobots(text);
  const wild = groupFor(groups, '*');
  const wildRules = wild ?? [];
  const wildDisallows = wildRules.filter(r => r.type === 'disallow');
  const defaultDeny = !isAllowed(wildRules, '/');

  const bots = [];
  for (const token of AI_BOTS) {
    const rules = groupFor(groups, token);
    if (!rules) continue;
    const blocked = !isAllowed(rules, '/');
    const cancelled = blocked || defaultDeny ? [] : cancelledBy(rules, wildRules);
    bots.push({ token, blocked, plain: rules.every(r => r.type === 'allow'), ruleCount: rules.length, cancelled });
  }

  const allowing = bots.filter(b => !b.blocked);
  const cancelling = allowing.filter(b => b.cancelled.length);
  const cancelledRules = [...new Set(cancelling.flatMap(b => b.cancelled))];
  const plainCancelling = cancelling.filter(b => b.plain);

  let finding = 'none';
  if (defaultDeny && allowing.length) finding = 'default-deny';
  else if (plainCancelling.length) finding = 'plain';
  else if (cancelling.length) finding = 'partial';

  const engines = SEARCH_BOTS.filter(t => {
    const r = groupFor(groups, t);
    return r && !defaultDeny && isAllowed(r, '/') && cancelledBy(r, wildRules).length;
  });

  return {
    has_wildcard_group: !!wild,
    wildcard_disallows: wildDisallows.filter(r => r.path !== '/').length,
    default_deny: defaultDeny,
    ai_bots_named: bots.length,
    ai_bots_blocked: bots.filter(b => b.blocked).length,
    ai_bots_allowed: allowing.length,
    finding,
    bots_cancelling: cancelling.map(b => b.token),
    plain_bots: plainCancelling.map(b => b.token),
    rules_cancelled: cancelledRules.length,
    sensitive_rules_cancelled: cancelledRules.filter(r => SENSITIVE.test(r)).length,
    sensitive_examples: cancelledRules.filter(r => SENSITIVE.test(r)).slice(0, 6),
    search_engines_cancelling: engines,
  };
}

export const looksLikeRobots = t => !/^\s*<(!doctype|html)/i.test(t) && /user-agent\s*:/i.test(t);
