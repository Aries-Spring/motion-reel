# The Bell Witch

A 108-second horror reel about the Bell Witch haunting (Adams, Tennessee, 1817-1821). It is rendered
like a lost 1997 console game: low-poly three.js sets drawn into a 384x216 buffer with vertex snapping,
affine textures, per-vertex light and a 15-bit dither, then film grain, scanlines and VHS tears on top.
The type is set in IM Fell English and VT323. Narration and the witch are ElevenLabs voices; the score is
synthesized in code. The research behind the script is in `docs/research.md`.

| file | what |
|---|---|
| `film.js` | the director: 31 shots on an 80 bpm grid, type, post, the hit list |
| `lib/ps1.js` | the PS1 renderer (shader, snapping, dither, low-res present) |
| `sets/world.js` | textures drawn in code, props, and five sets: exterior, cornfield, interior, graveyard, face |
| `audio/score.py` | score + voice edit (phrases on the beat) -> `music.wav`, `vo.wav`, `beats.json`, `vo.json` |
| `audio/eleven.py` | cached ElevenLabs TTS / SFX takes in `audio/el/` (key from `ELEVENLABS_API_KEY`) |
| `audio/sfx_el.py` | lays the ElevenLabs effects on the film's own hit list, after `sfx.mjs` |
| `docs/` | research, style guide, shot list, critique log |

Rebuild from the repo root (the ElevenLabs takes are committed, so no credits are needed):

```bash
npm i && npm i -D playwright
SK=skills/motion-reel
MOTION_REEL_SKILL=$PWD/$SK uv run bell-witch/audio/score.py
node $SK/scripts/sfx.mjs bell-witch && uv run bell-witch/audio/sfx_el.py
node $SK/scripts/render.mjs --film bell-witch --format 16x9 --video-only
node $SK/scripts/render.mjs --film bell-witch --format 9x16 --video-only
node $SK/scripts/mix.mjs bell-witch --music-db 2 --sfx-db -2
```
