# Agent rules for ankiscape-hiscores

- **Read-only site.** No accounts, no writes, no Supabase schema or RPC changes. Only the existing public `hiscores` RPC is called, and only from `functions/api/boards.js`.
- **No secrets in the repo.** The Supabase key is a Pages secret and, locally, `.dev.vars` (gitignored). Never print it. Never use the service-role key.
- **Usernames are user-chosen text.** Render with `textContent` only, never `innerHTML`.
- **Stay noindex** unless Wilson says otherwise. Do not add a `robots.txt` Disallow (a disallowed page cannot show its noindex).
- **No third-party requests, cookies or analytics.**
- **Do not deploy, add a remote, or touch DNS** unless Wilson says so in the current session. The Porkbun zone also carries live Resend mail records; never change or delete any existing record.
- **Level rules come from the add-on.** Do not edit `public/lib/rules.json` by hand; regenerate it and `tests/golden.json` from `~/Documents/AnkiScape`.
- **Look at the page** (screenshot, `read_image`) before reporting on any visual change. Tests passing does not mean it looks right.
