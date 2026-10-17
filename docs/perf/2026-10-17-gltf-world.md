# Performance pass: authored glTF world (2026-10-17)

Silent Tide, seed 42, all squad members, 28 characters, night and rain, measured with the in-game
`PerfProbe` (`window.__OS_RENDER__`: draw calls and triangles summed over every pass of a frame,
so shadow cascades, the water reflection and post-processing are included) on the M5 Pro at
1512 × 749 CSS px, development build. Frame rate is capped at 120 by the display.

## Before and after

| View | Preset | Before the pass | After the pass | Budget |
|---|---|---|---|---|
| Opening view | High (models, rich environment) | 1,154 calls · 6.40 M tris | **375–412 calls · 1.42–1.93 M tris** · 120 fps | ≤ 600 · ≤ 2.0 M |
| Zoomed fully out (whole map) | High | 1,247 calls · 5.51 M tris | **698 calls · 1.98 M tris** · 120 fps | ≤ 600 · ≤ 2.0 M |
| Opening view | Performance | n/a | **119 calls · 0.43 M tris** · 120 fps | ≤ 300 · ≤ 0.6 M |
| Zoomed fully out (whole map) | Performance | n/a | **585 calls · 0.78 M tris** · 120 fps | ≤ 300 · ≤ 0.6 M |

The High range depends on whether the sampled frame draws the water reflection (every other
frame). Numbers include the card-built trees (below).

The full-map overview (up to 190 m, added after the budgets were written) is over the draw-call
budget on both presets: every character, door and prop on the map is on screen at once. The
play-distance view is within budget on both.

## What changed

| Change | Effect |
|---|---|
| Skinned meshes culled by a fixed sphere around the figure (they had culling off) | Off-screen characters no longer drawn in the main and reflection passes |
| Only the body (and coat skirt) casts a character's shadow; kit, hair and face do not | ≈ 8 fewer shadow draws per character per cascade |
| Shadow proxies on a shadow-only layer: a 3.5 k-triangle skinned LOD body per character (same skeleton), the procedural model for each authored prop kind, and the heightfield at 1 m for the terrain | Each cascade draws a fraction of the triangles |
| Door hardware casts no shadow (only the leaf does) | ≈ 2 fewer shadow draws per door per cascade |
| Shrub model budget 6 k → 2.4 k triangles | Hundreds of instances, every pass |
| Eyes and eyebrows hidden beyond 35 m | 2 fewer draws per distant character |
| The water reflection leaves out characters and interactive objects, and is skipped (faded out) above 110 m | The mirror pass carries buildings, props and terrain only, and nothing at overview zoom |
| Trees rebuilt from alpha-tested cards (about 300 triangles a pine) instead of layered cones | More detail for about the same cost; their shadows keep the gaps between branches |
| Animation level of detail: off-screen characters frozen, the nearest 24 on screen at full rate, the rest every other frame | Mixer cost bounded (budget: ≤ 24 at full rate on High) |

## Texture memory and KTX2

Measured from the shipped files (RGBA with mipmaps): authored model textures 50 MB (52 textures,
0.9 MB as WebP), surface sets 75 MB at 512 px plus 75 MB for the 1 k colour maps (rich
environment), terrain layer arrays about 60 MB, three 2048 px shadow cascades 50 MB and the
reflection target 2 MB: **about 320 MB on High** against the 768 MB budget.

KTX2 (Basis) would cut the texture share by 4–8× but needs a WebAssembly transcoder (a
`wasm-unsafe-eval` exception in the content security policy and about 200 kB more), an encoder in
the media image, and costs visible quality on normal maps at ETC1S. With the High preset at
less than half its texture budget it is **not adopted**; revisit if the budget is reached.

## Bundle

The authored-model code loads only when its setting is on (`React.lazy`), so the Performance
preset downloads none of it: glTF loader 23 kB gz, HDR environment 24 kB gz, character rig and
library 13 kB gz, cascaded shadows 4 kB gz. `make scan-bundle`: no secrets in the client bundle.
