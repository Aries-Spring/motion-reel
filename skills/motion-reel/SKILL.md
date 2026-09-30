---
name: motion-reel
description: Make a product or showreel motion video rendered from code (canvas film that is a pure function of time, synthesized score + SFX, frame-exact render). Use whenever the user asks for a launch video, showreel, product reel, promo, animated explainer, motion ad, social cut (9:16, 1:1) or "a video about" some product or URL, even if they never say "motion graphics". Covers gathering real assets from the product URL, a style guide from a reference, the beat grid, a shot list the user signs off, the build, a critique loop on contact sheets, render, SFX, voice-over with a lip-synced talking character, -14 LUFS mix and multi-format delivery.
compatibility: Claude Code or any agent with a shell. Needs node 18+, ffmpeg + ffprobe, uv (Python deps install themselves on first run), and Playwright + Chromium in the project folder. No accounts or API keys. Optional voice-over from the user's own recording, or ElevenLabs via the motion-reel-voice add-on.
---

# Motion reel

A reel here is a directory in the project folder (`<film>/`) holding a canvas film whose every frame
is `window.seek(t)`, rendered frame-exact by `<skill>/scripts/render.mjs`. `<skill>` is the folder
this SKILL.md lives in (e.g. `~/.claude/skills/motion-reel`). Run every command from the project
folder: the scripts read and write `<film>/` and `out/<film>/` relative to it. The studio rules at
the end apply throughout; if the project's own CLAUDE.md sets different rules, the project wins.

```
<film>/film.json        title, duration, formats (first = primary), poster time
<film>/index.html       fonts + canvas;  film.js  the film;  lib/motion.js  harness + springs
<film>/assets/          real screenshots, logo, fonts, brand.json, copy.md (gather.mjs)
<film>/docs/            style_guide.md, shotlist.md, critique.md, reference/
<film>/audio/           music.wav, sfx.wav, vo.wav (optional), mix.wav
<film>/beats.json       the measured grid everything is timed against
out/<film>/             contact sheets, strips, hits.json, video_<fmt>.mp4, final*.mp4, poster.png
```

Never overwrite another film's directory; start new work with `scaffold.mjs`.

## Setup (once per project)

`scaffold.mjs` checks the toolchain and prints anything missing. The project needs Playwright:
`npm i -D playwright && npx playwright install chromium` (add a package.json first if there is none).
ffmpeg/ffprobe and uv come from the system (`brew install ffmpeg uv`). The Python scripts declare their
own dependencies inline, so `uv run <skill>/scripts/<script>.py` works in any folder.

## Inputs to collect first

Product + URL, duration, formats (9:16 / 1:1 / 16:9), brand colors + fonts, a reference (frame,
video or image folder), music (file or "synthesize"), and whether there is a voice-over.

Ask for everything missing in one AskUserQuestion round and offer defaults (15 s, 16:9, synthesize,
no VO). Brand colors and fonts come from the site in step 1, so ask only whether to override them.

**Voice-over is optional, and no VO is the default.** Most reels don't need one: kinetic type,
music and SFX carry the message, and the whole pipeline runs with no accounts or keys. Offer a voice
only when the brief calls for one (a narrator, a talking character). Then there are two sources, and
`references/voiceover.md` covers both:
- **A recording the user supplies** (any language, any voice), placed and lip-synced from its audio.
- **ElevenLabs**, if its tools are available (`mcp__plugin_motion-reel-voice_elevenlabs__*`, from the
  optional `motion-reel-voice` plugin). If they aren't and the user wants a generated voice, tell them
  about that add-on; never ask for an API key in chat, and carry on without a voice if they'd rather.

## Pipeline

