# Changelog

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
