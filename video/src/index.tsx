// SkimCare 60-second showcase (AppBuildersPH Hackathon 2026, team ESG).
// Scenes sit on the 120 BPM music grid from src/timings.json: each scene starts
// exactly on a downbeat (where the music has its impact) and transitions run
// for TRANS frames after it. Voiceover: Kokoro (kokoro-js), generated locally.
import React from 'react';
import {
  AbsoluteFill, Composition, Img, Sequence, interpolate, registerRoot, spring,
  staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender, Easing,
} from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import timings from './timings.json';
import { SCREENS } from './screens';
import './app.css';

const FPS = 30;
const BAR = 60; // frames per bar (2 s at 120 BPM)
const BEAT = 15;
const TRANS = 12;
const RING_OUT = 75; // final chord after the last bar
const C = { navy: '#14273E', navy9: '#0F1E31', paper: '#FFFBF2', teal: '#0A6E6C', teal5: '#12A09E', mint: '#5FD0C9', hl: '#F2D27A', coral: '#A2352B', coralBg: '#FBE4E1', muted: '#9AABBF' };
const SERIF = 'Newsreader, Georgia, serif';
const SANS = '"Instrument Sans", system-ui, sans-serif';
const ION_ALERT = String.fromCodePoint(0xf113);
const ION_SCAN = String.fromCodePoint(0xf55a);

type SceneT = { id: string; file: string; voDurationS: number; bars: number };
const SCENES = timings.scenes as SceneT[];
const startFrame = (i: number) => SCENES.slice(0, i).reduce((a, s) => a + s.bars * BAR, 0);
export const TOTAL_FRAMES = timings.totalBars * BAR + RING_OUT;
const LEAD = Math.round(timings.leadS * FPS);

// ---------- fonts: the app's own Newsreader + Instrument Sans, and the Ionicons subset ----------
const FONTS: [string, string, string, string][] = [
  ['Instrument Sans', 'InstrumentSans_400Regular.ttf', '400', 'normal'],
  ['Instrument Sans', 'InstrumentSans_600SemiBold.ttf', '600', 'normal'],
  ['Instrument Sans', 'InstrumentSans_700Bold.ttf', '700', 'normal'],
  ['Newsreader', 'Newsreader_500Medium.ttf', '500', 'normal'],
  ['Newsreader', 'Newsreader_500Medium_Italic.ttf', '500', 'italic'],
  ['Ionicons', 'ionicons-subset.woff2', '400', 'normal'],
];
if (typeof document !== 'undefined') {
  const handle = delayRender('Loading fonts');
  Promise.all(FONTS.map(([fam, file, weight, style]) => {
    const f = new FontFace(fam, `url(${staticFile('fonts/' + file)})`, { weight, style });
    return f.load().then((l) => document.fonts.add(l));
  })).then(() => continueRender(handle));
}

