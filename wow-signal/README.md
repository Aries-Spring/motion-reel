# The Wow! Signal (YouTube Short)

A 59.4-second vertical Short about the Wow! signal (Big Ear, Ohio, August 15, 1977), in the same 1997-console
look as `bell-witch/` (low-res three.js with vertex snapping, affine textures and a 15-bit dither, film grain
and scanlines on top), built for retention: the artifact and the hook line on frame 0, word-by-word captions,
a new image every 1-3 s, and a last line that loops into the first. Every claim is sourced in
`docs/research.md`.

Rebuild from the repo root (the ElevenLabs takes in `audio/el/` are committed: no credits needed):

```bash
SK=skills/motion-reel
MOTION_REEL_SKILL=$PWD/$SK uv run wow-signal/audio/score.py
node $SK/scripts/sfx.mjs wow-signal && uv run wow-signal/audio/sfx_el.py
node $SK/scripts/render.mjs --film wow-signal --format 9x16 --video-only
node $SK/scripts/mix.mjs wow-signal
```

`audio/el/vB.fa.json` is the ElevenLabs forced alignment of the narration: the v3 with-timestamps alignment
drifted by up to a second across the 65 s take, so the voice edit cuts on the forced alignment.
