'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {Script} = require('node:vm');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const Geo = require('../horizon-atlas-1.01/geography.js');
const Backbone = require('./backbone.js');
const {fixture,offset,windowMetrics,drainageMetrics} = require('./fixture.cjs');
const {settings,source,base,world} = fixture();
const widths = [40030173,1000000,200000,100000,20000,2000];

test('Atlas ships runnable inline scripts in the existing interface', () => {
 const html=readFileSync(join(__dirname,'../horizon-atlas-1.02.html'),'utf8');
 for(const [,script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Script(script);
 for(const id of ['atlasHome','atlasGeography','atlasSites','atlasApplyExtent','globalLayer'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/horizon-atlas-1\.02\/backbone\.js/);
 assert.match(html,/AtlasBackbone\.createWorld/);
});

test('versioned feature identities and exact elevations survive viewport scale and reverse traversal', () => {
 const second=Backbone.createWorld(settings,source);
 const alternate=Backbone.createWorld({...settings,seed:settings.seed+1},source);
 assert.notEqual(world.identity,base.identity);
 assert.notEqual(world.identity,alternate.identity);
 assert.deepEqual(world.catalog.records,second.catalog.records);
 assert.notDeepEqual(world.catalog.get('east-crown/1/left').geometry,alternate.catalog.get('east-crown/1/left').geometry);
 for(const [key,id] of [['massif','crown-massif'],['range','east-crown'],['seam','seam-shield']]){
  const {point}=Backbone.SITES['backbone-'+key], z=world.elevation(...point);
  const features=world.featuresAt(...point).map(feature=>feature.id);
  assert.ok(features.includes(id),features.join(', '));
  for(const width of widths.slice().reverse()){
   const level=Geo.levelForExtent(width), probe=second.sample(...point,level);
   assert.equal(probe.elevationM,z);
   assert.deepEqual(probe.features.map(feature=>feature.id),features);
   assert.equal(probe.address.level,level);
  }
 }
 assert.ok(world.catalog.records.length<3000);
});

test('real-world fixture develops separate volcanic and linear topography with distinct local bands', () => {
 const massif=Backbone.SITES['backbone-massif'].point, range=Backbone.SITES['backbone-range'].point;
 assert.ok(world.elevation(...massif)>5500);
 assert.ok(!world.featuresAt(...massif).some(f=>f.id==='east-crown'));
 const belt=world.catalog.get('east-crown').geometry.parts[0];
 assert.ok(belt.length>10);
 assert.ok(belt.filter(p=>world.elevation(...p)-base.elevation(...p)>650).length>=belt.length/2);
 for(const point of [massif,range])for(const width of [200,100,20,2]){
  const refined=windowMetrics(world,point,width), prior=windowMetrics(base,point,width);
  assert.ok(refined.relief>prior.relief*1.3);
  assert.ok(refined.slope95>prior.slope95*2);
 }
 assert.ok(Math.abs(world.displayElevation(...range,8)-world.elevation(...range))>70);
 assert.ok(Math.abs(world.displayElevation(...massif,5)-world.elevation(...massif))>100);
 for(const point of [massif,range,offset(range,20,30)])for(const km of [.4,1,2,4,7,12,20,50,100]){
  assert.ok(Math.abs(world.displayElevation(...point,km-.0001)-world.displayElevation(...point,km+.0001))<1);
 }
});

test('canonical nodes join across ordinary, wrapped, polar and parent boundaries', () => {
 const n=8,stride=n+1;
 for(const address of [Geo.locate(9.8,179.85,9),Geo.locate(16.25,54.25,8),Geo.tile(4,0,0),Geo.tile(5,31,63)]){
  const {level,row,col}=address, a=world.nodes(address,n).values;
  const east=world.nodes(Geo.tile(level,row,col+1),n).values;
  for(let y=0;y<=n;y++)assert.equal(a[y*stride+n],east[y*stride]);
  const child=world.nodes(Geo.children(address)[0],n).values;
  for(let y=0;y<=n/2;y++)for(let x=0;x<=n/2;x++)assert.equal(a[y*stride+x],child[2*y*stride+2*x]);
 }
 assert.equal(world.elevation(9.8,-180),world.elevation(9.8,180));
 assert.ok(Math.abs(world.elevation(9.8,-180+1e-8)-world.elevation(9.8,180-1e-8))<.001);
 for(const pole of [90,-90]){
  assert.equal(world.elevation(pole,90),world.elevation(pole,-135));
  assert.ok(Math.abs(world.elevation(pole,0)-world.elevation(pole-Math.sign(pole)*1e-8,-135))<.001);
 }
});

test('coarse area summaries reproduce the same fine samples aggregated by children', () => {
 for(const address of [Geo.locate(17,56,6),Geo.tile(2,0,0),Geo.tile(1,1,3)]){
  const direct=world.summarize(address,4);
  const children=Geo.children(address).map(child=>world.summarize(child,3));
  const combined=Geo.summarizeChildren(address,children.reverse());
  assert.equal(combined.max,direct.max);
  assert.equal(combined.min,direct.min);
  assert.ok(Math.abs(combined.mean-direct.mean)<1e-8);
 }
});

test('basins, passes and channels are explicit constraints on land with inherited shoreline', () => {
 const kinds=new Set(world.catalog.records.map(f=>f.kind));
 for(const kind of ['basin','plain','drainage corridor','tributary corridor','drainage divide','structural ridge','crest rib','volcanic vent'])assert.ok(kinds.has(kind));
 const basin=world.catalog.get('eastern-basin').geometry.parts[0][0];
 assert.ok(world.elevation(...basin)<base.elevation(...basin)-400);
 for(let lat=-89;lat<90;lat+=2)for(let lon=-180;lon<180;lon+=2){
  const z=world.elevation(lat,lon), old=base.elevation(lat,lon);
  assert.ok(Number.isFinite(z));
  assert.equal(z>0,old>0);
 }
});

test('graded routes agree with the proposed flow direction across the global catalog', () => {
 const prior=drainageMetrics(world,base), next=drainageMetrics(world,world);
 assert.ok(next.routes>400);
 assert.equal(next.pairs,prior.pairs);
 assert.ok(next.downhill/next.pairs>.94);
 assert.ok(next.netDescent/next.routes>.98);
 assert.ok(next.downhill>prior.downhill*1.65);
});