// ---------- motion helpers ----------
const useSpringIn = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } });
};
const Rise: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties; y?: number }> = ({ delay = 0, children, style, y = 40 }) => {
  const p = useSpringIn(delay);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>;
};
/** Words land one by one, in time with the voiceover. */
const Words: React.FC<{ text: string; delay?: number; every?: number; style?: React.CSSProperties; accent?: string[] }> = ({ text, delay = 0, every = 4, style, accent = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 0.26em', ...style }}>
      {text.split(' ').map((w, i) => {
        const p = spring({ frame: frame - delay - i * every, fps, config: { damping: 15, mass: 0.5 } });
        const isAccent = accent.includes(w.replace(/[.,]/g, ''));
        return (
          <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 0.5}em)`, filter: `blur(${(1 - p) * 6}px)`, color: isAccent ? C.teal5 : undefined, fontStyle: isAccent ? 'italic' : undefined }}>{w}</span>
        );
      })}
    </div>
  );
};
/** Soft glow that pulses on every kick (every beat = 15 frames). */
const BeatGlow: React.FC<{ color?: string; strength?: number }> = ({ color = C.teal5, strength = 0.22 }) => {
  const frame = useCurrentFrame();
  const k = Math.exp(-(frame % BEAT) / 5);
  const a = Math.round(Math.min(1, 0.12 + k * strength) * 255).toString(16).padStart(2, '0');
  return <AbsoluteFill style={{ background: `radial-gradient(60% 55% at 50% 55%, ${color}${a}, transparent 70%)` }} />;
};
const Grain: React.FC = () => (
  <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
);
const Label: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.mint }) => (
  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', color }}>{children}</div>
);

// ---------- the 1:1 app replica (markup + styles from the landing page's Exhibit A) ----------
const PhoneScreen: React.FC<{ index: number; scroll?: number; html?: string }> = ({ index, scroll = 0, html }) => (
  <div className="app">
    <div className="scr is-on" style={{ transition: 'none' }}>
      <div style={{ position: 'absolute', inset: 0 }} dangerouslySetInnerHTML={{ __html: (html ?? SCREENS[index]).replace('class="a-body', `style="transform:translateY(${-scroll}px)" class="a-body`) }} />
    </div>
  </div>
);
const Phone: React.FC<{ children: React.ReactNode; scale?: number }> = ({ children, scale = 1 }) => (
  <div style={{ width: 390 * scale + 28, height: 844 * scale + 28, borderRadius: 64 * scale, background: C.navy9, padding: 14, boxSizing: 'border-box', boxShadow: '0 60px 120px -40px rgba(0,0,0,.7), inset 0 0 0 3px #2A3F5C', position: 'relative' }}>
    <div style={{ width: 390 * scale, height: 844 * scale, borderRadius: 50 * scale, overflow: 'hidden', position: 'relative', background: '#F2F4F7' }}>
      <div style={{ width: 390, height: 844, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute' }}>{children}</div>
      <div style={{ position: 'absolute', top: 10 * scale, left: '50%', width: 96 * scale, height: 28 * scale, marginLeft: -48 * scale, borderRadius: 999, background: C.navy9, zIndex: 9 }} />
    </div>
  </div>
);

// ---------- scenes ----------
const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const skim = interpolate(frame, [0, 120], [0, -900], { easing: Easing.inOut(Easing.quad) });
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill style={{ padding: '80px 380px', filter: 'blur(2.5px)', opacity: 0.55, transform: `translateY(${skim}px)` }}>
        {Array.from({ length: 44 }, (_, i) => (
          <div key={i} style={{ height: 14, margin: '18px 0', borderRadius: 7, background: '#C7D0DB', width: `${[96, 88, 92, 70, 99, 84, 60][i % 7]}%` }} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(255,251,242,0.2), rgba(255,251,242,0.92) 45%, rgba(255,251,242,0.2))' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
        <Words text="Be honest." delay={4} style={{ fontFamily: SANS, fontWeight: 600, fontSize: 48, color: '#4A6380' }} />
        <Words text="You skim contracts." delay={18} every={5} accent={['skim']} style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 150, letterSpacing: -4, color: C.navy, lineHeight: 1 }} />
        <Words text="Most of us do." delay={64} style={{ fontFamily: SANS, fontWeight: 600, fontSize: 44, color: '#4A6380' }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const FinePrint: React.FC<{ text: string; hi: string; delay: number; chip: string }> = ({ text, hi, delay, chip }) => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame - delay, [6, 26], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const [before, after] = text.split(hi);
  return (
    <Rise delay={delay} style={{ background: '#fff', borderRadius: 28, padding: '30px 38px', width: 1240, display: 'flex', alignItems: 'center', gap: 30, boxShadow: '0 30px 60px -30px rgba(0,0,0,.6)' }}>
      <div style={{ flex: 1, fontFamily: SERIF, fontSize: 38, lineHeight: 1.35, color: C.navy }}>
        “{before}<span style={{ backgroundImage: `linear-gradient(${C.hl},${C.hl})`, backgroundRepeat: 'no-repeat', backgroundSize: `${sweep}% 100%`, borderRadius: 6, padding: '0 4px' }}>{hi}</span>{after}”
      </div>
      <Rise delay={delay + 18} y={20}>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, color: C.coral, background: C.coralBg, borderRadius: 999, padding: '10px 20px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Ionicons' }}>{ION_ALERT}</span>{chip}
        </span>
      </Rise>
    </Rise>
  );
};
const SceneProblem: React.FC = () => (
  <AbsoluteFill style={{ background: C.navy }}>
    <BeatGlow color={C.coral} strength={0.12} />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 34 }}>
      <Words text="The fine print is where it costs you." delay={2} accent={['costs']} style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 84, color: C.paper, letterSpacing: -2, marginBottom: 20 }} />
      <FinePrint delay={56} text="A late payment fee of five percent (5%) shall be charged for every month or fraction thereof." hi="late payment fee of five percent (5%)" chip="Needs attention" />
      <FinePrint delay={92} text="This Agreement shall automatically renew for successive one-year terms." hi="automatically renew" chip="Needs attention" />
    </AbsoluteFill>
    <Grain />
  </AbsoluteFill>
);

