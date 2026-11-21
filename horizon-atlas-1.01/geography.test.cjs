const assert = require('node:assert/strict');
const test = require('node:test');
const Geo = require('./geography.js');

const settings = {seed: 271828, generator: '053-surfaces-v1', ageMyr: 200, waterShare: .69,
 mountainStrength: 2, mountainThreshold: .5, oceanStrength: .3, oceanThreshold: 3};
const width = 720, height = 360;
const elevationKm = Float32Array.from({length: width * height}, (_, i) =>
 Math.sin(i % width / width * 2 * Math.PI) + Math.floor(i / width) / height);
const source = {width, height, elevationKm, seaKm: .282739448};
const world = Geo.createWorld(settings, source);

test('coordinate validation, wrap, and polar convergence', () => {
 assert.deepEqual(Geo.coordinate(42, 540), [42, -180]);
 assert.deepEqual(Geo.coordinate(90, -123), [90, 0]);
 assert.deepEqual(Geo.coordinate(-90, 180), [-90, 0]);
 assert.throws(() => Geo.coordinate(90.1, 0));
 assert.throws(() => Geo.coordinate(0, Infinity));
 assert.equal(world.elevation(12, 180), world.elevation(12, -180));
 assert.ok(Math.abs(world.elevation(12, -180 + 1e-7) - world.elevation(12, 180 - 1e-7)) < .0001);
 for (const pole of [-90, 90]) for (const lon of [-180, -88, 0, 123, 180]) {
  assert.equal(world.elevation(pole, lon), world.elevation(pole, 0));
  assert.ok(Math.abs(world.elevation(pole - Math.sign(pole) * 1e-8, lon) - world.elevation(pole, 0)) < .0001);
 }
});

test('global tile coverage, parent closure and wrapped addresses', () => {
 for (let level = 0; level <= Geo.MAX_LEVEL; level++) {
  const rows = 2 ** level;
  assert.equal(Geo.tile(level, 0, -1).col, 2 * rows - 1);
  assert.equal(Geo.locate(-90, 177, level).row, rows - 1);
  for (let lat = -90; lat <= 90; lat += 5) for (let lon = -180; lon < 180; lon += 7) {
   const point = Geo.coordinate(lat, lon);
   const address = Geo.locate(...point, level);
   const box = Geo.bounds(address);
   assert.ok(point[0] <= box.north && point[0] >= box.south && point[1] >= box.west && point[1] <= box.east);
   if (level) {
    assert.deepEqual(Geo.parent(address), Geo.locate(...point, level - 1));
    assert.ok(Geo.children(Geo.parent(address)).some(child => child.row === address.row && child.col === address.col));
   }
  }
 }
});

test('shared node values match exactly at ordinary, wrapped, polar and nested edges', () => {
 const n = 16, stride = n + 1;
 for (const level of [1, 6, 12, 20, 25]) {
  const rows = 2 ** level;
  for (const row of [0, rows - 1]) for (const col of [0, 1, rows * 2 - 1]) {
   const a = world.nodes(Geo.tile(level, row, col)).values;
   const east = world.nodes(Geo.tile(level, row, col + 1)).values;
   for (let y = 0; y <= n; y++) assert.equal(a[y * stride + n], east[y * stride]);
   const north = world.nodes(Geo.tile(level, 0, col)).values;
   const south = world.nodes(Geo.tile(level, rows - 1, col)).values;
   for (let x = 0; x <= n; x++) {
    assert.equal(north[x], world.elevation(90, 0));
    assert.equal(south[n * stride + x], world.elevation(-90, 0));
   }
  }
  const a = world.nodes(Geo.tile(level, 0, 1)).values;
  const b = world.nodes(Geo.tile(level, 1, 1)).values;
  for (let x = 0; x <= n; x++) assert.equal(a[n * stride + x], b[x]);
  if (level < Geo.MAX_LEVEL) {
   const child = world.nodes(Geo.children(Geo.tile(level, 0, 1))[0]).values;
   for (let y = 0; y <= n / 2; y++) for (let x = 0; x <= n / 2; x++) {
    assert.equal(a[y * stride + x], child[2 * y * stride + 2 * x]);
   }
  }
 }
});

