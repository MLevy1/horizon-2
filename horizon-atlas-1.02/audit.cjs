'use strict';
const {performance} = require('node:perf_hooks');
const os = require('node:os');
const {fixture,offset,windowMetrics,percentile,drainageMetrics} = require('./fixture.cjs');
const {SITES} = require('./backbone.js');
const started=performance.now();
const {world,base}=fixture();
const setupMs=performance.now()-started;
const comparisons=Object.values(SITES).map(({name,point})=>({name,point,elevation:world.elevation(...point),
 widthsKm:[1000,200,100,20,2].map(width=>({width,atlas101:windowMetrics(base,point,width),atlas102:windowMetrics(world,point,width)}))
}));
function globalAudit(surface) {
 const relief=[],slope=[];
 // Equal-area sampling on a spherical Fibonacci lattice. Evaluate land centers
 // and use land-only endpoints to avoid treating coast crossings as mountain relief.
 for(let i=0;i<12000;i++){
  const lat=Math.asin(1-2*(i+.5)/12000)*180/Math.PI;
  const lon=((i*137.50776405)%360)-180;
  const z=surface.elevation(lat,lon);
  if(z<=0)continue;
  const ring=[z];
  for(let j=0;j<8;j++){
   const a=j*Math.PI/4, x=Math.sin(a), y=Math.cos(a);
   const outer=surface.elevation(...offset([lat,lon],x*50,y*50));
   if(outer>0)ring.push(outer);
   const inner=surface.elevation(...offset([lat,lon],x,y));
   if(inner>0)slope.push(Math.abs(z-inner)/10);
  }
  relief.push(Math.max(...ring)-Math.min(...ring));
 }
 const stats=values=>({count:values.length,p50:percentile(values,.5),p90:percentile(values,.9),
  p95:percentile(values,.95),p99:percentile(values,.99),max:Math.max(...values)});
 return {relief100kmM:stats(relief),slope1kmPercent:stats(slope)};
}
const timings=[];
let checksum=0;
for(let batch=0;batch<12;batch++){
 const start=performance.now();
 for(let y=0;y<108;y++)for(let x=0;x<216;x++){
  const global=batch%2===0;
  const lat=global?90-(y+.5)*180/108:17.32+(y/108-.5)*1.8;
  const lon=global?(x+.5)*360/216-180:56.87+(x/216-.5)*1.9;
  checksum+=world.displayElevation(lat,lon,global?185:.95);
 }
 timings.push(performance.now()-start);
}
console.log(JSON.stringify({machine:os.cpus()[0].model,node:process.version,platform:process.platform,setupMs,
 heapMiB:process.memoryUsage().heapUsed/1024**2,rasterKernelMs:timings,checksum,features:world.catalog.records.length,
 comparisons,global:{atlas101:globalAudit(base),atlas102:globalAudit(world)},
 drainage:{atlas101:drainageMetrics(world,base),atlas102:drainageMetrics(world,world)}},null,2));
