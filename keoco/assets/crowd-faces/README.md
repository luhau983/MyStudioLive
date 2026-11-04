# Spectator meme atlas

These are extracted facial features from the user-supplied `img_ddc71fafee70.jpg`, **not newly drawn/chibi substitutes**. Source SHA-256: `cc6a2f3f651e53afabebc06e3a11ea6e92a5113200de94213bb845a4cbb34686`.

Coordinates below are `(left, top, right, bottom)` in the original 720×1280 image. Extraction preserves the supplied image's grayscale facial shading as alpha, removes near-white JPEG paper, and tints the ink `(27,25,35)`. No facial features are redrawn. Each crop fits within 216×220 pixels, centered in a transparent 256×256 tile. `atlas.png` is 1024×512, four columns by two rows, row-major from top left.

| Tile | Crop asset | Source rectangle | Used for |
| --- | --- | --- | --- |
| 0 | `smile.png` | (48,78,180,178) | cheerful / neutral |
| 1 | `grimace.png` | (228,61,337,180) | worried |
| 2 | `smug.png` | (485,203,587,325) | cheerful / neutral |
| 3 | `laugh.png` | (59,516,178,651) | cheerful |
| 4 | `shock.png` | (207,667,325,800) | worried |
| 5 | `cry.png` | (198,816,326,938) | result loser |
| 6 | `angry.png` | (537,56,666,163) | reserved; not selected by current moods |
| 7 | `cool.png` | (479,1089,618,1210) | cheerful / neutral |

Spectators use one instanced face mesh/material/atlas, with a stable tile attribute per spectator. Support follows the spectator's side of the stand, not shirt color. Shirt colors are deterministic and team-independent. During pulling, substantial disadvantage produces worried faces with hysteresis; a small disadvantage does not. Only authoritative results produce sad losers, cheerful winners, or neutral draws. IDs within each mood are deterministic; tile data only uploads when the side moods change.

Player face materials remain separate from this spectator atlas.

## Puller atlas (`pull-atlas.png`)

Eight more crops from the same source sheet, processed the same way (grayscale shading as alpha, near-white removed, ink tinted `(27,25,35)`, ink scaled to fit 104×112 and centred at (128,116) in a 256×256 tile so features match the measured size and placement of `atlas.png` on the player head). `pull-atlas.png` is 1024×512, four columns by two rows, row-major from top left; order matches `PULL_FACES` in `pull-drama.mjs`.

| Tile | Crop asset | Source rectangle | Used for |
| --- | --- | --- | --- |
| 0 | `rage.png` | (73,373,186,472) | losing / even pull |
| 1 | `squint.png` | (585,350,681,422) | even pull, speechless loser |
| 2 | `scrunch.png` | (467,675,576,777) | losing pull, sad loser |
| 3 | `grin.png` | (343,967,427,1045) | leading pull, winner |
| 4 | `wail.png` | (221,217,323,329) | losing pull, crying loser |
| 5 | `gasp.png` | (367,826,442,926) | yanked toward opponents |
| 6 | `evil.png` | (455,371,559,460) | leading pull, winner |
| 7 | `brows.png` | (344,376,437,480) | even pull, speechless loser |

Players also borrow `cool` (tile 7 of `atlas.png`) as a winner face.