const SceneLocal: React.FC = () => {
  const frame = useCurrentFrame();
  const strike = interpolate(frame, [92, 112], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.navy9 }}>
      <BeatGlow />
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 130 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, width: 620 }}>
          <Rise><Label color={C.muted}>A cloud AI would need</Label></Rise>
          {['Your name', 'Your ID', 'Your debts'].map((c, i) => {
            const p = spring({ frame: frame - 14 - i * 14, fps: FPS, config: { damping: 14 } });
            const dim = interpolate(frame, [96, 120], [1, 0.4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div key={c} style={{ position: 'relative', alignSelf: 'flex-start', opacity: p * dim, transform: `translateX(${(1 - p) * -60}px)`, fontFamily: SERIF, fontSize: 78, color: C.paper }}>
                {c}
                <div style={{ position: 'absolute', left: -8, top: '54%', height: 6, width: `calc(${strike}% + 16px)`, background: C.coral, borderRadius: 3 }} />
              </div>
            );
          })}
        </div>
        <Rise delay={118} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
          <Img src={staticFile('img/icon.png')} style={{ width: 260, height: 260, borderRadius: 64, boxShadow: `0 0 0 ${8 + Math.exp(-(frame % BEAT) / 4) * 12}px rgba(18,160,158,.2)` }} />
          <div style={{ fontFamily: SERIF, fontSize: 66, color: C.paper, textAlign: 'center', lineHeight: 1.1 }}>SkimCare keeps it<br /><em style={{ color: C.mint }}>on your phone.</em></div>
          <div style={{ display: 'flex', gap: 14 }}>
            {['0 uploads', '0 accounts', 'Works offline'].map((t, i) => (
              <Rise key={t} delay={150 + i * 8} y={18}><span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, color: C.mint, border: `2px solid ${C.mint}55`, borderRadius: 999, padding: '10px 20px' }}>{t}</span></Rise>
            ))}
          </div>
        </Rise>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};

