(function (root) {
 'use strict';

 const VERSION = 'atlas-1.01/geography-1';
 const RADIUS = 6371000;
 const DEG = Math.PI / 180;
 const MAX_LEVEL = 25;
 const LEVEL_VIEWS = Object.freeze([500000, 100000, 20000, 2000, 200, 20]);
 function wrap(lon) {
  const reduced = lon % 360;
  if (reduced >= 180) return reduced - 360;
  if (reduced < -180) return reduced + 360;
  return reduced === 0 ? 0 : reduced;
 }
 const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
 const mix = (a, b, t) => a + (b - a) * t;
 const validLevel = level => Number.isInteger(level) && level >= 0 && level <= MAX_LEVEL;
 const distance = metres => metres >= 1000 ? (metres / 1000).toPrecision(3) + ' km' : metres.toPrecision(3) + ' m';

 function coordinate(lat, lon) {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon)) throw RangeError('Invalid latitude or longitude');
  return [lat || 0, Math.abs(lat) === 90 ? 0 : wrap(lon)];
 }

 // Two square angular roots. Interior boundaries belong to the tile east or south.
 function tile(level, row, col) {
  if (!validLevel(level)) throw RangeError('Invalid geographic level');
  const rows = 2 ** level;
  if (!Number.isInteger(row) || row < 0 || row >= rows || !Number.isSafeInteger(col)) throw RangeError('Invalid geographic tile');
  const cols = 2 * rows;
  return {level, row, col: ((col % cols) + cols) % cols};
 }

 function locate(lat, lon, level) {
  [lat, lon] = coordinate(lat, lon);
  if (!validLevel(level)) throw RangeError('Invalid geographic level');
  const rows = 2 ** level;
  return tile(level, Math.min(rows - 1, Math.floor((90 - lat) / 180 * rows)),
   Math.min(2 * rows - 1, Math.floor((lon + 180) / 180 * rows)));
 }

 function bounds(address) {
  const {level, row, col} = tile(address.level, address.row, address.col);
  const step = 180 / 2 ** level;
  return {south: 90 - (row + 1) * step, north: 90 - row * step,
   west: -180 + col * step, east: -180 + (col + 1) * step};
 }

 function parent(address) {
  const {level, row, col} = tile(address.level, address.row, address.col);
  return level ? tile(level - 1, Math.floor(row / 2), Math.floor(col / 2)) : null;
 }

 function children(address) {
  const {level, row, col} = tile(address.level, address.row, address.col);
  if (level === MAX_LEVEL) return [];
  return [[0, 0], [0, 1], [1, 0], [1, 1]].map(([y, x]) => tile(level + 1, row * 2 + y, col * 2 + x));
 }

 function levelForExtent(metres) {
  if (!Number.isFinite(metres) || metres <= 0) throw RangeError('Invalid viewing extent');
  return clamp(Math.round(Math.log2(Math.PI * RADIUS / metres)), 0, MAX_LEVEL);
 }

 const provenance = Object.freeze({
  geology: Object.freeze({stepDegrees: 2, status: 'legacy modeled source', source: 'Atlas 0.01 crustal evolution and broad elevation'}),
  hydrology: Object.freeze({stepDegrees: .5, status: 'legacy modeled source', source: 'Atlas 0.01 planetary elevation and routed hydrology'}),
  climate: Object.freeze({stepDegrees: 1, status: 'legacy modeled source', source: 'Atlas 0.01 monthly climate, adjusted fields on 0.5° grid'}),
  terrain: Object.freeze({stepDegrees: .5, status: 'interpolated', source: 'Atlas 0.01 planetary elevation, ultimately dependent on 2° geology'}),
  regional: Object.freeze({nodes: 256, stepDegrees: .5 / 255, polarStepM: 50000 / 255, status: 'provisional',
   source: 'Atlas 0.01 terrain, coastal and routing recipes on 256 × 256 nodes'}),
  roughness: Object.freeze({stepsM: Object.freeze([2, 4, 8, 16, 32, 64]), status: 'provisional',
   source: 'Atlas 0.01 regional interpolation, procedural roughness and inherited water masks'})
 });

 function createWorld(settings, source) {
  const {seed, generator, ageMyr, waterShare, mountainStrength, mountainThreshold, oceanStrength, oceanThreshold} = settings;
  const numericSettings = [seed, ageMyr, waterShare, mountainStrength, mountainThreshold, oceanStrength, oceanThreshold];
  if (typeof generator !== 'string' || !generator || !numericSettings.every(Number.isFinite)) throw RangeError('Incomplete world settings');
  const identity = JSON.stringify([VERSION, generator, ...numericSettings]);
  const {width, height, elevationKm, seaKm} = source;
  if (width !== 720 || height !== 360 || elevationKm?.length !== width * height || !Number.isFinite(seaKm)) {
   throw RangeError('Expected a complete Atlas 0.01 half-degree elevation grid and sea datum');
  }
  const rowMean = row => {
   let sum = 0;
   for (let col = 0; col < width; col++) sum += elevationKm[row * width + col];
   return sum / width;
  };
  const north = rowMean(0), south = rowMean(height - 1);
  const cache = new Map();

  function elevation(lat, lon) {
   [lat, lon] = coordinate(lat, lon);
   const x = (lon + 180) * 2 - .5, y = (90 - lat) * 2 - .5;
   const west = Math.floor(x);
   const col = (west + width) % width, east = (col + 1) % width;
   const at = row => mix(elevationKm[row * width + col], elevationKm[row * width + east], x - west);
   const top = Math.floor(y);
   let km;
   if (y < 0) km = mix(north, at(0), (90 - lat) * 4);
   else if (y >= height - 1) km = mix(south, at(height - 1), (lat + 90) * 4);
   else km = mix(at(top), at(top + 1), y - top);
   return (km - seaKm) * 1000;
  }

  function sample(lat, lon, level) {
   const point = coordinate(lat, lon);
   return {identity, point, address: locate(...point, level), elevationM: elevation(...point),
    provenance: provenance.terrain, resolvedPhysicalStructure: false};
  }

  function tileKey(address, segments = 16) {
   if (!Number.isInteger(segments) || segments < 1 || segments > 64) throw RangeError('Invalid tile sample count');
   const {level, row, col} = tile(address.level, address.row, address.col);
   return JSON.stringify([identity, 'elevation-node-grid', level, row, col, segments]);
  }

  function nodes(address, segments = 16) {
   const key = tileKey(address, segments);
   if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
   }
   const {south, north, west, east} = bounds(address);
   const values = [];
   for (let y = 0; y <= segments; y++) for (let x = 0; x <= segments; x++) {
    values.push(elevation(y === segments ? south : mix(north, south, y / segments),
     x === segments ? east : mix(west, east, x / segments)));
   }
   const result = Object.freeze({key, segments, values: Object.freeze(values), provenance: provenance.terrain});
   cache.set(key, result);
   if (cache.size > 48) cache.delete(cache.keys().next().value);
   return result;
  }

  return Object.freeze({identity, elevation, sample, tileKey, nodes});
 }

 // The stored geometry uses explicit unwrapped longitude (degrees). A crossing
 // segment can run 179 → 181. Multipart geometry can use separate longitude bands.
 function featurePart(part, minimum) {
  if (!Array.isArray(part) || part.length < minimum) throw RangeError('Incomplete geographic geometry');
  let south = 90, north = -90, west = Infinity, east = -Infinity;
  const vertices = part.map(point => {
   if (!Array.isArray(point) || point.length !== 2) throw RangeError('Expected [latitude, unwrapped longitude]');
   const [lat, lon] = point;
   coordinate(lat, lon);
   if (Math.abs(lon) > 540) throw RangeError('Longitude outside supported unwrapped bands');
   south = Math.min(south, lat); north = Math.max(north, lat);
   west = Math.min(west, lon); east = Math.max(east, lon);
   return Object.freeze([lat, lon]);
  });
  if (east - west > 360) throw RangeError('Geometry part spans more than one longitude revolution');
  if (north === 90 || south === -90) {
   // Keep the nonpolar bounds and separately include all tiles touching the pole.
   return {vertices: Object.freeze(vertices), box: {south, north, west, east, polar: true}};
  }
  return {vertices: Object.freeze(vertices), box: {south, north, west, east}};
 }

 function overlaps(a, b) {
  if (a.south > b.north || a.north < b.south) return false;
  if (a.polar && ((a.north === 90 && b.north === 90) || (a.south === -90 && b.south === -90))) return true;
  return [-720, -360, 0, 360, 720].some(shift => a.west + shift <= b.east && a.east + shift >= b.west);
 }

 function featureCatalog(identity, records = []) {
  const byId = new Map();
  for (const input of records) {
   const {id, kind, geometry, parentId = null, level, status, source} = input;
   const minimum = {point: 1, line: 2, polygon: 4}[geometry?.type];
   if (typeof id !== 'string' || !id || byId.has(id) || typeof kind !== 'string' || !kind || !validLevel(level) ||
       !['resolved', 'interpolated', 'provisional'].includes(status) || typeof source !== 'string' || !source ||
       ![1, 2, 4].includes(minimum) || !Array.isArray(geometry.parts) || !geometry.parts.length) throw RangeError('Invalid geographic feature');
   const parts = geometry.parts.map(part => featurePart(part, minimum));
   for (const {vertices} of parts) {
    if (minimum === 1 && vertices.length !== 1) throw RangeError('A point part needs one vertex');
    if (minimum === 4 && vertices[0].some((value, i) => value !== vertices.at(-1)[i])) throw RangeError('Polygon ring must close');
   }
   const record = Object.freeze({id, kind, parentId, level, status, source, geometry: Object.freeze({
    type: geometry.type, parts: Object.freeze(parts.map(part => part.vertices))})});
   byId.set(id, {record, parts});
  }
  for (const {record} of byId.values()) {
   if (record.parentId === null) continue;
   const ancestor = byId.get(record.parentId)?.record;
   if (!ancestor || ancestor.level >= record.level) throw RangeError('Parent must exist at a coarser level');
  }
  const features = Object.freeze([...byId.values()].map(entry => entry.record));
  return Object.freeze({identity, records: features,
   get: id => byId.get(id)?.record,
   query(address) {
    const box = bounds(address);
    return [...byId.values()].filter(({parts}) => parts.some(part => overlaps(part.box, box))).map(entry => entry.record);
   },
   snapshot: () => ({identity, records: features})
  });
 }

 // Callers supply disjoint geometric contributions clipped to each child tile.
 // Empty children have zero weight and null extrema. Missing children are errors.
 function summarizeChildren(address, summaries) {
  const expected = children(address).map(t => JSON.stringify(t));
  if (expected.length !== 4 || summaries.length !== 4) throw RangeError('Expected all four child summaries');
  const {identity, featureId, metric, unit, weightUnit} = summaries[0];
  const scope = {identity, featureId, metric, unit, weightUnit};
  if (Object.values(scope).some(value => typeof value !== 'string' || !value)) throw RangeError('Missing summary scope');
  const byAddress = new Map(summaries.map(summary => {
   if (Object.entries(scope).some(([key, value]) => summary[key] !== value)) throw RangeError('Mixed summary scope');
   const {level, row, col} = summary.address;
   return [JSON.stringify(tile(level, row, col)), summary];
  }));
  const result = {...scope, address: tile(address.level, address.row, address.col), weight: 0, integral: 0, min: null, max: null};
  for (const key of expected) {
   const child = byAddress.get(key);
   if (!child || !Number.isFinite(child.weight) || child.weight < 0 || !Number.isFinite(child.integral) ||
       (child.weight === 0 ? child.integral !== 0 || child.min !== null || child.max !== null
        : !Number.isFinite(child.min) || !Number.isFinite(child.max) || child.min > child.max)) throw RangeError('Invalid child summary');
   if (!child.weight) continue;
   result.weight += child.weight;
   result.integral += child.integral;
   result.min = result.min === null ? child.min : Math.min(result.min, child.min);
   result.max = result.max === null ? child.max : Math.max(result.max, child.max);
  }
  if (!Number.isFinite(result.weight) || !Number.isFinite(result.integral)) throw RangeError('Summary overflow');
  return {...result, mean: result.weight ? result.integral / result.weight : null};
 }

 const api = Object.freeze({VERSION, RADIUS, DEG, MAX_LEVEL, LEVEL_VIEWS, coordinate, wrap, tile, locate,
  bounds, parent, children, levelForExtent, distance, provenance, createWorld, featureCatalog, summarizeChildren});
 if (typeof module === 'object' && module.exports) module.exports = api;
 else root.AtlasGeography = api;
})(globalThis);