test('exact coordinate parity, cross-scale sampling and deterministic revisit after eviction', () => {
 for (const [row, col] of [[0, 0], [43, 288], [359, 719]]) {
  const point = [90 - (row + .5) / 2, -180 + (col + .5) / 2];
  const expected = (elevationKm[row * width + col] - source.seaKm) * 1000;
  for (const extent of [40000000, ...Geo.LEVEL_VIEWS]) {
   const sample = world.sample(...point, Geo.levelForExtent(extent));
   assert.equal(sample.elevationM, expected);
   assert.equal(sample.resolvedPhysicalStructure, false);
   assert.equal(sample.provenance.stepDegrees, .5);
  }
 }
 const address = Geo.locate(15.12, 179.999, 20);
 const first = world.nodes(address);
 for (let col = 0; col < 50; col++) world.nodes(Geo.tile(20, 0, col));
 assert.notEqual(world.nodes(address), first);
 assert.deepEqual(world.nodes(address), first);
 assert.deepEqual(Geo.createWorld(settings, source).nodes(address), first);
});

test('versioned cache keys separate world settings, generator, resolution, and legacy keys', () => {
 const address = Geo.tile(2, 1, 0), key = world.tileKey(address);
 assert.ok(key.includes('atlas-1.01/geography-1'));
 assert.notEqual(key, '053-surfaces-v1|271828|0.69|2|0.5|0.3|3|geo|1|0');
 for (const field of Object.keys(settings)) {
  const altered = {...settings, [field]: typeof settings[field] === 'number' ? settings[field] + 1 : 'different'};
  assert.notEqual(Geo.createWorld(altered, source).tileKey(address), key);
 }
 assert.notEqual(world.tileKey(address, 32), key);
 assert.equal(world.tileKey(Geo.tile(2, 1, 8)), key);
});

test('feature identities persist across levels and the seam with validated hierarchy', () => {
 const parent = {id:'test-range', kind:'test', level:3, status:'provisional', source:'synthetic fixture',
  geometry:{type:'line', parts:[[[3, 179], [3, 181]]]}};
 const child = {...parent, id:'test-ridge', parentId:parent.id, level:5};
 const catalog = Geo.featureCatalog(world.identity, [child, parent]);
 for (const level of [2, 6, 20]) for (const lon of [179.9, -179.9]) {
  const matches = catalog.query(Geo.locate(3, lon, level));
  assert.deepEqual(matches.map(feature => feature.id), [child.id, parent.id]);
  assert.equal(matches[0], catalog.get(child.id));
 }
 assert.deepEqual(catalog.query(Geo.locate(3, 0, 6)), []);
 assert.throws(() => Geo.featureCatalog(world.identity, [child]));
 assert.throws(() => Geo.featureCatalog(world.identity, [parent, {...child, level: 3}]));
 const copy = JSON.parse(JSON.stringify(catalog.snapshot()));
 assert.deepEqual(Geo.featureCatalog(copy.identity, copy.records).records, catalog.records);
});

test('coarse summaries require all four unique children and matching measurement scope', () => {
 const address = Geo.tile(1, 0, 0);
 const scope = {identity:world.identity, featureId:'test', metric:'elevation', unit:'m', weightUnit:'m²'};
 const kids = Geo.children(address).map((address, i) =>
  ({...scope, address, weight:i, integral:i*i, min:i || null, max:i || null}));
 const summary = Geo.summarizeChildren(address, kids.toReversed());
 assert.deepEqual(summary, {...scope, address, weight:6, integral:14, min:1, max:3, mean:14/6});
 assert.throws(() => Geo.summarizeChildren(address, kids.slice(1)));
 assert.throws(() => Geo.summarizeChildren(address, [...kids.slice(0, 3), kids[0]]));
 assert.throws(() => Geo.summarizeChildren(address, [...kids.slice(0, 3), {...kids[3], unit:'km'}]));
});