// Demo: screens switch on bar lines; captions follow the voiceover.
const DEMO_STEPS = [
  { screen: 1, bars: 1, title: 'Scan the pages', sub: 'Edges found, pages straightened' },
  { screen: 3, bars: 2, title: 'Read on the device', sub: 'OCR + Qwen3 0.6B, fully offline' },
  { screen: 4, bars: 2, title: 'Plain English or Filipino', sub: 'Every term gets a status in words' },
  { screen: 5, bars: 2, title: 'Quotes its source', sub: 'No matching sentence? Thrown away.' },
  { screen: 6, bars: 2, title: 'Exact math, never a guess', sub: '₱2,000 on time · ₱2,100 late' },
];
const processingHtml = (f: number) => {
  const done = Math.min(5, Math.floor(f / 22)); // the five pipeline steps advance
  let i = 0;
  return SCREENS[3].replace(/a-step is-done/g, () => {
    const cls = i < done ? 'is-done' : i === done ? 'is-active' : 'is-wait';
    i += 1;
    return `a-step ${cls}`;
  });
};
const SceneDemo: React.FC = () => {
  const frame = useCurrentFrame();
  let acc = 0;
  const steps = DEMO_STEPS.map((s) => { const st = { ...s, from: acc }; acc += s.bars * BAR; return st; });
  const cur = steps.reduce((k, s, i) => (frame >= s.from ? i : k), 0);
  const step = steps[cur];
  const local = frame - step.from;
  const enter = spring({ frame: local, fps: FPS, config: { damping: 16, mass: 0.6 } });
  const scrollFor = (screen: number) => {
    if (screen === 4) return interpolate(local, [24, 74], [0, 470], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
    if (screen === 6) return interpolate(local, [30, 80], [0, 520], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
    return 0;
  };
  const tilt = interpolate(frame, [0, acc], [-7, 5]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(90% 90% at 70% 50%, #1D3654, ${C.navy9})` }}>
      <BeatGlow strength={0.16} />
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 150px', gap: 110 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Label>How it reads</Label>
          <div style={{ display: 'flex', gap: 10 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ height: 8, flex: i === cur ? 3 : 1, borderRadius: 4, background: i <= cur ? C.mint : '#2A3F5C' }} />
            ))}
          </div>
          <div style={{ opacity: enter, transform: `translateX(${(1 - enter) * -50}px)` }}>
            <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 104, lineHeight: 1.02, letterSpacing: -2, color: C.paper }}>{step.title}</div>
            <div style={{ marginTop: 22, fontFamily: SANS, fontSize: 40, color: C.muted }}>{step.sub}</div>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 22, color: '#647386', marginTop: 30, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Ionicons', fontSize: 24 }}>{ION_SCAN}</span>App screens, 1:1 · built-in fictional sample
          </div>
        </div>
        <div style={{ transform: `perspective(1800px) rotateY(${tilt}deg) translateY(${(1 - Math.min(1, frame / 20)) * 120}px)` }}>
          <Phone scale={1.12}>
            {steps.map((s, i) => {
              const vis = i === cur ? 1 : i === cur - 1 ? 1 - enter : 0;
              if (vis <= 0) return null;
              const x = i === cur ? (1 - enter) * 390 : -enter * 120;
              const f = i === cur ? local : s.bars * BAR;
              return (
                <div key={i} style={{ position: 'absolute', inset: 0, transform: `translateX(${x}px)`, opacity: i === cur ? 1 : vis }}>
                  <PhoneScreen index={s.screen} html={s.screen === 3 ? processingHtml(f) : undefined} scroll={i === cur ? scrollFor(s.screen) : 0} />
                </div>
              );
            })}
          </Phone>
        </div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ big: string; label: string; delay: number }> = ({ big, label, delay }) => (
  <Rise delay={delay} style={{ flex: 1, background: 'rgba(255,251,242,0.06)', border: '1px solid rgba(255,251,242,0.12)', borderRadius: 28, padding: '34px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={{ fontFamily: SERIF, fontSize: 92, color: C.mint, lineHeight: 1 }}>{big}</div>
    <div style={{ fontFamily: SANS, fontSize: 30, color: C.paper, lineHeight: 1.3 }}>{label}</div>
  </Rise>
);
const SceneWhy: React.FC = () => (
  <AbsoluteFill style={{ background: C.navy }}>
    <BeatGlow strength={0.2} />
    <AbsoluteFill style={{ padding: '110px 170px', flexDirection: 'column', gap: 36, justifyContent: 'center' }}>
      <Words text="Local AI is not a feature here." delay={4} accent={['Local', 'AI']} style={{ justifyContent: 'flex-start', fontFamily: SERIF, fontWeight: 500, fontSize: 96, letterSpacing: -2, color: C.paper }} />
      <Words text="It's why you can trust it with a contract." delay={60} style={{ justifyContent: 'flex-start', fontFamily: SANS, fontWeight: 600, fontSize: 48, color: C.muted }} />
      <div style={{ display: 'flex', gap: 28, marginTop: 24 }}>
        <Stat delay={140} big="5 / 5" label="hidden instructions aimed at the AI, skipped in our tests" />
        <Stat delay={155} big="Every" label="finding shown quotes its exact source sentence" />
        <Stat delay={170} big="0" label="uploads: your document never leaves the phone" />
      </div>
      <Rise delay={195} style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {['Qwen3 0.6B', 'llama.cpp', 'Google ML Kit, on device', 'SQLCipher', 'Expo + React Native'].map((t) => (
          <span key={t} style={{ fontFamily: SANS, fontWeight: 600, fontSize: 26, color: C.paper, background: 'rgba(18,160,158,0.18)', borderRadius: 999, padding: '10px 22px' }}>{t}</span>
        ))}
      </Rise>
    </AbsoluteFill>
    <Grain />
  </AbsoluteFill>
);

const Member: React.FC<{ initial: string; name: string; role: string; delay: number }> = ({ initial, name, role, delay }) => (
  <Rise delay={delay} style={{ width: 660, background: C.paper, borderRadius: 32, padding: '40px 44px', display: 'flex', gap: 34, alignItems: 'center', boxShadow: '0 40px 80px -40px rgba(0,0,0,.6)' }}>
    <div style={{ width: 130, height: 130, borderRadius: '50%', background: C.navy, color: C.paper, display: 'grid', placeItems: 'center', fontFamily: SERIF, fontSize: 70, flex: 'none' }}>{initial}</div>
    <div>
      <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 58, color: C.navy, lineHeight: 1.05 }}>{name}</div>
      <div style={{ fontFamily: SANS, fontSize: 28, color: '#3D4A5A', marginTop: 10, lineHeight: 1.3 }}>{role}</div>
    </div>
  </Rise>
);
const SceneTeam: React.FC = () => (
  <AbsoluteFill style={{ background: C.navy9 }}>
    <BeatGlow strength={0.18} />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 60 }}>
      <Rise style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
        <Label color={C.muted}>Team</Label>
        <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 170, color: C.paper, letterSpacing: -4, lineHeight: 0.9 }}>ESG</span>
      </Rise>
      <div style={{ display: 'flex', gap: 40 }}>
        <Member delay={36} initial="C" name="Christian Raro" role="Product, design and the app" />
        <Member delay={60} initial="G" name="Glenn Viola" role="On-device AI and evidence checks" />
      </div>
    </AbsoluteFill>
    <Grain />
  </AbsoluteFill>
);

