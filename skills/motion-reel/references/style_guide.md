# Style guide from a reference

Only when the user gave a reference (frame, video, image folder). Run
`node <skill>/scripts/reference.mjs <path> <film>` first, then LOOK at
`docs/reference/shots.png` (one frame per shot), `second.png` and `cuts.json` before writing.

Describe what you can see and measure, not adjectives. "Snappy" is useless; "moves resolve in
6-8 frames with ~10% overshoot" is buildable. Where the reference and the brand disagree (colour,
type), the brand wins; take the reference's *motion* and *composition*, not its logo colours.

Write `<film>/docs/style_guide.md` with these sections:

```markdown
# Style guide (from <reference>)

## Rhythm
Median shot <x> s, <y> cuts / 10 s (cuts.json). Cuts land on: downbeats / every beat / off-grid.
Holds: where it lets a frame breathe, and for how long.

## Motion vocabulary
- Entrances: (e.g. spring up from below with overshoot / mask wipe / scale from 0.9)
- Exits: ...
- Easing character: (spring presets from lib/motion.js that match: snappy / bouncy / gentle / wobbly)
- Camera: static / slow push / whip pans / parallax layers
- Signature move: the one thing this reference does that a viewer would remember

## Composition
Grid, margins, alignment (left-aligned editorial? centred?), scale contrast, negative space,
how UI screenshots are framed (device frame, floating cards, cropped details).

## Colour + texture
How the palette is used (large flat fields? mostly neutral with accent pops?), gradients or not,
grain, shadows, depth. Mapped onto the brand palette from assets/brand.json.

## Type in motion
How text appears (per glyph / per word / per line), size relative to frame, tracking, weight.

## Do / don't
Three of each, concrete.
```
