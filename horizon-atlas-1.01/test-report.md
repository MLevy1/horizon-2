# Horizon Atlas 1.01 verification

Run from the Horizon workspace with Node.js 24. The browser test uses installed Chrome via its local DevTools port and a disposable profile. Set `HORIZON_CHROME` to the Chrome executable if it is installed somewhere other than the default Windows location.

```powershell
node --test horizon-atlas-1.01/geography.test.cjs
node horizon-atlas-1.01/browser.test.cjs
node horizon-0.04-geometry.test.cjs
```

## Results

| Check | Observed result |
| --- | --- |
| Geography tests | 7 passed. Global coverage from level 0 through 25, wrap, both poles, tile ownership and parent closure, exact shared nodes, source-center parity, same-coordinate sampling across viewing widths, repeatability after eviction, versioned cache identity, feature hierarchy and seam coverage, and weighted rollup validation. |
| Scientific baseline | Headless Chrome opened both Atlas releases directly from disk. Seed, water inventory, sea datum, and the fingerprint of broad elevation, planetary elevation, routing discharge, annual climate and biome buffers matched. A worker-generated antimeridian reference tile matched the frozen 056 height, base, depth and discharge buffers. |
| Geographic map | Chrome at 1380 × 900 confirmed exact coordinate search and wrap, north and south polar navigation, all six viewing widths at each location, elevation stability, nearest-node comparison and the unresolved-detail label. The geographic-only path generated zero legacy terrain tiles. |
| Persistence | A seam-crossing feature fixture retained its ID across reload and was returned by a tile query on the opposite side of the antimeridian. The reopened page restored the selected south pole. The fixture remained in the disposable test profile. |
| Touch and legacy layers | Chrome at 390 × 844 with touch emulation passed pinch, tap, 20 m zoom, and overflow checks. The legacy terrain worker and fine roughness preview ran successfully. The browser harness recorded zero external HTTP requests and zero uncaught page errors. |
| Mobile canvas budget | At 20 m in the emulated phone viewport the main canvas used 871,508 backing pixels, the geographic raster used 14,094 pixels, and no regional legacy tiles were loaded. Median synchronous raster redraw across 20 pans on the test host was about 1.1 ms. This measures CPU raster work on the desktop test host. |
| Frozen 3D geometry | The existing Horizon 0.04 geometry harness completed successfully across its coastal, lake, dry, boreal, tropical, ocean and river fixtures. |

Frozen artifacts were left in place. SHA-256 fingerprints checked in the workspace:

| File | SHA-256 |
| --- | --- |
| `horizon-056.html` | `715C3B41A045D0D62CBBD65893C39F06121C6D8D15013AA166FA4A028F93C8CB` |
| `horizon-0.04.html` | `FF7EE20B97AFC315B7E72ED753D15B0F7DCA8B1739E1278AB85091ADFB68497E` |
| `horizon-0.04/world-source.js` | `F96B12B41EF9B11850E9E5630421C9EB9A152057994CACF3FC6CB999A1AA4C0C` |

Physical mobile devices, Safari, low-memory browser behavior, and the frozen 3D app's interactive WebGL session were outside this run. The browser checks exercise the 1.01 geographic path, representative legacy data and previews. The legacy research panels retain their previous verification coverage in the [Atlas 056 report](../horizon-056-test-report.md).