const SceneClose: React.FC = () => {
  const frame = useCurrentFrame();
  const p = spring({ frame, fps: FPS, config: { damping: 12, mass: 0.7 } });
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <BeatGlow strength={frame < 180 ? 0.22 : 0.05} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
        <div style={{ transform: `scale(${0.6 + p * 0.4}) rotate(${(1 - p) * -12}deg)`, opacity: p }}>
          <Img src={staticFile('img/icon.png')} style={{ width: 190, height: 190, borderRadius: 46 }} />
        </div>
        <Rise delay={8} style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 120, color: C.paper, letterSpacing: -3 }}>Skim<em style={{ color: C.mint }}>Care</em></Rise>
        <Words text="You skim. We read every line." delay={30} accent={['read']} style={{ fontFamily: SERIF, fontSize: 64, color: C.paper }} />
        <Rise delay={70} style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 40, color: C.muted }}>Unawain bago pirmahan.</Rise>
        <Rise delay={96} style={{ display: 'flex', gap: 40, marginTop: 26, fontFamily: SANS, fontWeight: 600, fontSize: 30, color: C.mint }}>
          <span>skimcare.vercel.app</span><span style={{ color: '#4A6380' }}>·</span><span>github.com/chrisraro/SkimCare</span>
        </Rise>
        <Rise delay={110} style={{ fontFamily: SANS, fontSize: 26, color: C.muted, marginTop: 8 }}>Team ESG · AppBuildersPH Hackathon 2026 · Local AI · #AppBuildersPH</Rise>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  );
};

const RENDER: Record<string, React.FC> = { hook: SceneHook, problem: SceneProblem, local: SceneLocal, demo: SceneDemo, why: SceneWhy, team: SceneTeam, close: SceneClose };
const PRESENT = [
  () => wipe({ direction: 'from-left' }),
  () => slide({ direction: 'from-right' }),
  () => slide({ direction: 'from-bottom' }),
  () => wipe({ direction: 'from-right' }),
  () => slide({ direction: 'from-left' }),
  () => fade(),
];

// The music ducks under the voice.
const voWindows = SCENES.map((s, i) => [startFrame(i) + LEAD, startFrame(i) + LEAD + Math.ceil(s.voDurationS * FPS)]);
const musicVolume = (f: number) => (voWindows.some(([a, b]) => f >= a - 6 && f <= b + 6) ? 0.26 : 0.6);

export const Showcase: React.FC = () => (
  <AbsoluteFill style={{ background: C.navy9 }}>
    <Audio src={staticFile('music.wav')} volume={musicVolume} />
    <TransitionSeries>
      {SCENES.flatMap((s, i) => {
        const Comp = RENDER[s.id];
        const last = i === SCENES.length - 1;
        const nodes = [
          <TransitionSeries.Sequence key={s.id} durationInFrames={s.bars * BAR + (last ? RING_OUT : TRANS)}>
            <Comp />
            <Sequence from={LEAD}><Audio src={staticFile(s.file)} /></Sequence>
          </TransitionSeries.Sequence>,
        ];
        if (!last) nodes.push(<TransitionSeries.Transition key={s.id + '-t'} presentation={PRESENT[i % PRESENT.length]()} timing={linearTiming({ durationInFrames: TRANS })} />);
        return nodes;
      })}
    </TransitionSeries>
  </AbsoluteFill>
);

const RemotionRoot: React.FC = () => (
  <Composition id="Showcase" component={Showcase} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);
registerRoot(RemotionRoot);
