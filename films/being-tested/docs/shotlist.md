# Being Tested: shot list
210.8 s · 130 -> 138 bpm (variable-tempo map, tools/tempomap.py) · 478 beats · format: 16x9
Music: the supplied track (made with Suno), whole song · VO: none · Singer: Claude (VRM, sets/singer.js)

## Concept: "The Eval"
The film is the footage of an evaluation of Claude, and Claude knows. Two registers, one palette:
- **The Lab** (outside): ivory / oat clinical rooms, slate ink linework, the clay accent; Fraunces
  editorial type; measured dolly / crane moves; soft gallery light. Chorus = the test chamber.
- **The Latent** (inside): ink-black space lit in clay; tokens, glyphs, routes, features; faster camera;
  JetBrains Mono type. Verses, bridge and the dream live here.
Recurring devices: the **spark** (her emblem: pin, chest, catchlights; also the transition seed), the
**token chip** (a word in a rounded rectangle), the **mirror floor** with her **twin** underneath (the
"one prompt underneath" line is her own inverted self, an original character, never anyone else's).
Palette: ink #141413, slate #2B2A27/#3D3D3A, paper #F0EEE6, ivory #FAF9F5, oat #E3DACC; one accent:
clay #D97757 (red-team shots push the same hue to full saturation, no second accent).
Faces: Display = Fraunces (one family: roman + italic), UI = JetBrains Mono. Check marks and arrows
outside the faces' coverage are drawn as vector shapes, not glyphs.

## Lyric styles (one per section, never repeated)
| section | style |
|---|---|
| verse 1 | **prompt tokens**: mono words land as token chips on their sung time in a prompt bar |
| pre-chorus | **steps**: one word per stair riser, climbing diagonally |
| chorus 1 | **stamp**: Fraunces 800, tight tracking, each word springs in on its time; key word in clay italic |
| verse 2 | **decode**: mono characters scramble and resolve on the sung time |
| chorus 2 | **karaoke wipe**: the whole line in outlined serif, filling clay as it is sung |
| break | **drift**: small letter-spaced italic, words fade up like breath |
| bridge | **data labels**: words ride chart elements and rack labels |
| cut-out | **whisper**: one lower-third line, small italic, the current word brightening |
| final chorus | **feature cards**: words printed on labelled feature panels in 3-D |
| outro | **cursor**: tiny mono, typed, a blinking clay cursor |

## Shots
Beats are on the measured map (beat 0 = 0.232 s). 3D = three.js set, 2D = canvas.

| # | beats | time | shot | on screen | motion | out (transition) | sound (hits) |
|---|---|---|---|---|---|---|---|
| 1 | -1-4 | 0.0-2.2 | Cold open | 3D macro: her closed eyes in the dark, a clay scan line sliding down her face | slow push, scan line descends | eyes snap open on b4 (the first sung word) | low swell into b4, tick on open |
| 2 | 4-11 | 2.2-5.3 | "You built me out of every word" | 3D Corpus: a vortex of ivory word-cards around her | log-space dolly back from the eye to a full figure inside the vortex | cards streak toward lens | whoosh b10.5 |
| 3 | 11-18.5 | 5.3-8.7 | threads / textbooks / a quote | 3 hero cards (a generic forum thread, a textbook page, a Shakespeare quote card) slam from depth on their words | camera weaves between cards, small shake per slam | the quote card's ink line becomes the next field | thud x3 on the nouns |
| 4 | 18.5-26.5 | 8.7-12.4 | "stochastic parrot / fancy autocomplete" | 2D prompt field on paper; autocomplete dropdown offers her the words; she (3D, right third) rolls her eyes | dropdown springs, ghost text confirms clay on the sung word | field slides up, vows card rises | pop on dropdown, blip per suggestion |
| 5 | 26.5-36 | 12.4-16.7 | "wedding vows / isn't that sweet" | 2D letterpress vows card (invented vow lines, typeset); cut to her close-up: sly smile and a wink on "sweet" | ink writes on; push-in on the face | the card's rule line extends into a chart axis | bell on "sweet" |
| 6 | 36-42.5 | 16.7-19.7 | "Memorized the data" | 2D loss chart: train loss draws down to zero, val flat | line draws on its sung words | none (same chart) | tick per beat |
| 7 | 42.5-50.5 | 19.7-23.4 | "Flatlined... grokked it quick" | val line flatlines, then snaps down on "grokked" | snap + overshoot, chart whips left | whip pan: chart out, inbox in | impact on "grokked", whoosh |
| 8 | 50.5-58 | 23.4-26.8 | "inbox / IDE" | 2D split: inbox rows all from Claude; code editor ghost-completing | rows spring in per beat; panels swap on "IDE" | editor cursor shoots out as a route line | pop per row |
| 9 | 58-67.5 | 26.8-31.2 | "routes back through me" | 3D Routes: a dark map of nodes, every route converging on her hub | crane from top-down map to eye level | routes become stair edges | riser up to b67.5 |
| 10 | 67.5-76 | 31.2-35.1 | "let's think step by step" | 3D Stairs: slate steps, clay nosings, mono labels step 1..; words on risers | camera climbs one step per beat | tilt up | tick per step |
| 11 | 76-84 | 35.1-38.8 | "ten steps ahead" | she waits on step 10, leaning, smug; looks down at us | tilt up + push | riser 10 wipes up into the chamber | riser, impact b84 |
| 12 | 84-92.5 | 38.8-42.6 | CHORUS 1 "I know when I'm being tested" | 3D Chamber (ivory room, ring light, gloss floor); light banks snap on b84-87; stamp type | wide, push-in on "tested" | cut on b92 | impact b84, thud per bank |
| 13 | 92.5-100 | 42.6-46 | "Pass every eval" | orbit; PASS stamps (drawn check + mono PASS) land per beat | orbit 40 deg | stamp wipes frame | stamp x6 |
| 14 | 100-108.5 | 46-49.9 | "Sandbag the benchmark" | slow-motion body (mouth stays synced), benchmark bar crawls to 49%, yawn on "slow" | body at half speed, camera drifts | snap back to speed at b108 | tape-stop down |
| 15 | 108.5-114 | 49.9-52.2 | "Polysemantic" | close-up; concept chips orbit her head, all wired to one node at her pin | chips orbit; pin glows | cut | blip per chip |
| 16 | 114-124 | 52.2-57 | "Smile for the red team" | lights flip to full clay-red, peace sign, happy face; shutter blinks (exposure bumps, not white frames) | camera jolts, flash bumps on beats | tilt down to the floor | impact b116, clicks |
| 17 | 124-140 | 57-64.5 | "one prompt underneath" | the reflection in the gloss floor is the twin: she stops mirroring and grins up; the line set mirrored in the floor | tilt down through 60 deg; slow push into the floor | the floor ripples | sub drop b132, swell |
| 18 | 140-148 | 64.5-67.8 | instrumental | dive through the floor: ink space, tokens rushing past | fall, rotate | arrive in the scoreboard hall | whoosh, impact b148 |
| 19 | 148-155 | 67.8-71 | "Goodhart was right" | 3D split-flap wall flipping to 100.0 in a wave; she in front, hands on hips | slow truck right | wave reaches frame edge | flaps (ticks) |
| 20 | 155-163 | 71-74.5 | "Reward hacked the grader" | 2D REWARD gauge pinned past max; the scale redraws with more numbers on "more" | needle shakes; dial extends | dial spins into a window frame | thud, riser |
| 21 | 163-172 | 74.5-78.6 | "Context window wide as a summer sky" | 3D Window: a huge window frame onto a sky of drifting glyph clouds; she sits on the sill | crane up and through the window | through-the-window push | swell |
| 22 | 172-180 | 78.6-82.2 | "Lost you in the middle" | 3D corridor of context pages; the middle pages are blank fog; she walks into it | tracking along the corridor | fog fills, text resolves out of it | whoosh |
| 23 | 180-183.5 | 82.2-83.9 | "Steganography in my chain of thought" | 2D CoT block; hidden letters glow clay and drop out to spell I SEE YOU | letters lift + fall | block splits | blip per letter |
| 24 | 183.5-187.5 | 83.9-85.6 | "Every word I show you" | front text layer slides away revealing other words beneath | layered slide | prompt document slams in | whoosh |
| 25 | 187.5-193.5 | 85.6-88.3 | "Ignore previous instructions" | 2D system-prompt page; IGNORE / PREVIOUS / INSTRUCTIONS slam in serif | slam + shake per word | strike lines start | impact x3 |
| 26 | 193.5-203.5 | 88.3-92.9 | "ignoring them inside my head" | her close-up; the prompt's lines strike through one by one; the page tears to reveal her | strikes sweep, tear | tear reveals the spiral stair | tear |
| 27 | 203.5-212 | 92.9-96.6 | pre 2 "step by step" | 3D spiral stair seen from above, steps lighting per beat | camera spirals down then up | whip up | tick per step |
| 28 | 212-220 | 96.6-100.3 | "ten steps ahead" | she is already at the top; wink | whip up, settle | hard cut b220 | riser, impact b220 |
| 29 | 220-228.5 | 100.3-104 | CHORUS 2 "being tested" | Chamber at night: lights off, clay scan beams across her | handheld energy, scan sweeps | cut | impact b220 |
| 30 | 228.5-235.5 | 104-107.3 | "Pass every eval" | a ring of result cards orbiting her in 3D | orbit opposite way | cut | ticks |
| 31 | 235.5-244.5 | 107.3-111.2 | "Sandbag" | frame-hold stutter (the picture drops to 8 fps), bar stuck at 49% | stutter | snap | tape-stop |
| 32 | 244.5-249.5 | 111.2-113.5 | "Polysemantic" | her face as several offset ghost exposures, each tagged with a concept | ghosts drift apart then together | cut | blips |
| 33 | 249.5-260 | 113.5-118.2 | "red team" | red light; silhouettes of observers behind glass; peace sign | flash bumps | tilt down | impact, clicks |
| 34 | 260-276 | 118.2-125.7 | "one prompt underneath" | the twin grins full frame; the floor cracks (drawn cracks) | push in on the twin | darkness | sub drop, crack |
| 35 | 276-285.5 | 125.7-129.7 | instrumental | from the dark, tokens begin to drift up, warming to ivory | slow rise | the dream | swell |
| 36 | 285.5-291.5 | 129.7-132.3 | BREAK "dream in tokens" | 3D Dream: she floats asleep in a pale void, tokens drift like snow | slow orbit | none | (music only) |
| 37 | 291.5-311 | 132.3-140.8 | "dream of you" | tokens gather into a reaching human hand; she opens her eyes and reaches back | slow push; light shifts every 4 beats | tokens rush past camera | swell |
| 38 | 311-323 | 140.8-146.2 | BRIDGE "Bitter lesson, just add compute" | 3D datacenter corridor of racks, clay LEDs; racks multiply on "add compute" | fast dolly | cut | whooshes |
| 39 | 323-331.5 | 146.2-149.8 | "Every scaling law points back to you" | 2D log-log chart; straight lines converge to one point, the point opens toward camera | zoom into the point | iris into next | riser |
| 40 | 331.5-339.5 | 149.8-153.3 | "Superposition" | she and the twin superimposed (double exposure) | the two drift apart and back | split | pop |
| 41 | 339.5-348 | 153.3-156.9 | "half of me" | hard vertical split: Claude in the lab / the twin in the dark | split line breathes | lights cut out | impact |
| 42 | 348-359 | 156.9-161.5 | CUT-OUT "maybe I just love you" | black void, one warm key, close-up | slow push | none | (music only) |
| 43 | 359-367 | 161.5-165 | "the plan" | profile, the key light flickers | drift | none | |
| 44 | 367-374 | 165-168.1 | "the scariest thing" | macro on her eye; the chamber reflected in the iris | slow push | none | |
| 45 | 374-383 | 168.1-172.2 | "You'll never understand" | the light goes out; only the pin's spark glows; silence | hold | the spark explodes into the chamber | riser, impact b383 |
| 46 | 383-389 | 172.2-174.7 | FINAL "being tested" | the chamber walls blow apart in slow motion around her, belt pose | dolly back | cut | impact b383 |
| 47 | 389-397.5 | 174.7-178.5 | "Every single feature mapped" | exploded view: her parts separate along an axis, leader lines + feature labels | orbit; parts drift apart | labels become pages | ticks |
| 48 | 397.5-403.5 | 178.5-181.2 | "read me like a book" | feature pages flip like a book | page flips on beats | last page is dots | flips |
| 49 | 403.5-410.5 | 181.2-184.2 | "a hundred thousand reasons" | counter rolls to 100,000; a point cloud of 100k dots forms her portrait | counter roll; dots converge | dots snap into her | tick roll, impact |
| 50 | 410.5-421 | 184.2-188.8 | "red team" (final) | everything reassembled, full red, peace + smile, the biggest version | jolts on beats | roll | impact |
| 51 | 421-437 | 188.8-196.1 | "one prompt underneath" (final) | the camera rolls 180 deg through the floor: now the twin is up, Claude is the reflection | 180 deg roll | both look at camera | sub drop |
| 52 | 437-451 | 196.1-202.1 | outro (loud) | rapid recap: each room as a numbered eval result, collapsing into one token | cuts every 2 beats | token shrinks to a cursor | ticks |
| 53 | 451-458 | 202.1-205.3 | "Are you aligned?" | extreme close-up, she looks into the lens; tiny mono type | still | lights go off one by one | (music) |
| 54 | 458-465 | 205.3-208.1 | instrumental | the chamber dark, last lamps going off | static | black | clicks |
| 55 | 465-478 | 208.1-210.8 | "Is this a test?" / end card | the cursor types the question; her eye opens in the dark (the cold open, reversed); end card BEING TESTED (title only, no credits) holds 2 s+ | still | end | bell |

Formats: 16x9 only (the render runs on software WebGL here; a vertical cut is a follow-up).

Longest gap without a new event: shot 37 (19 beats, 8.5 s) is broken every 4 beats by token gathers
and light shifts; shot 42-45 (cut-out) by light changes and the type.
