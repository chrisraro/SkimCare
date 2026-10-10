# SkimCare showcase video (60 s)

Remotion project for the AppBuildersPH Hackathon 2026 demo video (team ESG).

- **Voiceover:** [Kokoro](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) through `kokoro-js`, generated locally (`scripts/voice.mjs`, voice `af_heart`). It also sizes each scene in whole 2-second bars.
- **Music:** original, synthesized in code (`scripts/music.mjs`). 120 BPM, A minor, with a riser into every scene cut and an impact on the downbeat. No samples or licensed audio.
- **Video:** `src/index.tsx`. The app screens are the 1:1 replicas from the landing page (`src/screens.ts`, `src/app.css`, generated from `site/`), with the app's own fonts and Ionicons.

```bash
npm install
npm run voice      # public/vo/*.wav + src/timings.json
npm run music      # public/music.wav (follows timings.json)
npm run studio     # preview
npm run render     # out/skimcare-showcase.mp4 (1920x1080, 30 fps)
```

Script claims were checked against the repo's facts with Jev (`typesafe-jev`).
