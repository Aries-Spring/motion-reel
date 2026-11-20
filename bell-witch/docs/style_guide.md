# The Bell Witch: style guide

**Idea:** a 200-year-old ghost story found on a cursed disc. The legend is rendered as if by a 1997
console: low-poly, fogged, jittering, and the words are set in 17th-century Fell type, so 1817 print
and 1997 polygons collide. Gritty, surreal, loud when it hits, dead quiet when it should be.

## The PS1 layer (lib/ps1.js)
- 3-D renders at **384x216** (16x9) / **216x384** (9x16) and is upscaled 5x with nearest-neighbour.
- Vertices snap to the low-res pixel grid (the wobble), textures are **affine** (they swim on big
  polygons), lighting is **per-vertex** (Gouraud), fog is per-vertex and heavy.
- 15-bit colour: 5 bits per channel with a 4x4 Bayer dither. Nearest-filtered 32-64 px textures,
  drawn in code (logs, planks, corn, quilt, stone, skin).
- 3-D animates at **30 fps** steps inside the 60 fps film; type and post run at 60.

## Grit (post, after the PS1 layer)
- Film grain (seeded tiles), scanlines on the 5 px PS1 rows, vignette, VHS tear on glitch moments,
  red/cyan split on slam type. No motion blur (it would smear the pixels the look is made of).

## Palette (one accent)
| token | hex | use |
|---|---|---|
| night | `#06070A` | ground of every frame |
| fog | `#2B3140` | fog, far planes |
| bone | `#E9E0C9` | type, moon, candle light |
| ember | `#C9782E` | firelight, dusk (in-world light, not type) |
| **blood** | `#D11A1E` | the one accent: year stamps, KATE, the title |
| witchfire | `#3FD3FF` | one structural moment only: the blue flame (shot 23) |

## Type
- Display: **IM Fell English** (+ its italic for the witch's words). Huge, tight, slammed in on hits.
- UI: **VT323** for captions, dates and the VHS stamp, all caps, wide tracking.
- No centered-title-on-gradient, no fades: words stamp, type on, or tear in.

## Motion
- Cuts on the beat. Knocks and slams are hard cuts with a camera kick. Dolly zooms for dread.
- Two flashes in the whole film: the muzzle flash (in-world) and the blue fire. The scare is a lunge, not a flash.
