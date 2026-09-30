// Mix music + SFX (+ voice-over), master to -14 LUFS integrated / -1 dBTP, mux into every format.
//
//   node <skill>/scripts/mix.mjs <film> [--music-db 0] [--sfx-db 0] [--vo-db 2] [--no-mux]
//
// Reads  <film>/audio/music.wav (beats.py or the film's own score), sfx.wav (sfx.mjs), vo.wav (optional)
// Writes <film>/audio/mix.wav, then out/<film>/final.mp4 (primary format = film.json formats[0])
//        and out/<film>/final_<format>.mp4 for the others, from out/<film>/video_<format>.mp4.
// Music ducks under the voice (sidechain). Loudness: gain + 4x-oversampled limiter, measured with
// ebur128 and corrected until it lands within 0.1 LU.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const film = args[0];
if (!film || film.startsWith('--')) { console.error('usage: mix.mjs <film> [--music-db] [--sfx-db] [--vo-db] [--no-mux]'); process.exit(1); }
const num = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const ROOT = process.cwd();
const A = path.join(ROOT, film, 'audio');
const OUT = path.join(ROOT, 'out', film);
const cfgPath = path.join(ROOT, film, 'film.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
const DUR = Number(cfg.duration || 15);
const TARGET = -14, CEIL_DB = -1.3;

function ff(argv, quiet = true) {
  const r = spawnSync('ffmpeg', ['-hide_banner', ...(quiet ? ['-loglevel', 'error'] : []), '-y', ...argv], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr}`);
  return r.stderr;
}
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  return { I: Number(/I:\s+(-?[\d.]+) LUFS/.exec(s)[1]), TP: Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(s)[1]) };
}

const stems = [['music', num('music-db', 0)], ['sfx', num('sfx-db', 0)], ['vo', num('vo-db', 2)]]
  .map(([k, db]) => ({ k, db, file: path.join(A, `${k}.wav`) })).filter((s) => fs.existsSync(s.file));
if (!stems.length) { console.error(`no stems in ${path.relative(ROOT, A)}/ (music.wav, sfx.wav, vo.wav)`); process.exit(1); }

// ---------------- sum (with ducking) -> pre-master
const inputs = stems.flatMap((s) => ['-i', s.file]);
const chains = stems.map((s, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${DUR},atrim=0:${DUR},volume=${s.db}dB[${s.k}]`);
const has = (k) => stems.some((s) => s.k === k);
let graph = chains.join(';');
const mixIn = [];
if (has('vo') && has('music')) {
  graph += ';[vo]asplit=2[vo1][vokey];[music][vokey]sidechaincompress=threshold=0.02:ratio=6:attack=12:release=280:makeup=1[musicd]';
  mixIn.push('[musicd]', '[vo1]');
} else {
  if (has('music')) mixIn.push('[music]');
  if (has('vo')) mixIn.push('[vo]');
}
if (has('sfx')) mixIn.push('[sfx]');
graph += `;${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:duration=longest,afade=t=out:st=${DUR - 0.3}:d=0.3[out]`;
const pre = path.join(A, '_premaster.wav');
ff([...inputs, '-filter_complex', graph, '-map', '[out]', '-c:a', 'pcm_f32le', '-ar', '48000', pre]);

// ---------------- master: gain -> 4x oversampled limiter -> measure -> correct
const master = path.join(A, 'mix.wav');
let gain = TARGET - loudness(pre).I, m;
for (let i = 0; i < 6; i++) {
  ff(['-i', pre, '-af', `volume=${gain.toFixed(3)}dB,aresample=192000,alimiter=limit=${10 ** (CEIL_DB / 20)}:attack=1:release=60:level=0:asc=1:latency=1,aresample=48000`,
    '-c:a', 'pcm_s24le', '-ar', '48000', master]);
  m = loudness(master);
  if (Math.abs(m.I - TARGET) <= 0.1) break;
  gain += TARGET - m.I;
}
fs.rmSync(pre);
console.log(`mix: ${stems.map((s) => `${s.k} ${s.db >= 0 ? '+' : ''}${s.db} dB`).join(', ')}${has('vo') && has('music') ? ', music ducked under vo' : ''}`);
console.log(`master: ${m.I.toFixed(1)} LUFS integrated, true peak ${m.TP.toFixed(1)} dBTP -> ${path.relative(ROOT, master)}`);
if (Math.abs(m.I - TARGET) > 0.3 || m.TP > -1.0) console.log('WARNING: loudness/peak outside spec; check the stems for a runaway level');

// ---------------- mux
if (!args.includes('--no-mux')) {
  const formats = cfg.formats || ['16x9'];
  const vids = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /^video_(.+)\.mp4$/.test(f)) : [];
  if (!vids.length) console.log(`no out/${film}/video_<format>.mp4 yet: node <skill>/scripts/render.mjs --film ${film} --format <f> --video-only`);
  for (const v of vids) {
    const fmt = /^video_(.+)\.mp4$/.exec(v)[1];
    const dst = path.join(OUT, fmt === formats[0] ? 'final.mp4' : `final_${fmt}.mp4`);
    ff(['-i', path.join(OUT, v), '-i', master, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
      '-t', String(DUR), '-movflags', '+faststart', dst]);
    console.log(`-> ${path.relative(ROOT, dst)}`);
  }
}
