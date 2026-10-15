# Critique log: Being Tested

## Round 1
Looked at: contact_p1-7 + phone_p1-7 (every 2 beats, 236 frames), stills across every shot, sync.py.

| hook | read | motion | variety | brand | sync | min |
|  6   |  5   |   6    |    7    |   7   |  7   |  5  |

- Hook (b-1..4): closed eyes under an orange haze; the scan "line" is a broad glow, the frame is muddy orange. Interesting, not arresting.
- Read: chorus-1 stamp type is ink over the black glass floor (b84-140): unreadable on phone. Cut-out whisper (b348-383) at 40 % on skin: invisible. Lines overlap at every line change (the next line appears 0.45 s early while the last holds 0.5 s): b92, b100, b244. Verse-1 tokens collide with the loss chart axis (b36-50).
- Motion: cameras move on every shot and she grooves on the beat; but transitions are almost all hard cuts, chorus-1 shots 12-14 share one framing.
- Variety: strong overall (16 distinct places); dream b291-311 holds one composition for 8.5 s.
- Brand: ink / paper / clay throughout, Fraunces + JetBrains Mono only; night-mode walls render mid-grey (linear colour set as if sRGB).
- Sync: 31/57 hits within 20 ms; the misses are quiet flap ticks and whooshes (peak on hit) masked by the track, placement itself is exact.

Worst three (most damaging first):
1. [b84-140, b348-383, all line changes] Lyrics unreadable or doubled -> the viewer loses the song -> stamp colour ivory with an ink stroke in every chamber shot; whisper unsung 0.6 / sung 1.0 + a dark lower-third band; `current()` ends a line when the next one appears (not at its t0); a line that began in a shot of another style is not carried across the cut.
2. [b84-86] Chorus 1 opens on a blank ivory frame: the camera starts outside the round room (r 8.5 > wall 7.2) -> the biggest downbeat of the first half lands on nothing -> start inside (r 6.2), walls dark until the light banks snap on so the hit IS the lights; shot 13 low angle looking up, shot 14 high angle looking down so the three chorus framings differ.
3. [b291-311] The dream holds 8.5 s: she stands on nothing, the token hand is an unreadable blob -> float legs while she reaches, the hand faces camera with smaller tokens and drifts toward her fingers, the camera arcs and pushes, light shifts every 4 beats.

Also fixing: night walls (linear colour), routes too dim from 28 m up (start at 16 m, wider strips), loss chart moved up, superposition separates into two figures, gauge caption off the ticks, decode scramble dimmed, cold-open scan line made a sharp line.

Checks failed: readability (1), downbeat on blank (2), longest static gap b291-311 (3).
Verdict: ANOTHER ROUND

## Round 2
Looked at: contact_p1-7 + phone_p1-7 after the round-1 fixes, stills on every fix, strips across the new transitions.

| hook | read | motion | variety | brand | sync | min |
|  8   |  8   |   6    |    7    |   8   |  7   |  6  |

- Hook: frame 0 is a sharp clay scan line across her closed eyes in the dark; they open on the first word. Fixed.
- Read: every line readable on the phone pages; no doubled lines; carried lines stay in their own shot. Fixed.
- Motion: still almost all hard cuts; the floor-reflection shot b128-140 holds one framing for 5 s; the spiral stair (b203-212) reads as a flat pinwheel from above.
- Variety: dream hand now reads; rise b276-285 is a cluttered wall of cards.
- Brand: night walls now near-black; routes clipped to yellow (additive overlap) before toning down.
- Sync: unchanged (placement exact; quiet ticks masked).

Worst three:
1. [all cuts] Transitions are almost all hard cuts -> the film reads as a slideshow between rooms -> motivated transitions with both shots on screen: clay bar wipe up out of the stairs into the chamber (b84) and out of the window into the corridor (b171.8), an iris opening from the gauge's hub onto the window (b162.9), whip pans inbox -> routes (b57.9) and racks -> scaling chart (b323.1).
2. [b128-140] One framing for 5 s while the twin changes -> push into her face over b129.5-136 (fov -8), her fingertips touch the glass at b134.5 and rings spread across the floor, then the dive.
3. [b203-212, b276-285] The spiral stair is a top-down pinwheel; the rise is clutter -> camera low beside the helix looking up the steps as they light; the rise keeps a third of the cards at 70 % size.