1. **Gather real assets.**
   `node <skill>/scripts/scaffold.mjs <film> --title "..." --duration 15 --formats 16x9,9x16`, then
   `node <skill>/scripts/gather.mjs <url> <film> [--pages /pricing,/features]`.
   It writes desktop + mobile screenshots, one PNG per page section, the logo, the brand's font files,
   `brand.json` (hex colours ranked by use, font families, the wordmark's own styling) and `copy.md`
   (the brand's own words). Print the list and look at the key shots. Confirm the palette and the
   two faces with the user. Copy the chosen font files to `<film>/fonts/display.*` and `ui.*`, or point
   the `@font-face` rules in `index.html` at them.
   - If a cookie wall or login blocks the page, say so and ask for screenshots rather than inventing UI.

2. **Style guide from the reference.** Skip this step if there is no reference.
   `node <skill>/scripts/reference.mjs <path> <film>` extracts one frame per shot, a 1 fps sheet and
   the cut rhythm (`cuts.json`). Look at them, then write `docs/style_guide.md` using
   `references/style_guide.md`. Take the reference's motion and composition; the brand keeps its
   colours and type.

3. **Music and the beat grid.** Use one of:
   - `uv run <skill>/scripts/beats.py <film> --track song.mp3`: measures the supplied track and cuts
     the loudest window that fits, starting on a downbeat.
   - `uv run <skill>/scripts/beats.py <film> --synth --flavor house|tabla|lofi --mode ... --tonic ...`:
     synthesizes a bed.

   Either way you get `audio/music.wav` and `beats.json` (grid, sections, energy per bar).
   - For a hero piece, write a bespoke `<film>/audio/score.py` on top of `<skill>/scripts/dsp.py`
     (instruments, Bus, measure_beats; `references/examples/score_vo.py` is a full example with a
     beat-locked voice-over). It must still write `music.wav` + `beats.json`. Run it as
     `MOTION_REEL_SKILL=<skill> uv run <film>/audio/score.py` so it finds `dsp.py`.
   - Only if there is a voice-over: read `references/voiceover.md` now, since the VO edit is placed
     on this grid. Without one, skip it; `mix.mjs` masters music + SFX alone.

4. **Shot list, then stop.** Write `docs/shotlist.md` on the beat grid using `references/shotlist.md`
   (one row per shot: beats, asset used, motion, transition, sounds, per-format notes). Show it and
   wait for the user's OK. Changing a table is cheap and re-animating a scene is not.

5. **Build `film.js`.** Start from the scaffolded template.
   - Import `lib/motion.js` and time everything in beats (`u`).
   - For motion, use `springU` / `springKeys` / `SPRING` presets: closed-form springs that stay pure
     functions of time. Use `kf` for eased keys, `wobble` for squash-and-settle, `shake` for impacts.
   - For layout, use `FORMAT.pick({...})` and `FORMAT.safe` so each format is composed for its own
     shape.
   - `layout` / `glyph` handle per-glyph type, and `cover` / `crop` place the real screenshots.
   - List every accent in `HITS` as `[beat, label, sfx, opts]`. `sfx.mjs` voices them, so sound
     can't drift from picture (`node <skill>/scripts/sfx.mjs --list` shows the palette).
   - Follow the studio rules below throughout.

6. **Critique loop: 3 rounds minimum.** Each round:
   - Run `node <skill>/scripts/render.mjs --film <film> --contact [--format f]` for every format.
   - Run `--strip a:b:8` across each transition, plus `--at` for detail.
   - Run `node <skill>/scripts/sfx.mjs <film> && node <skill>/scripts/mix.mjs <film> --no-mux`,
     then `node <skill>/scripts/render.mjs --film <film> --hits && uv run <skill>/scripts/sync.py <film>`.
   - Run the review in `prompts/critique-pass.txt`: score, find the worst three, append the round
     to `docs/critique.md`.
   - Fix those three and go again. Stop only when every score is >= 8 and at least 3 rounds are done.

7. **Render and deliver the audio.** Run each step in order:
   - `node <skill>/scripts/render.mjs --film <film> --format <f> --video-only` for each format in film.json.
   - `node <skill>/scripts/sfx.mjs <film>`
   - `node <skill>/scripts/mix.mjs <film>`. This masters to -14 LUFS / -1 dBTP and muxes
     `out/<film>/final.mp4` (primary format) plus `final_<fmt>.mp4` for the others.
   - `node <skill>/scripts/render.mjs --film <film> --poster [t]` (and `--format <f>` for each other format)

   Check each final with ffprobe (duration, 60 fps, yuv420p, audio present), and pull a frame from
   the encoded file to confirm the encode itself.

8. **Deliver.** Give the paths to `final.mp4` (and the other formats), `contact.png` and
   `poster.png`, plus the last round's scores. Then say what you'd improve next: the critique's
   remaining issues, named concretely, not a generic wishlist.

## Studio rules

**Render contract.** Every film is a pure function of time: `window.seek(t)` paints frame t. No CSS
transitions, no setTimeout, no requestAnimationFrame in render mode, no state carried between frames,
and seeded noise only (`lib/motion.js`, mulberry32), never Math.random. The renderer seeks frames out
of order across parallel pages, so any hidden state or wall-clock dependency makes frames disagree.
`render.mjs` encodes H.264 yuv420p, CRF 16, 60 fps with sub-frame motion blur.

**Real product only. Never invent screens.** Viewers and the client know the product, and a fake
screen reads as a lie. Crop, frame, mask and move the gathered screenshots and the brand's own art.
If a shot needs a screen that doesn't exist, change the shot.

**Look.** Banned defaults: centered title on gradient, everything fading in, corner labels and frame
borders, glow on UI chrome, generic particle bursts. They are the signature of template video;
entrances need direction, weight and a reason. One display face, one UI face. One accent colour
unless the brief says otherwise. Something new happens on screen every 2 to 4 seconds.

**Sound.** Score and SFX are synthesized in code unless a track is supplied. Hits sit on the measured
beat grid (`beats.json`). Master to -14 LUFS integrated, -1 dBTP (`mix.mjs`).

**Look before you show.** Nothing goes to the user (beyond the shot list) until the critique loop
in step 6 has run: contact sheet per beat, looked at, scored 1-10 on hook, readability at phone
size, motion quality, variety, brand accuracy and sound sync, the three worst problems fixed, until
every score is 8+.
