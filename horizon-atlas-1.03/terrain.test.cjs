'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Geo=require('../horizon-atlas-1.01/geography.js');
const {fixture,offset}=require('../horizon-atlas-1.02/fixture.cjs');
const Terrain=require('./terrain.js');
const {world:backbone,settings}=fixture();
const world=Terrain.createWorld(backbone,settings.seed);
const focus=world.pilot.focus;

test('authoritative elevations survive address changes, cache eviction and traversal order',()=>{
 const points=Array.from({length:25},(_,i)=>offset(focus,(i%5-2)*.19,(Math.floor(i/5)-2)*.19));
 const expected=points.map(point=>world.elevation(...point));
 const fresh=Terrain.createWorld(backbone,settings.seed);
 for(let i=0;i<800;i++){
  const path=Array.from({length:5},(_,j)=>[(i>>j)&1?1:-1,Math.floor(i/5**j)%5]);
  fresh.pilot.channel(path);
 }
 assert.equal(fresh.pilot.cacheSize(),384);
 for(let i=points.length-1;i>=0;i--){
  for(const level of [0,9,17,25])assert.equal(fresh.sample(...points[i],level).elevationM,expected[i]);
  assert.equal(fresh.displayElevation(...points[i],0),expected[i]);
 }
 for(const point of [[0,0],[17.32,56.87],[89,179],[-75,-30]]){
  assert.equal(world.elevation(...point),backbone.elevation(...point));
  assert.equal(world.displayElevation(...point,2),backbone.displayElevation(...point,2));
 }
});

test('shared geographic edges and nested vertices agree exactly',()=>{
 for(const level of [8,12,16,20,25]){
  const tile=Geo.locate(...focus,level), n=8, stride=n+1;
  const a=world.nodes(tile,n).values;
  const b=world.nodes({...tile,col:tile.col+1},n).values;
  const c=world.nodes({...tile,row:tile.row+1},n).values;
  const child=level<25?world.nodes(Geo.children(tile)[0],n).values:null;
  for(let i=0;i<=n;i++){
   assert.equal(a[i*stride+n],b[i*stride]);
   assert.equal(a[n*stride+i],c[i]);
  }
  if(child)for(let y=0;y<=n/2;y++)for(let x=0;x<=n/2;x++)
   assert.equal(a[y*stride+x],child[2*y*stride+2*x]);
 }
});

test('trunk and connected branches at five scales follow their descending grades',()=>{
 const trunk=Array.from({length:65},(_,i)=>world.elevation(...world.pilot.trunkPoint(i/64)));
 assert.ok(trunk.every((z,i)=>i===0||z<trunk[i-1]));
 const [head,,outlet]=backbone.catalog.get('east-crown/7/right/outlet').geometry.parts[0];
 assert.ok(Math.abs(trunk[0]-backbone.elevation(...head))<.00001);
 assert.ok(Math.abs(trunk.at(-1)-backbone.elevation(...outlet))<.00001);
 for(const side of [-1,1])for(let slot=0;slot<5;slot++){
  const path=[[side,slot]];
  for(let depth=1;depth<=5;depth++){
   const channel=world.pilot.channel(path), expectedParent=depth===1?null:world.pilot.channel(path.slice(0,-1));
   if(expectedParent)assert.equal(channel.parentId,expectedParent.id);
   for(let i=0;i<=24;i++){
    const t=i/32;
    assert.ok(Math.abs(world.elevation(...channel.point(t))-channel.grade(t))<.00001,channel.id+' '+t);
    if(i)assert.ok(channel.grade(t)>channel.grade((i-1)/32));
   }
   for(const bank of [-.2,.2]){
    const bankHeight=world.elevation(...channel.point(.75,bank*channel.widthKm));
    assert.ok(bankHeight>channel.grade(.75),channel.id+' bank');
   }
   path.push([-side,(slot+depth)%5]);
  }
 }
 assert.ok(world.pilot.channel([[1,0]]).glacial>.8);
 assert.equal(world.pilot.channel([[1,3]]).glacial,0);
});

test('fixed geographic samples gain relief across rendering footprints',()=>{
 // Keep each sampling lattice fixed. A change in elevation comes from
 // resolving geographic structure, independently of raster dimensions.
 for(const [width,minimum] of [[200,35],[20,20],[5,6],[1,2],[.25,2]]){
  const fine=width/120, n=49;
  let max=0;
  for(let i=0;i<n*n;i++){
   const point=offset(focus,(i%n-24)*width/n,(Math.floor(i/n)-24)*width/n);
   max=Math.max(max,Math.abs(world.displayElevation(...point,fine)-world.displayElevation(...point,fine*4)));
  }
  assert.ok(max>minimum,width+' km window gained only '+max+' m');
 }
});
