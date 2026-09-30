# Motion Reel

A Claude Code plugin that makes showreel-grade motion videos from code. Ask for "a 20 second launch
video for https://example.com" and Claude runs a full production pipeline: it gathers the product's
real screenshots, logo, fonts and colours from the site, measures or synthesizes a beat grid, writes a
shot list for you to sign off, builds the film as a canvas animation that is a pure function of time,
reviews its own contact sheets over at least three critique rounds, and renders frame-exact H.264 in
16:9, 9:16 and 1:1 with a synthesized score, sound effects on every visual hit, and a -14 LUFS master.

It can also add a voice-over in any language ElevenLabs speaks, cut phrase by phrase onto the beat,
and lip-sync a talking cut-out character to it.

## Install

```bash
claude plugin marketplace add Aries-Spring/motion-reel
claude plugin install motion-reel@aries-spring
```

Or inside a session: `/plugin install motion-reel --marketplace Aries-Spring/motion-reel`.

For voice-over, set your ElevenLabs API key once: in Claude Code run
`/plugin configure motion-reel@aries-spring` (or open `/plugin` > **Installed > motion-reel >
Configure options**), paste it into **ElevenLabs API key**, then run `/reload-plugins`. The key is stored in your operating system's credential store. Leave it empty if
you only want videos without a voice.

Then just ask for a video: "make a 15 s promo for https://…", "a vertical reel about our app",
"a showreel for my résumé about this product". The skill asks for anything missing (duration,
formats, music, voice-over) in one round, then shows you a shot list before it builds anything.

## Requirements

This plugin drives real tools, so it is meant for Claude Code (or any agent with a shell):

- Node 18 or later, and `ffmpeg` + `ffprobe` on the PATH (`brew install ffmpeg`)
- [uv](https://docs.astral.sh/uv/) for the Python audio scripts, which declare their own dependencies
- Playwright with Chromium in the project folder: `npm i -D playwright && npx playwright install chromium`
- Optional, for voice-over: an ElevenLabs API key, set as the plugin option above

The scaffold step checks the toolchain and tells you what's missing.

## What it produces

Each film is a folder in your project (`<film>/index.html`, `film.js`, `assets/`, `docs/`, `audio/`)
and renders to `out/<film>/`: `final.mp4` plus one file per extra format, contact sheets, a poster, a
sync plot, and a critique log with the scores from every review round.

## What it runs, fetches and sends

Everything runs on your machine unless listed here.

- **Web pages you name.** `gather.mjs` opens the product URL (and any extra pages you pass) in a local
  headless Chromium and saves screenshots, the page's logo and font files, its colours and its copy
  into `<film>/assets/`.
- **Local rendering.** `render.mjs` serves your project folder on `127.0.0.1` on a random port while it
  renders, and `ffmpeg` encodes the frames. Nothing is uploaded.
- **Package downloads.** `uv` installs the audio scripts' Python dependencies (librosa, numpy, scipy,
  soundfile, matplotlib) from PyPI on first run. Playwright and Chromium come from npm when you install
  them.
- **ElevenLabs, only if you ask for a voice-over.** The plugin includes a small local MCP server,
  `mcp/elevenlabs.mjs` (plain Node, no dependencies), that Claude Code starts with the plugin. Its
  `tts` tool sends the script text to `api.elevenlabs.io` for text-to-speech and forced alignment,
  and its `transcribe` tool sends audio files you choose (takes or the final mix) to ElevenLabs'
  speech-to-text to check that every word is intelligible; `quota` and `voices` read your plan and
  voice list. The only credential it uses is the **ElevenLabs API key** plugin option, which Claude
  Code passes to that server from its credential store. The key goes only to ElevenLabs, in the
  `xi-api-key` header, and the plugin never reads keys from your environment or files, and never
  writes the key to disk. With no key set, the tools make no network calls.

  For reviewers: `.claude-plugin/plugin.json` declares the option as `userConfig.elevenlabs_api_key`
  (`sensitive: true`) and hands it to the server as
  `"env": { "MOTION_REEL_ELEVENLABS_KEY": "${user_config.elevenlabs_api_key}" }`. That variable is the
  only one `mcp/elevenlabs.mjs` reads, and `https://api.elevenlabs.io/v1` is the only host it calls,
  so the user's ElevenLabs key goes only to ElevenLabs' own API.

The plugin has no telemetry and no hooks. Its only long-running process is that local MCP server,
which talks to Claude Code over stdin/stdout.

## License

MIT, see [LICENSE](LICENSE).
