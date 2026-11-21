# Horizon Atlas 1.02 — Global Geographic Backbone

Open [Atlas 1.02](../horizon-atlas-1.02.html) from a checkout or a static host. It runs from disk with the relative directories intact. There is no build, tile service, package install, or network runtime dependency.

Use **Sites** to jump to Crown Volcanic Complex (17.32° N, 56.87° E), East Crown Range (16.25° N, 54.25° E), or Seam Shield (9.8° N, 179.85° E). At each site open **Geographic resolution** and use **Zoom to width** at 1,000, 200, 100, 20, and 2 km. **Fit planet** returns to the orbital view. The **Planet map** in Research & diagnostics opens on the same backbone. **Legacy terrain and water** and the other research layers show the inherited Atlas 0.01 reference fields.

## World definition and persistence

The default seed is 271828. The identity records the pinned `atlas-1.02/backbone-2` recipe, legacy envelope generator, age, seed, water inventory, and relief settings. The backbone definition has 12 mapped belts, 6 volcanic complexes, and 8 lowlands on the inherited continental envelope. These fixed anchors were placed against the default world. Seeded parameters derive outer folds, spurs, crest ribs, tributaries, subsidiary vents, and basin spillway constraints from parent and segment addresses. Major structures use smooth profiles over their assigned axes. Broad asymmetric foothills and offset volcanic piedmonts extend past the core profiles at planetary and regional render footprints. The terrain recipe advances to backbone-2 while retaining the original seed salt and existing feature positions. Basin subsidence and a softened inherited basement keep the relief concentrated in belts and massifs. The sea datum, shoreline sign and seabed use the inherited envelope.

The runtime builds a small index of 2,413 parent and child feature records. It evaluates elevations on demand using spherical coordinates. A Cartesian lookup avoids longitude-dependent tile borders, including across the antimeridian and at the poles. Feature ID, geometry, and parent are stable within a world. Use the world identity and feature ID together when referring to a feature outside the current world. Tiles store no new canonical terrain. IndexedDB remains available for settings, legacy reference data, and explicit catalog snapshots in the separate 1.02 namespace. The backbone itself requires no persistent cache and stores no history of visits.

`horizonAtlasGeography.world()` exposes the canonical `elevation`, `sample`, `nodes`, `catalog`, `featuresAt`, and `summarize` APIs. The same coordinate has the same elevation at every index level. The map continuously suppresses narrower bands according to the ground footprint and supersamples the widest views. As the footprint shrinks, the same terrain exposes folds, spurs, valleys, ribs, ravines, and vents. Point probes report canonical elevation rather than the filtered display estimate. Equal-area tile summaries aggregate canonical samples. Their reported extrema are sampled and can miss narrow features.

Stage 1.02 uses geometric landform profiles and constrained incision. It has no time-stepped tectonics or erosion, globe-wide catchment solver, lake or river reconciliation, climate feedback, or resolved metre-scale geography. Centerline drainage grades guide future routing. Terrain between and beyond the corridors can contain barriers and closed depressions. Basin and mountain feature geometry describes structural axes and locations. It does not define landform polygon boundaries. Legacy water, climate, and ecology remain separate reference products.

## Release and compatibility

1. Run the tests and audit below from the repository root. Open the new HTML or serve the checkout with an ordinary static server.
2. Merge the release pull request. The proposed `index.html` change routes the GitHub Pages root to 1.02 and retains a direct 1.01 link in its fallback page. If Pages serves a branch other than the target branch, update that publishing branch through the repository's normal deployment workflow.
3. Verify the published root and direct URLs for [1.02](../horizon-atlas-1.02.html), [1.01](../horizon-atlas-1.01.html), [Atlas 0.01](../horizon-056.html), and [3D Horizon 0.04](../horizon-0.04.html). To roll back the default, revert the index change.

Atlas 0.01 and 3D Horizon 0.04 remain the frozen matched pair. The 1.02 elevation, identity, and feature hierarchy are incompatible with their terrain and water contract as well as with 1.01 geographic caches and feature snapshots. The 1.01 math and indexing library is reused unchanged by 1.02.

## Verification

Use Node 24 or newer. Set `HORIZON_CHROME` to a Chrome or Chromium executable if it differs from the test default. Set `HORIZON_SNAPSHOTS` to an output directory to capture browser map frames.

```sh
node --test horizon-atlas-1.01/geography.test.cjs horizon-atlas-1.02/backbone.test.cjs
node horizon-atlas-1.02/browser.test.cjs
node horizon-atlas-1.02/audit.cjs
```

See the [technical report](technical-report.md) for the comparison, performance, and drainage results.
