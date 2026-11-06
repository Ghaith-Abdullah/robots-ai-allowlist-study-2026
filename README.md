# Robots.txt AI allow-list study, November 2026

How often does giving an AI crawler its own `robots.txt` group exempt it from the site's `User-agent: *` rules?

**Result:** among the Tranco top 10,000, 479 sites allow at least one named AI crawler and also keep site-wide `Disallow` rules. On **340 of them (71.0%)**, at least one AI crawler no longer has to follow at least one of those rules. On 214 (44.7%), that crawler's group has no `Disallow` rule at all.

Article: [71% of Top Sites Allowing AI Crawlers Cancel Their Own robots.txt Rules](https://blog.ghayth-abdallah.com/blog/robots-txt-ai-crawler-allow-rules-study-2026)

## Check your own site

You need [Node.js](https://nodejs.org) 20 or later. There is nothing else to install.

```
node scripts/check.mjs example.com
```

It reads your public `robots.txt` and lists each wildcard rule that each named AI crawler no longer has to follow. It checks one site at a time and sends nothing to us.

## Why this happens

[RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) says a crawler obeys the group that matches its name, and uses `User-agent: *` only if no group matches. Groups are not combined, so this file does not block GPTBot from `/cart/`:

```
User-agent: *
Disallow: /cart/

User-agent: GPTBot
Allow: /
```

To fix it, delete the named group so the crawler falls back to `*`, or repeat the rules you want inside that group.

## Results

Tranco top 10,000. `data/summary.json` holds these and more, and `node scripts/summarize.mjs` rebuilds it.

| Measure | Sites |
|---|---|
| Domains targeted | 10,000 |
| Readable `robots.txt` | 5,707 |
| Name at least one of the 17 AI crawlers | 1,573 (27.6%) |
| Default-deny files, excluded | 43 |
| Allow an AI crawler and have wildcard `Disallow` rules | 479 |
| A crawler escapes at least one rule | **340 (71.0%)** |
| Clearest cases (`plain`) | 214 (44.7%) |

| Tranco rank | Base | Escaped | Rate |
|---|---|---|---|
| 1 to 1,000 | 64 | 38 | 59.4% |
| 1,001 to 5,000 | 194 | 136 | 70.1% |
| 5,001 to 10,000 | 221 | 166 | 75.1% |

Rules canceled per affected site: median 14, 90th percentile 68, maximum 606.

## Definitions

- **`plain`:** a crawler has its own group with no `Disallow` rules, and it escapes at least one wildcard rule. This is the clearest case.
- **`partial`:** a crawler has its own rules, but they leave out at least one wildcard rule.
- **`default-deny`:** the wildcard group blocks everything and AI crawlers are allowed by exception. This is a deliberate allow-list, so these files are excluded.
- **`none`:** no named AI crawler escapes a wildcard rule.

**The test.** For each wildcard `Disallow` rule other than `/`, the script builds one sample path that the rule matches. A crawler has escaped the rule if the wildcard group blocks that path and the crawler's own group allows it. Crawlers blocked at `/` are not counted.

**The crawlers.** GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, anthropic-ai, PerplexityBot, Perplexity-User, Bytespider, CCBot, Amazonbot, meta-externalagent, cohere-ai, DuckAssistBot, MistralAI-User and Google-CloudVertexBot. Google-Extended and Applebot-Extended are left out because they are control tokens, not crawlers.

## What this does not show

- **Intent.** A `plain` result may be deliberate. The data shows what a file says, not what its owner meant.
- **Crawler behaviour.** Nothing here shows that any crawler visited any path. We only read `robots.txt` files.
- **Exposure.** `robots.txt` is not access control. A canceled rule is an ignored crawl preference, not a security hole or leaked data.
- **Every site.** Tranco ranks domains, including CDNs and DNS hosts. Results apply to sites with a readable file.
- **Today.** This is a snapshot from 6 November 2026, and files change.

`sensitive_rules_cancelled` is a word match on paths such as `admin`, `login`, `cart` and `api`. It is a rough label, not a review.

## Method

- **Sample:** Tranco list [K9YYW](https://tranco-list.eu/list/K9YYW/1000000), dated 5 November 2026, frozen top 10,000. Two small regional samples of 30 domains each and two of our own sites were added and are reported separately. The 30 MENA SEO agencies are anonymized as `agency-01` to `agency-30`, in shuffled order, because the sample is too small to say anything fair about one firm. Their rows keep the measured counts and drop the domain, URL, size, hash and rule examples.
- **Fetching:** `https://<domain>/robots.txt`, then the `www.` host. Only that file is requested, with the user agent `Mozilla/5.0 (compatible; robots-ai-allowlist-study/1.0)`.
- **Parsing:** RFC 9309. A crawler uses the most specific matching group, groups for the same token are merged, the longest match wins, and `Allow` wins a tie.

### Coverage

| Outcome | Tranco domains |
|---|---|
| Read | 5,707 |
| Unreachable | 2,150 |
| No file (non-200 response) | 1,586 |
| Response was not a robots file | 557 |

Of the unreachable domains, 1,376 had no DNS record and many others are infrastructure hosts such as `akamai.net`. A slow retest of 200 random unreachable domains read 8 files, which suggests about 4% of this group were missed.

The 1,586 "no file" results include 850 `403` responses. Some of those sites may have a file and be refusing the request.

### Three scan passes, all on 6 November 2026

1. **06:01 UTC:** stopped after 2,531 domains. The first matcher converted rules to regular expressions, and `weatherbug.net` has rules with 88 asterisks in a row, which caused endless backtracking. The 2,531 finished rows were saved from memory. The matcher was rewritten without regular expressions, and it gave identical results on all 1,396 files read by then.
2. **07:43 to 08:33 UTC:** finished the remaining domains at 40 parallel requests. A slow retest then found 55 of 200 "unreachable" domains readable. Node's default of 4 worker threads had queued DNS lookups until they timed out.
3. **08:39 to 09:02 UTC:** rescanned every unreachable domain at 16 parallel requests with 32 worker threads. Readable files rose from 4,811 to 5,707.

Both faults were in our scanner, not in the sites. `data/run-info.json` records the last pass only.

## Verification

- **Second parser:** `scripts/verify.mjs` re-tests every flagged site with [robots-parser](https://www.npmjs.com/package/robots-parser). It confirmed 345 of 347 sites and agreed on 98.73% of 46,609 rule checks. The script here prints 340 of 342, because the raw files of 5 flagged sites outside the Tranco sample are not published. Differences we inspected involved query strings or brackets in sample paths, which that library normalises.
- **The two unconfirmed sites:** `dinamalar.com` and `chavesnamao.com.br` have crawler groups with no rules. Under RFC 9309 such a group has nothing to block, while robots-parser falls back to `*`. They stay in the count because this study follows the RFC.
- **By hand:** the sites named in the article were read by hand and re-fetched after the scan. Each file matched the scanned copy exactly.

## Files

| File | Contents |
|---|---|
| `data/results.csv` | One row per domain |
| `data/summary.json` | Every aggregate number |
| `data/flagged-robots-files.jsonl.gz` | Raw `robots.txt` for each `plain`, `partial` and `default-deny` site, with SHA-256, except the withheld regional sites |
| `data/tranco-K9YYW-top10000.csv` | The frozen sample |
| `data/extra-samples.json` | The Gulf and own-site samples. The agency list is withheld |
| `data/run-info.json` | Settings of the final pass |
| `scripts/robots-lib.mjs` | Parser and analysis |
| `scripts/scan.mjs` | Bulk scanner. Run it with `UV_THREADPOOL_SIZE=32` |
| `scripts/check.mjs` | Single-site checker |
| `scripts/summarize.mjs` | Rebuilds `summary.json` |
| `scripts/verify.mjs` | Second-parser check. Needs `npm install robots-parser` |

### `results.csv` columns

| Column | Meaning |
|---|---|
| `sample` | `tranco-top-10000`, `mena-seo-agencies`, `gulf-brands` or `own-sites` |
| `rank` | Tranco rank, empty for the other samples |
| `domain` | Domain tested |
| `outcome` | `read`, `not-a-robots-file`, `no-file` or `unreachable` |
| `http_status` | Last HTTP status |
| `final_url` | URL after redirects |
| `bytes` | Length of the file as read |
| `sha256` | Hash of the file as read |
| `has_wildcard_group` | The file has a `User-agent: *` group |
| `wildcard_disallows` | Wildcard `Disallow` rules, not counting `/` |
| `default_deny` | The wildcard group blocks `/` |
| `ai_bots_named` | Listed AI crawlers with a group |
| `ai_bots_blocked` | Of those, blocked at `/` |
| `ai_bots_allowed` | Of those, not blocked at `/` |
| `finding` | `plain`, `partial`, `default-deny` or `none` |
| `bots_cancelling` | Crawlers that escape at least one wildcard rule |
| `plain_bots` | Of those, crawlers with no `Disallow` rules |
| `rules_cancelled` | Distinct wildcard rules escaped by any crawler |
| `sensitive_rules_cancelled` | Of those, rules matching the word list |
| `sensitive_examples` | Up to six such rules |
| `search_engines_cancelling` | Googlebot or Bingbot if the same applies to them |
| `error` | Failure reason for unreachable domains |

## Related tool

Check one site with `scripts/check.mjs` above. To write the corrected file visually, [Analytics by Ghaith](https://analytics.ghayth-abdallah.com) includes a robots.txt builder with AI crawler presets, available to trial users, active web development or SEO clients with free basic accounts, and paid subscribers. It builds files. It does not run bulk scans.

## License

Code is MIT and our data is CC BY 4.0. See [LICENSE](LICENSE). Please cite "Ghaith Abdullah, Robots.txt AI allow-list study, November 2026". The Tranco list and the `robots.txt` files remain the property of their owners.
