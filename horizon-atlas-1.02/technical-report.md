# Atlas 1.02 verification report

The map was exercised from disk in Chrome at 1380 × 900 and at 390 × 844 with touch emulation and 4× CPU throttling. Both runs checked that the map and research globe default to the backbone and that the page makes no external requests. The browser tests selected all three comparison sites and rendered each at 1,000, 200, 100, 20, and 2 km. Map frames changed while canonical probe elevations stayed exactly equal. Captured views show the full planetary envelope, the separate massif, and the range's parallel ridges and branching valleys. Broad foothills and volcanic piedmonts contribute elevation outside the core profiles at orbital and regional footprints. The transition tests check their presence and asymmetry. At closer widths some ridge and crater profiles remain visibly smooth.

The Node tests check ordinary, polar, nested, and antimeridian seams, feature identity and parent stability, repeat generation in reverse traversal order, continuous scale-filter transitions, and agreement between parent and child area summaries. The procedural surface uses smooth footprint transitions. Exact node elevation and feature queries have no dependence on footprint. The 20 km and 2 km comparisons sample a modeled landscape whose underlying geometry still has finite support.

## Local landform comparison

Square tangent-offset windows use 33 × 33 samples. Relief is maximum minus minimum. Slope is the 95th percentile of absolute adjacent-sample grade, expressed as a percentage. Wide windows can include the sea floor. As a result, those relief values are sensitive to the amount of ocean in view. The published 1.01 audit used a different sampling geometry, so the table reruns both versions with identical windows.

| Width | Crown massif relief, m | Crown massif p95 slope | East Crown relief, m | East Crown p95 slope |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 km | 4,925 → 5,243 | 0.83 → 2.30% | 5,920 → 6,167 | 0.73 → 2.27% |
| 200 km | 777 → 3,234 | 0.57 → 2.68% | 2,562 → 3,437 | 0.75 → 7.75% |
| 100 km | 343 → 3,064 | 0.44 → 9.98% | 1,421 → 2,590 | 0.77 → 9.93% |
| 20 km | 79 → 1,921 | 0.42 → 17.21% | 286 → 619 | 0.75 → 4.28% |
| 2 km | 9 → 201 | 0.42 → 26.01% | 29 → 183 | 0.75 → 15.17% |

The Crown Volcanic Complex probe is 5,806 m above the inherited datum. The Seam Shield straddles the antimeridian. Its 20 km relief increased from 35 m to 961 m and probes agree exactly at ±180°.

## Global distribution and drainage

A 12,000-point equal-area Fibonacci lattice provided 4,895 land centers and 39,152 land-to-land directional slope observations. The 100 km diameter relief estimate uses the center and eight endpoints at 50 km. Slopes compare the center with eight neighbors 1 km away. This sample emphasizes distribution and can miss extremes.

| Global metric | Atlas 1.01 p50 / p95 / p99 | Atlas 1.02 p50 / p95 / p99 |
| --- | ---: | ---: |
| 100 km land relief, m | 109 / 305 / 570 | 101 / 623 / 1,254 |
| 1 km directional slope, % | 0.067 / 0.254 / 0.449 | 0.063 / 0.407 / 1.798 |

The 514 transverse-valley and basin-outlet centerlines are sampled at 13 interior stations each. Net descent occurs on 510 corridors versus 283 on the same paths in 1.01. Of 6,153 land-only consecutive station pairs, 5,800 descend in 1.02 (94.3%) versus 3,373 in 1.01 (54.8%). The other 353 pairs include local barriers or non-descending edges. This measures centerline consistency only. Catchment delineation, basin spill verification, flow conservation, discharge, and climate/erosion coupling require a later model. The legacy shoreline remains at the previous datum and sea-volume feedback is outside this stage.

## CPU and memory

On a Windows Ryzen 7 9700X with Node 24.22.3, a 23,328-sample kernel took about 4–9 ms on global batches and 15–23 ms on dense Crown batches. Initializing the inherited fields and backbone together took about 1 s in Node. A desktop Chrome session measured 13 ms for a forced orbital redraw and 5–28 ms for the zoom comparisons. At 4× CPU slowdown in the touch viewport it measured 23 ms for the orbital redraw and 21–105 ms for regional comparisons. The geography render used approximately 24,000 desktop raster pixels and 14,500 touch raster pixels. Chrome reported about 16 MiB and 32 MiB of used JavaScript heap at the desktop and touch check points. These are snapshots affected by garbage collection and exclude canvas, typed-array backing stores, and browser-process memory.

The geometry and runtime remain suitable for a static site. Dense regional redraws at 4× throttling can exceed a single-frame budget. Real-device thermal, battery, and sustained gesture performance remain unmeasured.
