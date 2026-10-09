# SkimCare landing page

Static marketing page for SkimCare: plain HTML, CSS and one small script. No build step, no dependencies.
Designed on the "SkimCare Brand & Landing" design canvas (direction: the page is a plain-language agreement that SkimCare annotates as you scroll).

- `index.html` — content (7 clauses, sample findings labelled fictional)
- `styles.css` — colours mirror `src/theme/tokens.ts`; fonts Newsreader + Instrument Sans (Google Fonts)
- `main.js` — scroll reveal: highlights each clause's key sentence, slides in its note, ticks the clause list. Content is fully visible without JS and with reduced motion.
- `assets/` — copies of `assets/icon.png` and `assets/favicon.png`

Preview locally:

```bash
python -m http.server 8130 --directory site
```

Deploy: any static host (GitHub Pages, Netlify, Vercel) with `site/` as the publish directory.

Before launch: replace `[TEAM NAMES]` in the footer, and point the download buttons (currently the GitHub Releases page) at the real APK.
Rules from the PRD still apply here: do not present Demo-engine output as real inference, do not claim offline readiness, no invented users or stats.
