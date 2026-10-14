# Changelog

## 1.3.0 - 2026-10-14

Lessons from a 2.5-minute lyric video with ~20 three.js sets, folded back into the skill.

- **Music and lyric videos.** `beats.py --full` keeps a whole supplied song as the soundtrack (film.json's
  duration follows). New `scripts/lyrics.py` (Demucs vocal stem, two Whisper models, a draft lyric sheet
  and a list of every disagreement) and `scripts/align.py` (MMS_FA forced alignment -> `lyrics.json` with
  word times ~10 ms from the vocal onsets, `lipsync.json` mouth envelope, an onset check, and
  `--candidates` to rank alternative readings of a phrase by acoustic fit). Guide: `references/lyrics.md`.
- **3-D.** `scaffold.mjs --3d` adds `lib/gl.js` (shared GPU renderer, per-set bloom, compositing into the
  2-D canvas, 3-D type in the film's display face, canvas textures, billboard + view-yaw for 2-D figures
  in 3-D) and a local import map for three.js. Guide: `references/3d.md`.
- **render.mjs.** WebGL on the GPU by default on macOS (ANGLE Metal; ~80x faster than SwiftShader for
  3-D; `--cpu` opts out) and the renderer it got is printed. Full renders stream frames into ffmpeg (no
  frames/ directory: a 2.5 min 1080p60 PNG sequence was ~28 GB). `--range a:b` renders a section as video
  with the mix. `--contact` paginates (`contact_pN.png`), writes half-size `phone_pN.png` pages, and takes
  `--every N`, `--from`, `--to`. `--strip --name`. Missing files are reported by URL.
- **Beat grid fixes.** `dsp.measure_beats` slipped a beat index on long tracks (a whole song measured
  132.66 bpm with 141 ms residual); it now finds the period that makes every tracked beat phase-coherent,
  then refines (131.997 bpm, 9 ms). Downbeat detection uses harmonic change into the beat as well as the
  kick (a kick on every other beat made it pick beat 3); `--downbeat SECONDS` overrides.
- **Harness.** `M.film({ post })` runs after the motion-blur accumulation (grain and glitch survive);
  `samples` may be a function of t.
- **Worked examples.** `references/examples/vector_rig.js` (a character drawn in code with a 2.5-D head:
  ellipsoid projection, hair locks with follow-through, eyes, visemes) and `performance.js` (lip sync
  from the vocal, vowel shapes, seeded blinks, nods, hair lag), all pure functions of time.
- **Studio rules and critique.** The downbeat frame is the hit (no cut opens on a blank or a full-frame
  flash; at most two structural flashes), whips are pans with both shots on screen, zooms run in log
  space, non-Latin glyphs are checked against both faces, and the critique reads the phone pages.

## 1.2.0 - 2026-09-30

- Works with no accounts or API keys. The ElevenLabs tools and the API key option moved to the
  separate, optional [motion-reel-voice](https://github.com/Aries-Spring/motion-reel-voice) plugin,
  listed in the same marketplace; this plugin no longer runs an MCP server.
- The skill treats a reel without a voice as the default, and supports a voice-over from a recording
  the user supplies (phrase cuts at silences, lip sync from the envelope), no ElevenLabs needed.

## 1.1.0 - 2026-09-30

- Voice-over now goes through a bundled local MCP server (`mcp/elevenlabs.mjs`: `quota`, `voices`,
  `tts`, `transcribe`). The ElevenLabs key is a sensitive plugin option (`/plugin` > Configure
  options) instead of an environment variable; `scripts/voice.py` and `scripts/scribe.py` are removed.
- `beats.py`: the musical key flag is now `--tonic` (was `--key`).
- Plugin icon (`.claude-plugin/icon.svg`).

## 1.0.0 - 2026-09-30

First public release.

- The `motion-reel` skill: asset gathering, reference style guide, beat grid, shot list sign-off, canvas
  film build, critique loop on contact sheets, frame-exact render, synthesized SFX, -14 LUFS master,
  multi-format delivery.
- Bundled renderer (`render.mjs`) and sync checker (`sync.py`); runs from any project folder.
- Voice-over tools for ElevenLabs and worked examples for a beat-locked
  voice-over score and a lip-synced cut-out character.
