# Shot list: template and rules

Write `<film>/docs/shotlist.md` against the measured grid in `<film>/beats.json` (bpm, sections,
bar_energy). Show it to the user and stop until they approve it: a shot list costs a minute to
change, a rendered scene costs an hour.

## Rules of thumb

- **Units are beats.** Every row starts on a beat (or a half/quarter beat for syncopation). Seconds
  are derived: `t = offset + beat * period`.
- **Frame 0 is a shot, not a lead-in.** The hook lands in beats 0-4 (first 2 s). No fade from black.
- **Something new every 2-4 s** (every 4-8 beats at 120-130 bpm): a new shot, a new element, a camera
  move, or a change of scale or colour. Mark each with a hit.
- **Big changes sit on downbeats and section starts** (`sections` in beats.json: intro/main/end or
  the lifts in `bar_energy` for a supplied track). Small accents can syncopate.
- **Every shot uses a real asset** from `<film>/assets/` or pure type/shape. Name the file.
  If a shot needs a screen the product doesn't have, cut the shot.
- **Plan each format.** One line per shot on how 9:16 / 1:1 differ (stacking, crop focus, type size).
- **End card** holds >= 1.5 s: name/URL + one line in the brand's own words.
- **Transitions are motivated:** a shape, a motion or a colour carries into the next shot (match cut,
  push-through, wipe by an element). Say what carries.

## Template

```markdown
# <Title>: shot list
<duration> s · <bpm> bpm · <N> beats · formats: 16x9 (primary), 9x16
Music: <synth flavor / track + start> · VO: <none / script file>

| # | beats | time | shot | on screen (asset) | motion | out (transition) | sound (hits) |
|---|-------|------|------|-------------------|--------|------------------|--------------|
| 1 | 0-4   | 0.00-1.88 | Hook: ... | `assets/shots/section_01_hero.png` crop on the CTA | card springs up (bouncy), 6% push | CTA pill scales to fill frame | impact @0, pop @1.5 |
| 2 | 4-8   | ... | ... | ... | ... | ... | ... |

Formats:
- 9x16: shot 1 stacks headline above the card; shot 3 uses `mobile_viewport.png` instead of desktop.
- 1x1: ...

Longest gap without a new event: beats a-b (x.x s).
```