Also: exploded view keeps the hair close (no bald head), routes back inside the clay hue.
Verdict: ANOTHER ROUND

## Round 3
Looked at: contact_p1-7 + phone_p1-7 after the round-2 fixes, strips across every transition (t_wipe, t_iris, t_whip), stills on the spiral stair and the floor shot.

| hook | read | motion | variety | brand | sync | min |
|  8   |  8   |   8    |    8    |   8   |  8   |  8  |

- Hook: scan line across closed eyes, eyes open on the first sung word (b4), then the dolly back through the word vortex.
- Read: every lyric line readable on every phone page; one style per section; no fallback glyphs (check marks drawn).
- Motion: five motivated transitions with both shots on screen; push-ins and orbits on every 3-D shot; the singer grooves on the measured beat, lip-syncs from the vocal stem.
- Variety: something new every 2-4 s; 16 places, 10 lyric styles; the dream, floor and spiral holds now evolve.
- Brand: ink / paper / clay only (red team = clay at full saturation); Fraunces + JetBrains Mono.
- Sync: SFX sit exactly on the visual hits (tempo-mapped); bank and flap accents now clicks loud enough to read.

Remaining (not blocking): the exploded view is deliberately clinical; the window shot keeps her small against the sky; the decode style shows a quarter second of scramble before each word by design.

Checks: no banned defaults; longest gap without an event 4 beats; no cut opens on a blank (b84 opens on the first light bank); one accent; 16x9 only (by design); end card holds 1.8 s.
Verdict: READY

## Round 4: the new singer (Sendagaya Shino restyled as Claude, real MToon)
Looked at: contact_p1-7 + phone_p1-7 rendered on a RunPod RTX A4500 (ANGLE/Vulkan, hardware WebGL), the model
sheet (docs/model_sheet.png), stills on every close-up (open, eye macro, love, plan, half, points portrait) and
on the exploded view.

| hook | read | motion | variety | brand | sync | min |
|  9   |  8   |   8    |    8    |   9   |  8   |  8  |

- Hook: the opening macro is now a detailed face: lashes, coral bangs, a clay scan line across closed eyes that
  open on "You" into an amber eye with a spark catchlight.
- Read: unchanged; every line survives the phone pages.
- Motion: every IK and FK pose survived the VRM 0 mirror (mic, belt, point, peace, heart, hips, float, sit); spring
  hair now has 46 long strands that swing and settle on the replay.
- Variety: unchanged; the close-ups carry more because the face holds up at 18 deg fov.
- Brand: hair clay-to-peach with a peach angel ring, oat/ivory/slate uniform, clay ribbing, spark crest, spark
  catchlights, spark hairpin, spark charm. The twin is the same girl inverted, ember tips and red-hot eyes.
- Sync: SFX 57/57 on hits, -14.1 LUFS / -1.2 dBTP; median hit-to-onset 13.5 ms.

Worst three:
1. [b389-397, recap] The exploded view slid the skirt off and showed the base model's underwear, pulled her scalp
   cap 40 cm back (bald head), and still labelled an "ivory tee" with the pin label on the wrong side -> skirt stays
   put, hair moves as one unit, the underwear is recoloured slate shorts, labels read "cricket vest" and the pin
   label tracks the pin.
2. [every close-up] The spark hairpin read as a white daisy (thick bevelled rays) -> ten thin rays, shallow bevel:
   it reads as the spark.
3. [b0-4, b366-373] Shino's heavy bangs hid the closed eyes the scan line is meant to cross, and the eye macro used
   the old model's hard-coded eye offset -> head tilted up 0.1, camera dropped 2 cm; the macro aims at the model's
   own eye bone. Also: the spiral stair opened on 2 s of near-black -> five steps lit from the first frame.

Also: the model is scaled x0.978 to the eye line every camera was framed on, so the 55 shots kept their framing.
Verdict: ANOTHER ROUND (confirm the fixes on a fresh contact pass)
