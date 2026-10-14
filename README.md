# Motion Reel

A Claude Code plugin that makes showreel-grade motion videos from code. Ask for "a 20 second launch
video for https://example.com" and Claude runs a full production pipeline: it gathers the product's
real screenshots, logo, fonts and colours from the site, measures or synthesizes a beat grid, writes a
shot list for you to sign off, builds the film as a canvas animation that is a pure function of time,
reviews its own contact sheets over at least three critique rounds, and renders frame-exact H.264 in
16:9, 9:16 and 1:1 with a synthesized score, sound effects on every visual hit, and a -14 LUFS master.

It also makes music and lyric videos for a song you supply: the whole track becomes the clock, the
lyrics are transcribed from the separated vocal and aligned word by word, and a character drawn in
code can sing it, lip-synced to the actual vocal. Films mix 2-D canvas work with three.js 3-D sets,
rendered on the GPU.

No accounts or API keys are needed: the score and every sound effect are synthesized on your machine,
and most reels need no voice at all. When one does, bring your own recording (any language), and the
skill cuts it phrase by phrase onto the beat and can lip-sync a talking cut-out character to it. For
generated voices, add the optional [Motion Reel Voice](https://github.com/Aries-Spring/motion-reel-voice)
plugin, which connects ElevenLabs.

## Install

```bash
claude plugin marketplace add Aries-Spring/motion-reel
claude plugin install motion-reel@aries-spring
```

Or inside a session: `/plugin install motion-reel --marketplace Aries-Spring/motion-reel`.

Optional, for ElevenLabs voice-over: `claude plugin install motion-reel-voice@aries-spring`, then set
your key with `/plugin configure motion-reel-voice@aries-spring`.

Then just ask for a video: "make a 15 s promo for https://…", "a vertical reel about our app",
"a showreel for my résumé about this product", "a lyric video for ~/Music/song.mp3". The skill asks
for anything missing (duration, formats, music, voice-over) in one round, then shows you a shot list
(and a model sheet, if there's a character) before it builds anything.

## Requirements

This plugin drives real tools, so it is meant for Claude Code (or any agent with a shell):

- Node 18 or later, and `ffmpeg` + `ffprobe` on the PATH (`brew install ffmpeg`)
- [uv](https://docs.astral.sh/uv/) for the Python audio scripts, which declare their own dependencies
- Playwright with Chromium in the project folder: `npm i -D playwright && npx playwright install chromium`
- Optional, for a voice: your own recording, or the motion-reel-voice add-on with an ElevenLabs key
- Optional, for 3-D: `npm i three opentype.js` in the project folder (the scaffold's `--3d` flag says so)
- A GPU helps a lot for 3-D: on macOS the renderer uses it automatically (Metal)

The scaffold step checks the toolchain and tells you what's missing.

## What it produces

Each film is a folder in your project (`<film>/index.html`, `film.js`, `assets/`, `docs/`, `audio/`)
and renders to `out/<film>/`: `final.mp4` plus one file per extra format, contact sheets (and half-size
phone sheets for the readability check), a poster, a sync plot, and a critique log with the scores from
every review round. Renders stream straight into the encoder, so a long film needs no disk space for
frames.

## What it runs, fetches and sends

Everything runs on your machine unless listed here.

- **Web pages you name.** `gather.mjs` opens the product URL (and any extra pages you pass) in a local
  headless Chromium and saves screenshots, the page's logo and font files, its colours and its copy
  into `<film>/assets/`.
- **Local rendering.** `render.mjs` serves your project folder on `127.0.0.1` on a random port while it
  renders, and `ffmpeg` encodes the frames. Nothing is uploaded.
- **Package downloads.** `uv` installs the audio scripts' Python dependencies (librosa, numpy, scipy,
  soundfile, matplotlib) from PyPI on first run. Playwright and Chromium come from npm when you install
  them; three.js and opentype.js too, if you use 3-D.
- **Lyric videos only.** `lyrics.py` and `align.py` install PyTorch, Demucs and Whisper (mlx-whisper
  on Apple Silicon, faster-whisper elsewhere) from PyPI and download their models from Hugging Face on
  first run (about 3.5 GB, kept in the Hugging Face cache). The separation, transcription and alignment
  all run locally; your song is never uploaded.

The plugin uses no credentials, has no telemetry, no hooks and no MCP servers, and runs nothing in
the background. Voice-over through ElevenLabs lives in the separate, optional motion-reel-voice
plugin, which documents what it sends.

## License

MIT, see [LICENSE](LICENSE).
