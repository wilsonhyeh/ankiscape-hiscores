# ankiscape-hiscores

Read-only public Hiscores page for [AnkiScape](https://github.com/wilsonhyeh/ankiscape), planned for `hiscores.ankiscape.xyz`. It shows the same username, level and XP as the Hiscores inside the add-on. Nothing is written back.

- **Page:** `public/` (plain HTML/CSS/ES modules, no build step, no dependencies at runtime).
- **Data:** `functions/api/boards.js` (a Cloudflare Pages Function) fetches all seven boards from Supabase's `hiscores` RPC and caches the merged result at the edge for 60 s. The Supabase key lives only in a Pages secret (`SUPABASE_KEY`); it is never in this repo or the page.
- **Level math:** `public/lib/` is a port of the add-on's `evolved/ui/hiscores_model.py` and `evolved/logic_pure.py`. `tests/golden.json` is generated from the add-on's real Python (`scripts/make-golden.py`), so the port cannot drift silently.
- **Not indexed:** `X-Robots-Tag: noindex, nofollow` and a robots meta tag. Remove both to allow search engines.

## Run locally

```bash
npm ci
# One-time: put the add-on's public publishable key in .dev.vars (gitignored)
#   SUPABASE_KEY=<value of SUPABASE_ANON_KEY in ~/Documents/AnkiScape/evolved/prod_config.py>
npm run dev          # http://localhost:8788/
```

## Check

```bash
npm run verify       # unit + parity tests, no-secrets, no-external, browser checks (Chromium)
node scripts/screenshots.mjs http://localhost:8788   # screenshots into evidence/ (gitignored)
```

If the add-on's `shared/rules-v1.json` changes, regenerate both copies: update `public/lib/rules.json` and run `python3 scripts/make-golden.py`.

## Deploy

Not automated. Cloudflare Pages **Direct Upload** (no Git source, no hosted build), same model as fleuron.study:

```bash
npx wrangler pages secret put SUPABASE_KEY --project-name ankiscape-hiscores
npx wrangler pages deploy public --project-name ankiscape-hiscores --branch main
```

The plan, decisions and approval points are in `~/Documents/HQ/plans/ankiscape-public-hiscores-site.md`.

## Rules

- Never commit a key. `npm run check:no-secrets` fails on any Supabase publishable or secret key prefix, JWT, or service-role marker.
- Never use the Supabase service-role key here. This site only reads.
- The page makes no third-party requests and sets no cookies (`npm run check:no-external`).
- `wrangler.toml` `compatibility_date` must not be newer than the installed `workerd` supports (the dev server refuses to start otherwise).
