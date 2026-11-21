# Horizon 056 verification

Open [horizon-056.html](horizon-056.html) directly from disk. Search for latitude and longitude or choose a representative site. Tap the map to inspect a location. Zoom in for regional terrain, then use **Inspect fine terrain** to view a local patch in the same map. **Research & diagnostics** contains the original map comparisons, simulations’ audit controls, and exports.

## Baseline parity

The workspace [Horizon 055 baseline](horizon-055.html) matched the uploaded attachment byte for byte. Its SHA-256 is `620B58FD2BB1262D636E67ED22E50A51B7ECE24D60C76332923381CFC9E2CF70`.

| Check | Result |
| --- | --- |
| Default seed and water | Seed 271828. Calculated water volume matched 0.69× Earth’s ocean volume within 1 part in 10 billion. |
| Sea datum and planetary land | +282.739448 m relative to the model datum. Geological surface above sea level was 41.166955%, with 58.833045% below it. |
| Planetary fields | Both builds produced identical byte fingerprints for the sampled model buffers, hydrology, monthly climate, and biomes. The full planetary snow, ice, volcanic and ecological buffers also matched. |
| Regional data and wrapping | The worker-generated test tile matched 055’s typed arrays, summary, and lake count. All 256 shared base nodes at the tested antimeridian edge matched exactly. |
| Fine terrain and objects | The 16 m patch had 16,641 finite samples. Its center elevation matched the inherited fine sampler to float32 precision. The sampled tropical forest cell matched 055’s counts, tree cohorts, and checked serialized object records. It contained 8,286 trees. |

## Browser and resource checks

- Parsed the inline scripts and ran [the regression harness](horizon-056.test.cjs) in local Chrome from `file://`. Tested mouse pan, wheel zoom and probe, touch drag, tap and pinch, coordinate validation, wrapping, both poles, site navigation, layer changes and blending, climate details, fine terrain, and diagnostics access.
- Tested a 1380 × 900 desktop viewport, a 390 × 844 touch viewport, and an 820 × 1180 touch tablet viewport. Reviewed desktop and phone screenshots. The tablet used the full-width map layout.
- Verified that a reopened page restored the last searched or preset location. With networking disabled, it reused a saved tile without regeneration and generated a fresh tile. Chrome reported no external HTTP requests or uncaught page errors.
- The first fresh regional tile took roughly 2.4–2.8 seconds on the test host, including the idle delay, worker startup and cache write. The atlas queues one tile at a time when the view settles. The in-memory limits are 10 raw tiles on desktop and 6 in the compact layout, plus 16 regional rasters and 5 planetary rasters. The atlas-managed IndexedDB tile cache retains up to 36 entries. The primary map canvas targets at most about 2.2 million backing pixels. The legacy research tools retain their explicit neighborhood-generation controls.

## Limits

- The atlas shows sample provenance at each scale. Climate maps use the 1° model with elevation adjustment on the 0.5° grid. Fine patches refine inherited terrain and water footprints at 2–64 m spacing. Fine-scale water boundaries and depths inherit the regional routing and stage assumptions.
- The overview stays visible while regional tiles load. At intermediate zooms or near the geographic-to-polar handoff, the viewport can contain both regional detail and coarse fallback. Polar regional channel refinements still have the limits of 055. Fine patches cover a bounded area around the chosen location.
- Chrome touch emulation covered the interface and gestures. Physical iPhone and iPad performance, Safari, and low-memory browser behavior were unverified. With local storage or workers unavailable, the atlas can generate terrain in the session using the main thread as needed, with possible pauses.
