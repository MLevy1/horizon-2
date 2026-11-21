# Atlas 1.02 verification report

The map was exercised from disk in Chrome at 1380 × 900 and at 390 × 844 with touch emulation and 4× CPU throttling. Both runs checked that the map and research globe default to the backbone and that the page makes no external requests. The browser tests selected all three comparison sites and rendered each at 1,000, 200, 100, 20, and 2 km. Map frames changed while canonical probe elevations stayed exactly equal. Captured views show the full planetary envelope, the separate massif, and the range's parallel ridges and branching valleys. At closer widths some ridge and crater profiles remain visibly smooth.

The Node tests check ordinary, polar, nested, and antimeridian seams, feature identity and parent stability, repeat generation in reverse traversal order, continuous scale-filter transitions, and agreement between parent and child area summaries. The procedural surface uses smooth footprint transitions. Exact node elevation and feature queries have no dependence on footprint. The 20 km and 2 km comparisons sample a modeled landscape whose underlying geometry still has finite support.

## Local landform comparison

Square tangent-offset windows use 33 × 33 samples. Relief is maximum minus minimum. Slope is the 95th percentile of absolute adjacent-sample grade, expressed as a percentage. Wide windows can include the sea floor. As a result, those relief values are sensitive to the amount of ocean in view. The published 1.01 audit used a different sampling geometry, so the table reruns both versions with identical windows.

| Width | Crown massif relief, m | Crown massif p95 slope | East Crown relief, m | East Crown p95 slope |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 km | 4,925 → 5,169 | 0.83 → 2.68% | 5,920 → 6,094 | 0.73 → 2.75% |
| 200 km | 777 → 3,238 | 0.57 → 3.08% | 2,562 → 3,486 | 0.75 → 8.04% |
| 100 km | 343 → 3,162 | 0.44 → 10.91% | 1,421 → 2,883 | 0.77 → 9.87% |
| 20 km | 79 → 1,993 | 0.42 → 17.20% | 286 → 630 | 0.75 → 4.37% |
| 2 km | 9 → 201 | 0.42 → 26.03% | 29 → 181 | 0.75 → 15.11% |

The Crown Volcanic Complex probe is 5,732 m above the inherited datum. The Seam Shield straddles the antimeridian. Its 20 km relief increased from 35 m to 1,036 m and probes agree exactly at ±180°.

## Global distribution and drainage

A 12,000-point equal-area Fibonacci lattice provided 4,895 land centers and 39,152 land-to-land directional slope observations. The 100 km diameter relief estimate uses the center and eight endpoints at 50 km. Slopes compare the center with eight neighbors 1 km away. This sample emphasizes distribution and can miss extremes.

| Global metric | Atlas 1.01 p50 / p95 / p99 | Atlas 1.02 p50 / p95 / p99 |
| --- | ---: | ---: |
| 100 km land relief, m | 109 / 305 / 570 | 99 / 655 / 1,432 |
| 1 km directional slope, % | 0.067 / 0.254 / 0.449 | 0.061 / 0.379 / 1.883 |

The 514 transverse-valley and basin-outlet centerlines are sampled at 13 interior stations each. Net descent occurs on 511 corridors versus 283 on the same paths in 1.01. Of 6,153 land-only consecutive station pairs, 5,888 descend in 1.02 (95.7%) versus 3,373 in 1.01 (54.8%). The other 265 pairs include local barriers or non-descending edges. This measures centerline consistency only. Catchment delineation, basin spill verification, flow conservation, discharge, and climate/erosion coupling require a later model. The legacy shoreline remains at the previous datum and sea-volume feedback is outside this stage.

## CPU and memory

On a Windows Ryzen 7 9700X with Node 24.22.3, a 23,328-sample kernel took about 4–8 ms on global batches and 11–15 ms on dense Crown batches. Initializing the inherited fields and backbone together took about 0.9 s in Node. A desktop Chrome session measured 12 ms for a forced orbital redraw and 5–21 ms for the zoom comparisons. At 4× CPU slowdown in the touch viewport it measured 21 ms for the orbital redraw and 18–78 ms for regional comparisons. The geography render used approximately 24,000 desktop raster pixels and 14,500 touch raster pixels. Chrome reported about 9 MiB and 22 MiB of used JavaScript heap at the desktop and touch check points. These are snapshots affected by garbage collection and exclude canvas, typed-array backing stores, and browser-process memory.

The geometry and runtime remain suitable for a static site. Dense regional redraws at 4× throttling can exceed a single-frame budget. Real-device thermal, battery, and sustained gesture performance remain unmeasured.
