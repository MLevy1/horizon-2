# Horizon Atlas 1.03

Open [Horizon Atlas 1.03](../horizon-atlas-1.03.html) from the checkout or a static host. In **Sites**, select **East Crown watershed refinement**. The Atlas opens at 1,000 km. Under **Geographic resolution**, use **Zoom to width** at 200 km, 20 km, 5 km, 1 km, and 250 m. The site centers on a nested headwater system on the western flank of the East Crown Range. The probe holds its coordinate and canonical elevation across these views.

## What changed

In 1.02, the backbone builds a global catalog of ribbons, including subsidiary ridges and drainage corridors, at initialization. Its point evaluator combines independent contributions using maxima, sums, and bounded incision. Changes in render footprint fade those existing contributions. Hierarchical tile addresses index the resulting field. The separate fine preview uses the legacy Atlas terrain and water recipe, and the backbone’s bounded incision can leave adverse grades.

1.03 uses the inherited East Crown corridor `east-crown/7/right/outlet` and its land envelope as constraints. The inherited surface provides the continental and belt-scale landscape, a shoulder envelope sampled at a fixed 7 km footprint, and three elevation anchors for a permanent trunk profile. A continuous transition connects the modeled basin to the neighboring 1.02 terrain. Inside the basin, the watershed surface replaces the inherited ribbon profiles. The pilot is disabled if changed world settings leave its outlet submerged or its anchor elevations unable to support the prescribed grade.

The root record contains a channel axis, downhill floor, width, and cross-valley relief. The centerline goes through the inherited head, bend, and outlet. Descendant records contain a parent address, side, station cell, junction grade, reach, width, curvature, relief budget, and glacial influence. A tributary starts on its parent’s floor and rises upstream. Its extent and relief derive from the parent’s geometry. Bounded banks and the terrain between tributaries form interfluves. The upper basin uses broader, glacially influenced valley sections. Lower tributaries develop sharper fluvial cross sections. Those differences affect elevation and come from profile geometry and elevation-based glacial influence.

Five successive branch depths are available inside the pilot. Broad views retain the major range and generalized trunk. Closer views resolve lateral valleys and intervening ridges, then smaller tributary valleys and headwater gullies. The 25 existing tile address levels can all query the same field. Branch depth and address level are independent.

## Permanence and rendering

- **World identity.** The terrain recipe version and the inherited world identity identify the surface. The root geometry and anchors are fixed when the world model is created. The seed and parent-relative address determine each branch’s geometry. Camera position and generation order do not enter those calculations.
- **One elevation field.** `elevation`, `sample`, `nodes`, and `summarize` query authoritative terrain. `displayElevation` continuously reduces the contribution from valleys narrower than the ground footprint. It uses the same junctions and branch geometry. The map and the planet diagnostics use this render path.
- **Shared edges.** Geographic tiles sample global coordinates, including their exact shared vertices. Channel generation takes place in the parent’s coordinate frame, independent of tile bounds. Each branch fades into its parent surface before the edge of its station cell. Descendants remain within their parent’s head and bank transitions.
- **On-demand work.** A query follows the branch whose station cell contains the coordinate. The model keeps up to 384 branch records in a least-recently-used cache. Render queries stop descending once a branch is too narrow for the current footprint. The interactive renderer caps its raster near 14,500 samples on compact screens and 24,000 on desktop, yields between batches of rows, and discards stale jobs when the camera moves. A previously completed view can be reprojected while the current view resolves.

## Verification

```sh
node --test horizon-atlas-1.01/geography.test.cjs horizon-atlas-1.02/backbone.test.cjs horizon-atlas-1.03/terrain.test.cjs
node horizon-atlas-1.03/browser.test.cjs
```

The model tests cover deterministic regeneration after eviction, exact elevation equality at shared and nested tile vertices, graded trunk and branch centerlines, higher banks along sampled reaches, and elevation differences at fixed sampling coordinates across five render footprints. The browser test uses Chrome on desktop and at a 390 × 844 touch viewport with 4× CPU throttling. It checks selectable zoom widths, an identical raster on revisit, invariant probe elevation, bounded raster size, and runtime errors. Set `HORIZON_CHROME` to use a different executable or `HORIZON_SNAPSHOTS` to save the zoom frames.

## Remaining work

This is one modeled watershed. The pilot protects the trunk outlet and the graded reaches it constructs. Surface-wide drainage routing, catchment and divide validation, discharge, lakes, and continuity downstream of the inherited outlet remain unresolved. The terrain represents fine gullies and relief geometry. It has no soil, sediment, or boulder model. Legacy water, climate, ecology, and fine preview remain reference layers.

World-scale extension needs an explicit planetary basin graph with shared divides, outlets, and channel grades, including across coastlines and regional projections. More geological provinces need to supply erosion, structure, and glaciation parameters. Neighboring basins need shared boundary conditions and flow-routing tests so valid centerline profiles translate into valid drainage across each surface. Physical iPhone and Safari performance still needs measurement.
