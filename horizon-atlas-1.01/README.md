# Horizon Atlas 1.01

Open [Horizon Atlas 1.01](../horizon-atlas-1.01.html) from disk with this directory beside it. The page uses local JavaScript, Canvas 2D, and the integrated Atlas 056 source. There is no build step, network service, package installation, or new external runtime dependency. IndexedDB stores settings, legacy reference tiles, and feature catalogs when browser policy permits. The geographic map and queries work in memory. The legacy regional worker has the inherited main-thread fallback.

Search for latitude and longitude or tap the map to inspect a point. Open **Geographic resolution** in the location panel, choose a comparison width, then use **Zoom to width** to move the map while retaining the selected point. The comparison shows the exact-coordinate elevation, nearest index-tile node and its coordinate, and node spacing at both levels. The map reports unresolved detail when the width falls below the half-degree north–south source spacing. Use **Legacy terrain and water** for the original regional appearance and the **Preview legacy roughness** action.

## Geographic contract

- Coordinates use latitude and longitude in degrees on the existing 6,371 km sphere. Longitude wraps to `[-180, 180)` and longitude at either pole canonicalizes to zero. The map keeps Atlas 056's equirectangular and polar camera modes. The camera changes projection near 75° for local views, while geographic queries and index addresses are projection-independent. Widths describe approximate east–west distance at the view center. Near a pole the viewport uses the polar projection's map-plane width.
- The global index uses two 180° × 180° roots, then four children per tile through level 25. Interior edges are assigned east or south, with wrap and a closed final south edge. Tiles include border nodes. The default 16 segments in each direction give coincident parent/child nodes and exact shared values, including across the antimeridian. Every longitude on a pole row converges to one value.
- `world.sample(lat, lon, level)` returns the same exact height at every level. The level chooses an address and sampling lattice. `world.nodes(address, segments)` materializes that tile on demand. Bilinear interpolation wraps around the half-degree cell centers. The last quarter-degree converges to the mean of the corresponding polar row. The map renders the same continuous field directly on a bounded screen-space raster, so panning across a tile edge does not expose seams or change the underlying height. Blue in this layer identifies elevation below the sea datum. Use the legacy hydrology layers for modeled water connectivity.
- The geographic cache holds up to 48 node grids and keys by geography version, legacy source generator and numerical world settings, product, address, and sample count. The legacy renderer retains its worker, bounded tile and image caches, and existing model recipes under a separate 1.01 key and IndexedDB namespace. Frozen-version cache imports are disabled. Default settings match Atlas 0.01. Changing the legacy relief settings creates a distinct geographic identity. The legacy month and volcanic habitat display settings are outside that identity because they do not affect the elevation source.

## Source support and provenance

| Field | Source support | 1.01 interpretation |
| --- | --- | --- |
| Broad geology | Atlas 0.01 crustal evolution on 2° cells, about 222 km N–S | Legacy modeled field |
| Planetary hydrology and elevation | Atlas 0.01 half-degree routed grid, about 55.6 km N–S, with elevation ultimately derived from broad geology and legacy terrain recipes | Legacy modeled field. The geographic elevation view interpolates this raster. |
| Climate | Atlas 0.01 monthly 1° grid, with adjusted fields on the 0.5° grid | Legacy modeled field |
| Regional terrain and water | Legacy 256 × 256 nodes over 0.5° or 50 km projected polar tiles. About 218 m N–S and latitude-dependent E–W for geographic tiles, about 196 m projected spacing for polar tiles. | Provisional terrain, coastline, and routing recipes |
| Meter roughness | Legacy preview evaluated at 2, 4, 8, 16, 32, or 64 m with inherited regional terrain and water masks | Provisional procedural view |

The 500 km, 100 km, 20 km, 2 km, 200 m, and 20 m controls set viewing widths. Each source retains its original sample support. Stage A publishes no resolved physical features.

## Feature persistence and aggregation

`window.horizonAtlasGeography.world()` exposes the current geographic query object. `AtlasGeography.featureCatalog(identity, records)` validates a catalog. A record has an immutable ID, kind, source, status, geographic geometry, reference level, and optional parent ID. A parent must exist and have a strictly coarser level, preventing cycles and dangling references. Parent links express membership, allowing a tributary to join a network or a ridge to belong to a range. Geometry supports multipart points, lines and closed polygon rings. For a seam crossing, use an unwrapped longitude sequence such as 179° to 181°.

`catalog.query(address)` returns conservative bounding-box candidates, including those crossing the seam and touching either pole. Geometry is stored once regardless of the number of tiles that intersect it. Exact geometric clipping, polygon topology, and incremental feature indexing belong to the feature-producing stages. Catalog writes are validated whole-catalog snapshots in the versioned `features` store. `readFeatures()` and `saveFeatures(catalog)` use the active world identity. A new world starts with an empty catalog. Snapshot writes replace the previous snapshot for that identity. Concurrent writers need external coordination. The legacy cache reset leaves feature catalogs in place.

`AtlasGeography.summarizeChildren(parentAddress, summaries)` combines four disjoint child contributions for one world, feature, metric, value unit, and weight unit. A future producer supplies clipped coverage with a physical area or length weight, weighted integral, and extrema. Report empty children explicitly. The merge sums weights and integrals, computes a weighted mean, and carries extrema. Spatial clipping and boundary ownership happen in the producer, so a feature intersecting several tiles keeps one identity and its contributions can be counted once.

## Compatibility

[Atlas 0.01](../horizon-056.html) and [Horizon 0.04](../horizon-0.04.html) retain their original matched source and seed. Horizon 0.04 consumes its packaged Atlas 0.01 generator and legacy terrain contract. Atlas 1.01 geographic tiles, world IDs, and feature catalogs are incompatible with that 3D data contract. Legacy reference object identifiers retain their original recipe and coordinate keys.

See the [verification report](test-report.md) for test commands and coverage.
