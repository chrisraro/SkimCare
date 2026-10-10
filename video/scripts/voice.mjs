// Generates the voiceover with Kokoro (kokoro-js, runs locally on this machine)
// and sizes every scene in whole bars of the 120 BPM music grid (1 bar = 2 s),
// so each scene cut lands on a downbeat. Writes public/vo/*.wav + src/timings.json.
import { KokoroTTS } from 'kokoro-js';
import { mkdirSync, writeFileSync } from 'node:fs';

export const LINES = [
  { id: 'hook', minBars: 2, text: 'Be honest. You skim contracts. Most of us do.' },
  { id: 'problem', minBars: 3, text: 'But the fine print is where it costs you. Late fees. Auto-renewals.' },
  { id: 'local', minBars: 4, text: 'A cloud AI would need your name, your ID, and your debts. SkimCare keeps it all on your phone.' },
  { id: 'demo', minBars: 8, text: 'Scan the pages. A small open model, Qwen 3, reads them right on the device, and explains each term in plain English or Filipino. Every finding quotes its exact sentence, or it is thrown away. The money math is exact rules, never a guess.' },
  { id: 'why', minBars: 5, text: 'Local AI is not a feature here. It is why you can trust it with a contract. In our tests, it skipped all five hidden instructions aimed at the AI.' },
  { id: 'team', minBars: 3, text: 'We are team E S G. Christian Raro, and Glenn Viola.' },
  { id: 'close', minBars: 3, text: 'SkimCare. You skim. We read every line.' },
];

const VOICE = process.env.VOICE ?? 'af_heart';
const SPEED = Number(process.env.SPEED ?? 1.12);
const BAR_S = 2; // 120 BPM, 4/4
const LEAD_S = 0.25; // voice starts this long after the scene's downbeat
const TAIL_S = 0.3; // breathing room before the next cut

mkdirSync('public/vo', { recursive: true });
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });

const scenes = [];
for (const line of LINES) {
  const audio = await tts.generate(line.text, { voice: VOICE, speed: SPEED });
  const file = `vo/${line.id}.wav`;
  audio.save(`public/${file}`);
  const dur = audio.audio.length / audio.sampling_rate;
  const bars = Math.max(line.minBars, Math.ceil((dur + LEAD_S + TAIL_S) / BAR_S));
  scenes.push({ id: line.id, file, voDurationS: Number(dur.toFixed(3)), bars, text: line.text });
  console.log(`${line.id.padEnd(8)} ${dur.toFixed(2)}s -> ${bars} bars`);
}
const totalBars = scenes.reduce((a, s) => a + s.bars, 0);
writeFileSync('src/timings.json', JSON.stringify({ fps: 30, barFrames: 60, leadS: LEAD_S, voice: VOICE, speed: SPEED, totalBars, scenes }, null, 2));
console.log(`total ${totalBars} bars = ${totalBars * BAR_S}s`);
