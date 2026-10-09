# SkimCare landing page

Static marketing page for SkimCare: plain HTML, CSS and one small script. No build step, no dependencies.
Designed on the "SkimCare Brand & Landing" design canvas (direction: the page is a plain-language agreement that SkimCare annotates as you scroll).

- `index.html` — content (7 clauses, sample findings labelled fictional)
- `styles.css` — colours mirror `src/theme/tokens.ts`; fonts Newsreader + Instrument Sans (Google Fonts)
- `main.js` — scroll reveal: highlights each clause's key sentence, slides in its note, ticks the clause list. Content is fully visible without JS and with reduced motion.
- `assets/` — copies of `assets/icon.png` and `assets/favicon.png`
- `vercel.json` — security headers (CSP allows only this site's script and Google Fonts), clean URLs

Preview locally:

```bash
python -m http.server 8130 --directory site
```

## Deploy (Vercel)

The repo is private; only `site/` is served, so app code never ships with the page.

- Import `chrisraro/SkimCare` (grant the Vercel GitHub app access to this repo only).
- Framework Preset **Other** · Root Directory **`site`** · Build Command empty (override on) · Output Directory default · no environment variables.
- Settings → Git → Ignored Build Step: `git diff --quiet HEAD^ HEAD -- .` (deploy only when `site/` changes).
- Keep preview deployments behind Vercel Authentication; leave Web Analytics and Speed Insights off.

Do not link to the private GitHub repo from the page (visitors get a 404). The download button shows "Android build coming soon" until a public APK link exists; swap it for a real `<a class="btn btn-primary" href="...">` then.

Rules from the PRD still apply here: do not present Demo-engine output as real inference, do not claim offline readiness, no invented users or stats.
