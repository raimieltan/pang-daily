# Night lighting and post-processing

The baseline look for the hub at night: lo-fi nocturnal realism, not a neon showcase. Every
tunable value lives in `src/game/rendering/LightingConfig.ts`. The systems only read it.

## Per-location light

| Profile | Where | Colour | Character |
|---|---|---|---|
| `sodium` | street lamps on every road | #ff9a3c | sparse and dim on purpose, so roads stay darker than shops |
| `cafe` | Kyo Coffee shopfront and string lights | #ffc27a | warm |
| `fluorescent` | talyer bays | #dcffe6 | flat, slightly green-white |
| `canopy` | Bahandi Fuels canopy | #f2f6ff | brightest spot in the hub |
| `store` | Suki 24 glass front | #f6f8f4 | bright neutral white |
| `porch` | homes along the streets | #ffcf8f | a lone bulb over a gate |

Each lamp gets three layers:

1. **Glow geometry**: lenses, shopfront glass and sign faces use an unlit, fog-free material, so they bloom and read from a distance.
2. **Ground pool**: a fake light pool under every lamp, drawn as an additive vertex-coloured disc (`poolRadius`, `poolStrength`). It always shows and needs no light slot.
3. **Real point light**: only the nearest few lamps get one (`LightPool`).

The pool of real lights has a fixed size (high 4, medium 3, low 2) and follows a point 14 m ahead of the car. A slot only moves to a new lamp after fading its old one out over 0.35 s. Lamps without a slot keep their glow and pool, so nothing visibly switches off.

Pool lights are never enabled or disabled after setup; a free slot is a light at zero intensity. Babylon re-syncs every mesh's light list on `Light.setEnabled`. Doing that per frame in an early build dropped the hub to about 3 fps.

## Time of day (`MOODS`, `SceneLighting.ts`)

The hub runs at `morning`, `afternoon` or `night` (default). Choose at startup with
`?time=morning|afternoon|night`, switch live from the time buttons at the top of the **Graphics**
panel, or send the `setTimeOfDay` command. `timeOfDay` reports the current value.

| | Sky / fog | Key light | Lamps | Exposure | Bloom threshold |
|---|---|---|---|---|---|
| morning | pale blue, light haze | low warm sun from the east | off | 1.15 | 0.95 |
| afternoon | deeper blue, dusty haze | high golden sun from the west | off | 1.1 | 0.95 |
| night | near-black blue | faint cool moon | on | 1.25 | 0.72 |

By day the lamp lights sit at zero intensity, the ground pools are hidden, the headlight beam is
off, and the glow material is dimmed so shopfronts and lenses stop glowing. Switching only changes
light values and colours, never how many lights there are, so it recompiles no shaders.

The surface colours (asphalt, grass, ground) were picked for night and read a little dark in
daylight. Light scales with those colours, so brightening the ground means changing them in
`WorldChunk.ts`, which also brightens night.

## Night mood (`MOODS.night`)

- **Ambient floor**: a hemispheric light (cool sky, warm-dark ground, intensity 0.32). It keeps unlit areas readable, so no pure black anywhere.
- **Moonlight** (the `key` light): a faint cool directional light that picks out roofs, walls and trees between lamps.
- **Exp² fog**: blue-grey fog that hides the far edge of the hub. Glow materials ignore fog, so distant signs still read.

## Cars stay readable (`VEHICLE_LIGHTS`, `VehicleLights.ts`)

- **Headlight**: one spot light (55 m, pitched 6° down) throws the beam from both lamps. Two spot lights would double the per-pixel cost.
- **Headlamp lenses**: emissive, and bright enough to cross the bloom threshold.
- **Tail lamps**: glow at running level, and brighten while braking. In reverse the brake pedal is the throttle, so it doesn't count as braking.
- **Reverse lamp**: lights up in reverse.
- **Car rim light**: a directional light that only touches the player's car meshes (`includedOnlyMeshes`). Paint and silhouette read even on an unlit stretch.

## Post-processing (`POST_TUNING`, `GraphicsSystem.ts`)

The effects run in one `DefaultRenderingPipeline`, with HDR on so emissive surfaces can exceed 1 and bloom:

