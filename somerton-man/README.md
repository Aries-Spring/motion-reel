# The Somerton Man (YouTube Short)

A 59.4-second vertical Short about the Tamám Shud case (Somerton Park beach, Adelaide, 1 December 1948), in the
1997-console look of `bell-witch/` and `wow-signal/`: three.js sets in a 216x384 buffer with vertex snapping,
affine textures and a 15-bit dither, under grain, scanlines and a sepia wash; the artifacts (the scrap, the
torn page, the five-line code in pencil, the inquest card, the map) drawn in code at full resolution.
Built for retention: the two words on frame 0, a clue every 2-4 s, word-by-word captions, a comment prompt on
the unsolved code, and a last line ("...what he meant by two words:") that loops into the first ("Tamám Shud.").
Every claim is sourced in `docs/research.md`.

```bash
SK=skills/motion-reel
MOTION_REEL_SKILL=$PWD/$SK uv run somerton-man/audio/score.py
node $SK/scripts/sfx.mjs somerton-man && uv run somerton-man/audio/sfx_el.py
node $SK/scripts/render.mjs --film somerton-man --format 9x16 --video-only
node $SK/scripts/mix.mjs somerton-man
```