| Effect | Settings |
|---|---|
| Tone mapping | ACES, contrast 1.12, exposure from the mood (1.25 at night lifts the image so it isn't murky). |
| Bloom | threshold from the mood (0.72 at night), weight 0.32, kernel 32, half-resolution. Only lamps, signs and lenses bloom. |
| Grain | intensity 9, animated |
| Vignette | weight 1.8, stretch 0.35 |
| Chromatic aberration | 14, radial. Off in every preset; toggle it in the panel. |
| FXAA | on |

## Quality presets and debug toggles

| | bloom | grain | vignette | chr. ab. | fxaa | lamp lights | scaling |
|---|---|---|---|---|---|---|---|
| high (default) | ✓ | ✓ | ✓ | | ✓ | 4 | 1× |
| medium | ✓ | ✓ | ✓ | | ✓ | 3 | 1× |
| low | | | ✓ | | | 2 | 1.5× |

- Choose a preset at startup with `?quality=high|medium|low`. Change it live from the **Graphics** panel (top right, hub scene), or with the `setGraphics` command.
- Every effect, plus the ground pools, can be toggled on its own on top of a preset.
- Changing the lamp-light count recompiles world shaders, so only presets change it.

## Measuring performance

The Graphics panel shows `renderStats` once a second:

- fps
- CPU frame time
- GPU frame time: needs `EXT_disjoint_timer_query_webgl2`. Shows "n/a" where the browser hides it (Safari, and Firefox by default).
- draw calls, active meshes, enabled lights

**Benchmark post (off vs on)** runs two phases, each a 1 s warm-up plus 4 s of measuring. The first has every post effect off. The second uses the current settings. It then reports the post stack's cost in ms (CPU, and GPU where available) as a `graphicsBenchmark` event. Hold the car still while it runs, so the two phases see the same view.

### Measured so far

Headless (NullEngine, no GPU, M-series Mac, `vitest`). This covers CPU-side scene cost only:

| | |
|---|---|
| Hub build (6 chunks, no physics) | about 1.3 s |
| Meshes drawn | 173 (239 in the scene, including hidden templates) |
| Triangles | about 85k, props instanced |
| Lamps | 42, of which 4 get real lights on high |
| CPU frame, lighting update plus `scene.render` | about 3 ms |

GPU cost and the real post-processing cost have **not been measured yet**. They need the in-browser benchmark above. Run it on high, medium and low from the coffee shop spawn, then record the numbers here with the machine and browser.

## Per-pixel cost rules

The first in-browser runs dropped from 60 fps (handling track) to about 30 fps in the hub, even
on low. The panel showed 3–5 ms CPU and 13–23 ms GPU, and the GPU time followed what filled the
screen (a wall cost far more than sky). So the hub is GPU-bound, and overdraw and fixed
full-screen passes matter more than any single effect. These rules keep the per-pixel
cost down:

- **Every real light is evaluated for every lit pixel**, whatever its range. The world shader runs 3 fixed lights (ambient, moon, headlight) plus the lamp pool. Keep the pool small and let the ground pools and glowing lenses carry each lamp's look.
- **No specular on world lights.** Any light with non-black `specular` compiles the specular term into every world shader. The vertex-coloured world has no specular anyway.
- **Draw the top layer first.** Markings, roads, lots and ground are stacked opaque layers in one mesh. Buildings come first, then the layers from the top down, so the depth test rejects hidden pixels before they're lit.
- **Nearest first across meshes.** The hub sets front-to-back opaque sorting. All world meshes share one material, so Babylon's default order (material, then creation) drew far chunks first and the car last.
- **No pipeline unless it's needed.** Tone mapping, exposure, contrast and vignette live on the scene's image-processing config. With the HDR pipeline on, it applies them in its last full-screen pass. Without it, the materials apply them in-shader. The pipeline only exists while bloom, grain, chromatic aberration or FXAA is on. Low (vignette only) renders straight to the canvas.
- **The GPU timer is opt-in** (`gpu timer` in the panel, and always on during the benchmark). Per-frame timer queries aren't free on every driver.
- **Hardware scaling is relative** to the engine's own level (1/devicePixelRatio on HiDPI screens). Presets multiply it; they never replace it. An early build overwrote it and rendered Retina screens at CSS resolution.

## Tuning tips

- Too dark overall? Raise the mood's `exposure` or `ambient.intensity` before touching lamps. Too bright? The roads should stay the darkest thing in frame.
- A location feels flat? Raise its profile's `poolStrength` (cheap) before `intensity` (per-pixel).
- Too much bloom? Raise `bloom.threshold`, not just `weight`, so only real light sources bloom.
