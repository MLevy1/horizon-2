'use strict';

// Legacy registration hooks in the frozen script need inert DOM nodes.
// A single explicit scenario input is used by the scientific functions.
const nodes = new Map();
const node = () => ({
 checked: true, value: '', dataset: {}, style: {}, options: [],
 addEventListener() {}, append() {}, getContext() { return {}; }
});
const document = {
 getElementById(id) {
  if (!nodes.has(id)) nodes.set(id, node());
  return nodes.get(id);
 },
 createElement: node
};
function Option() {}

/* INSERT_FROZEN_ATLAS */

const placements = {
 tropical: 'Tropical forest', temperate: 'Temperate forest', boreal: 'Boreal woodland',
 dry: 'Dry terrain', alpine: 'Alpine terrain', coastal: 'Coastal transition'
};
const deg = Math.PI / 180;
const wrap = lon => ((lon + 180) % 360 + 360) % 360 - 180;
const terrainCache = new Map();
let catalog;

function pointToTile(lat, lon) {
 const tile = tileFromLatLon(lat, wrap(lon));
 if (tile.mode === 'geo') {
  // Wrap against the tile origin to keep the antimeridian canonical.
  return {...tile, x: (wrap(lon) + 180 - tile.col / 2) * 510, y: (90 - lat - tile.row / 2) * 510};
 }
 const [x, y] = polarXY(lat, lon, tile.mode);
 return {...tile, x: (x / POLAR_TILE_KM - tile.col) * 255, y: (y / POLAR_TILE_KM - tile.row) * 255};
}

function frameAt(lat, lon) {
 const mode = Math.abs(lat) >= 74.5 ? (lat > 0 ? 'north' : 'south') : 'geo';
 const [x, y] = mode === 'geo' ? [0, 0] : polarXY(lat, lon, mode).map(v => v * 1000);
 return {lat, lon, mode, x, y, scale: R * deg * Math.cos(lat * deg), north: R * deg};
}
function toGeo(frame, x, z) {
 if (frame.mode !== 'geo') return polarLatLon((frame.x+x)/1000,(frame.y+z)/1000,frame.mode);
 return [clamp(frame.lat-z/frame.north,-90,90),wrap(frame.lon+x/frame.scale)];
}
function toLocal(frame, lat, lon) {
 if (frame.mode !== 'geo') {
  const [x, z] = polarXY(lat,lon,frame.mode);
  return [x*1000-frame.x,z*1000-frame.y];
 }
 return [wrap(lon-frame.lon)*frame.scale,(frame.lat-lat)*frame.north];
}
function recall(tile) {
 return terrainCache.get(tileKey(tile.row, tile.col, tile.mode));
}
function terrain(tile) {
 const key = tileKey(tile.row,tile.col,tile.mode);
 let t = terrainCache.get(key);
 if (t) terrainCache.delete(key);
 else t = generateTile(tile.row,tile.col,tile.mode);
 terrainCache.set(key,t);
 mem.set(key,t);
 while (terrainCache.size > 6) {
  const first = terrainCache.keys().next().value, old = terrainCache.get(first);
  terrainCache.delete(first);
  mem.delete(first);
  ecoTiles.delete(old);
 }
 return t;
}
function initialize() {
 initializeWorldFields();
 prepareReaches();
 const sites = prepareEcoWorld().sites;
 catalog = {};
 for (const [kind, label] of Object.entries(placements)) {
  const site = sites[kind];
  if (!site) throw Error('Missing Atlas preset ' + kind);
  const [lat,lon] = site.point?.map(v=>v/deg) ?? [hlat(Math.floor(site.i/HW)),hlon(site.i%HW)];
  catalog[kind] = {label,lat,lon};
 }
 return {catalog, sea:sea*1000, seed:SEED, radius:R, water:waterShare};
}
function start(kind) {
 const site = catalog[kind];
 if (!site) throw Error('Unknown Atlas site');
 const p = pointToTile(site.lat,site.lon), t = terrain(p);
 let i = findEcoFocus(t,kind,[site.lat*deg,site.lon*deg]);
 let bearing=null;
 if(kind==='alpine'){
  const preset=fineSites.find(site=>site.kind==='alpine');
  const alpine=terrain(geoTile(preset.r,preset.c));
  const anchor=preset.y*256+preset.x;
  if(alpine.depth[anchor]===0){
   return describe(kind,site,alpine,anchor,null);
  }
 }
 if(kind==='coastal'){
  // The Atlas fine-terrain coastal preset supplies the search origin.
  const preset=fineSites.find(site=>site.kind==='coast');
  const coastal=terrain(geoTile(preset.r,preset.c));
  let best=Infinity, hit;
  for(let y=2;y<254;y++)for(let x=2;x<254;x++){
   const j=y*256+x;
   if(coastal.depth[j]>0||coastal.height[j]<=sea)continue;
   for(const [dx,dy] of [[2,0],[-2,0],[0,2],[0,-2]]){
    const k=(y+dy)*256+x+dx;
    if(surfaceTileWater(coastal,k)!==MARINE)continue;
    const score=(x-preset.x)**2+(y-preset.y)**2;
    if(score<best){best=score;hit={j,dx,dy};}
   }
  }
  if(hit){
   return describe(kind,site,coastal,hit.j,Math.atan2(-hit.dx,-hit.dy));
  }
 }
 if(t.depth[i]>0) {
  let best = Infinity;
  const target = i;
  for(let j=0;j<t.height.length;j++) {
   if(t.depth[j]>0)continue;
   const d = (j%256-target%256)**2+(Math.floor(j/256)-Math.floor(target/256))**2;
   if(d<best){best=d;i=j;}
  }
 }
 return describe(kind,site,t,i,bearing);
}
function describe(kind,site,t,i,bearing){
 const [lat,lon] = tilePoint(t.row,t.col,Math.floor(i/256),i%256,t.mode).map(v=>v/deg);
 const frame = frameAt(lat,lon);
 const q = pointToTile(lat,lon);
 const elevation = regional(q,recall(q)??terrain(q),false).z;
 const ecology=prepareEcoTile(t),thermal={};
 bioclimate(lat*deg,lon*deg,t.height[i],thermal);
 if (bearing===null && kind==='alpine') {
  // Face the strongest visible valley/ridge sequence around the inherited site.
  let score=-Infinity;
  for(let heading=0;heading<12;heading++){
   const angle=heading*Math.PI/6;
   const heights=[1,4,10,22].map(distance=>landform(...geodesicPoint(lat*deg,lon*deg,distance,angle)));
   const relief=Math.max(...heights)-Math.min(...heights);
   const foreground=t.height[i]-heights[0];
   if(relief+.45*foreground>score){score=relief+.45*foreground;bearing=-angle;}
  }
 }
 return {frame, elevation, site, biome:BIOMES[t.habitat[i]][0], temperature:thermal.mean,
         canopy:ecology.data[i*ECO_STRIDE], name:kind, bearing};
}

const colors = [
 [94,96,89], [115,108,90], [165,145,106], [115,96,68], [101,77,53], [114,127,71]
];
function rgb(r,g,b) { return [r/255,g/255,b/255]; }
// Six Atlas cover fractions, low vegetation, and perennial snow/ice.
function accumulateCover(out, raster, state, i, weight) {
 if (state>=2) {out[7]+=weight;return;}
 if (raster.mask[i]) {out[0]+=weight;return;}
 const d=raster.data,o=i*ECO_STRIDE;
 for(let k=0;k<6;k++)out[k]+=weight*d[o+8+k];
 out[6]+=weight*(1-(1-d[o+3])*(1-d[o+4])*(1-d[o+5]));
}
function groundColor(r,s,i,biome) {
 if (s>=2) return s===3 ? rgb(179,211,219) : rgb(238,239,224);
 const offset = i * ECO_STRIDE, a = r.data;
 if (r.mask[i]) return rgb(101,109,99);
 const out = [0,0,0];
 for (let k=0;k<6;k++) for (let j=0;j<3;j++) out[j]+=colors[k][j]*a[offset+8+k];
 const cover=clamp(.73*a[offset]+.3*a[offset+3]+.68*a[offset+4]+.25*a[offset+5],0,.92);
 const warm = biome===1||biome===2;
 const vegetation=warm?[61,112,57]:[72,105,62];
 return out.map((c,j)=>mix(c,vegetation[j],cover)/255);
}
function broad(lat,lon) {
 const a=lat*deg,b=lon*deg;
 const h = landform(a,b);
 const z = (h-localValleyIncision(a,b,h,localRainfall(a,b)))*1000;
 const p = geoCellFromLatLon(lat,lon), i=hidx(p.row,p.col);
 const marine = hydro.wetOwner[i]>=0 && z<sea*1000;
 const raster=ecoWorld.r;
 const field=raster.data, offset=i*ECO_STRIDE;
 const cover=Array(8).fill(0);
 accumulateCover(cover,raster,raster.mask[i]===2?2:0,i,1);
 return {z, depth:marine?sea*1000-z:0, stage:marine?sea*1000:null, reference:z>=sea*1000?sea*1000:null, type:marine?3:0, cover,
  canopy:raster.mask[i]?0:field[offset], crownHeight:field[offset+1],
  color:marine?rgb(96,105,102):groundColor(raster,raster.mask[i]===2?2:0,i,planetBiomes[i])};
}

function renderWaterType(type,lat,lon) {
 if(type!==3)return type;
 const p=geoCellFromLatLon(lat,lon),owner=hydro.wetOwner[hidx(p.row,p.col)];
 // The regional Atlas groups marine inundation with ocean. Where the
 // planetary graph resolves a separate wet component, label it explicitly.
 return owner>=0&&owner!==hydro.mainWet?4:3;
}

function nodeStage(t,i,type) {
 if(type===3)return sea*1000;
 if(type===2)return t.lakes[t.lakeIds[i]].stage*1000;
 return t.height[i]*1000+t.depth[i];
}

// The Atlas fine sample supplies the footprint and routed longitudinal stage.
// Extend neighboring stages onto the dry side solely to locate bank contact.
function fineHydrology(p,local,cells,regionalSample) {
 const {water,z,river}=local;
 const cell=cells.get(Math.floor(p.x)+','+Math.floor(p.y));
 let reference=water?local.stage:regionalSample.reference;
 if(water===2){
  const u=p.x-Math.floor(p.x),v=p.y-Math.floor(p.y);
  const weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
  const lakes=new Map();
  cell.nodes.forEach(({lake},i)=>{if(lake)lakes.set(lake,(lakes.get(lake)??0)+weights[i]);});
  const lake=[...lakes].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(lake)reference=lake.stage*1000;
 }else if(!water&&river?.ratio<2 && !cell.nodes.some(n=>n.water===3||n.water===2)){
  reference=river.stage;
 }
 const tidal=Math.max(regionalSample.tide,local.tidal,local.aquatic===4?1:0);
 if(!water&&reference===null&&regionalSample.tide>.5)reference=sea*1000;
 return {type:water,z,stage:water?reference:null,reference,tide:tidal};
}

function regional(p,t,includeColor=true) {
 const x=clamp(p.x,0,255),y=clamp(p.y,0,255),ix=Math.min(254,Math.floor(x)),iy=Math.min(254,Math.floor(y));
 const u=x-ix,v=y-iy,i=iy*256+ix,corners=[i,i+1,i+256,i+257];
 const weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
 let z=0,wetWeight=0,tide=0,canopy=0,crownHeight=0;
 const waterTypes=[0,0,0,0], levels=[0,0,0,0], color=[0,0,0], cover=Array(8).fill(0);
 const eco=includeColor?prepareEcoTile(t):null,s=includeColor?prepareSurfaceTile(t):null;
 for(let k=0;k<4;k++){
  const j=corners[k],w=weights[k],depth=t.depth[j];
  z+=w*t.height[j]*1000;
  tide+=w*Number(Boolean(t.coast?.intertidal[j]));
  if(depth>0){
   const type=t.lakeIds[j]>=0?2:t.base[j]<sea?3:1;
   wetWeight+=w;
   waterTypes[type]+=w;
   levels[type]+=w*nodeStage(t,j,type);
  }
  if(eco){
   accumulateCover(cover,eco,s.state[j],j,w);
   const c=groundColor(eco,s.state[j],j,t.biome[j]);
   canopy+=eco.data[j*ECO_STRIDE]*w;
   crownHeight+=eco.data[j*ECO_STRIDE+1]*w;
   for(let a=0;a<3;a++) color[a]+=c[a]*w;
  }
 }
 const dominant=[1,2,3].reduce((a,b)=>waterTypes[a]>=waterTypes[b]?a:b);
 const type=wetWeight>=.5?dominant:0;
 const level=waterTypes[dominant]>0?levels[dominant]/waterTypes[dominant]:null;
 return {z,depth:type?Math.max(0,level-z):0,stage:type?level:null,reference:level,
  type,tide,color,cover,canopy,crownHeight};
}

function tileSet(frame, chunk) {
 const found=new Map();
 // Compact chunks may span several Atlas source tiles, particularly toward the poles.
 for(let row=0;row<=4;row++) for(let col=0;col<=4;col++){
  const p=pointToTile(...toGeo(frame,chunk.x+col*chunk.size/4,chunk.z+row*chunk.size/4));
  const key=tileKey(p.row,p.col,p.mode);
  if(!found.has(key))found.set(key,terrain(p));
 }
 return found;
}
function positionFor(t,x,y) {
 return tilePoint(t.row,t.col,y,x,t.mode).map(v=>v/deg);
}
function inventoryRank(k) {
 let rank=0, weight=.5;
 for(;k;k>>>=1,weight*=.5)rank+=(k&1)*weight;
 return rank;
}
function trees(frame,chunk,source) {
 if(!source||chunk.size>4096) return {records:new Float32Array(), sourceCount:0, area:0, sampled:0};
 const records=[], slots=chunk.size<=1024?2300:900;
 let sourceCount=0,area=0,sampled=0;
 for(const t of source.values()){
  function localNode(x,z) {
   const [lat,lon]=toGeo(frame,x,z);
   if(t.mode==='geo')return [wrap(lon-(-180+t.col*.5))*510,(90-lat-t.row*.5)*510];
   const [px,py]=polarXY(lat,lon,t.mode);
   return [(px/POLAR_TILE_KM-t.col)*255,(py/POLAR_TILE_KM-t.row)*255];
  }
  const corners=[[0,0],[0,1],[1,0],[1,1]].map(([u,v])=>localNode(chunk.x+u*chunk.size,chunk.z+v*chunk.size));
  const extent=i=>[Math.max(0,Math.floor(Math.min(...corners.map(p=>p[i])))-1), Math.min(254,Math.floor(Math.max(...corners.map(p=>p[i])))+1)];
  const [x0,x1]=extent(0),[y0,y1]=extent(1);
  const eco=prepareEcoTile(t);
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
   const cell=objectCell(t,eco,x,y);
   if(cell.mask||!cell.counts[0])continue;
   const [cx,cz]=toLocal(frame,...positionFor(t,x+.5,y+.5));
   const inside=(x,z)=>x>=chunk.x&&z>=chunk.z&&x<chunk.x+chunk.size&&z<chunk.z+chunk.size;
   // Attribute statistics by cell center. Attribute the instances themselves
   // by record position, so adjacent chunks share a half-open ownership edge.
   if(inside(cx,cz)){
    area+=cell.area;
    sourceCount+=cell.counts[0];
   }
   const cohorts=objectCohorts(cell);
   // A low-discrepancy prefix keeps the same Atlas trees when density changes.
   const quota=Math.min(cell.counts[0],Math.max(1,Math.floor(slots*cell.area/(chunk.size**2))));
   const phase=objectRandom(cell.seed,0,0,31);
   const proxy=chunk.size<=1024?1:Math.min(3,Math.sqrt(cell.counts[0]/quota));
   const limit=2**Math.ceil(Math.log2(cell.counts[0]));
   for(let k=0,taken=0;taken<quota;k++){
    // Map the sequence to a power-of-two permutation, skipping unused ordinals.
    // A prefix cannot duplicate stems, even when the population is small.
    const ordinal=(Math.floor(inventoryRank(k)*limit)+Math.floor(phase*limit))%limit;
    if(ordinal>=cell.counts[0])continue;
    taken++;
    const record=objectRecord(cell,0,ordinal,cohorts,false);
    let [px,pz]=toLocal(frame,...positionFor(t,x+record.u,y+record.v));
    // Move candidate render stems within their home population cell. Retain the
    // original position if the alternate would land on modeled regional water.
    if(standRank(px,pz)>cell.canopy && objectRandom(cell.seed,0,ordinal,43)<.76){
     for(let attempt=0;attempt<3;attempt++){
      const u=objectRandom(cell.seed,0,ordinal,44+attempt*2);
      const v=objectRandom(cell.seed,0,ordinal,45+attempt*2);
      const [a,b]=toLocal(frame,...positionFor(t,x+u,y+v));
      if(standRank(a,b)>cell.canopy || regional({x:x+u,y:y+v},t,false).type)continue;
      px=a;pz=b;break;
     }
    }
    if(!inside(px,pz))continue;
    sampled++;
    records.push(px,pz,record.height,record.width,record.azimuth*deg,Number(record.type.slice(5)),objectRandom(cell.seed,0,ordinal,40),proxy);
   }
  }
 }
 return {records:new Float32Array(records),sourceCount,area,sampled};
}

function meshData({frame,chunk,detail}) {
 const n=chunk.size<=1024?65:33;
 const count=n*n,z=new Float32Array(count),stage=new Float32Array(count);
 const depth=new Float32Array(count),water=new Uint8Array(count),color=new Float32Array(count*3),canopy=new Float32Array(count*2);
 const cover=new Float32Array(count*8),tide=new Float32Array(count);
 const source=detail?tileSet(frame,chunk):null;
 const fine = detail && chunk.size<=1024;
 const indexes=new Map();
 for(let y=0;y<n;y++) for(let x=0;x<n;x++){
  const xx=chunk.x+x*chunk.size/(n-1),zz=chunk.z+y*chunk.size/(n-1);
  const [lat,lon]=toGeo(frame,xx,zz), p=pointToTile(lat,lon);
  const key=tileKey(p.row,p.col,p.mode);
  let t=source?.get(key);
  if(source&&!t){t=terrain(p);source.set(key,t);}
  const data=t?regional(p,t):broad(lat,lon);
  let hydro=data;
  if(fine&&t){
   let index=indexes.get(key);
   if(!index){
    const edge=chunk.size/Math.min(...sampleSpacing(p))+20;
    const anchor={...p,spacing:sampleSpacing(p)};
    buildFineRiverIndex(anchor,{x0:p.x-edge,x1:p.x+edge,y0:p.y-edge,y1:p.y+edge});
    index={rivers:fineRiverIndex,cells:new Map()};
    indexes.set(key,index);
   }
   fineRiverIndex=index.rivers;
   const local=fineSample(p,p.x,p.y,index.cells);
   if(local)hydro=fineHydrology(p,local,index.cells,data);
  }
  const i=y*n+x;
  cover.set(data.cover,i*8);
  // Store absence of a neighboring water stage as NaN. The dry fallback is
  // resolved in the renderer and never gives a dry node positive support.
  z[i]=hydro.z;
  stage[i]=hydro.stage??hydro.reference??NaN;
  depth[i]=hydro.type?Math.max(0,stage[i]-z[i]):0;
  water[i]=renderWaterType(hydro.type,lat,lon);tide[i]=hydro.tide??0;color.set(data.color,i*3);
  canopy[i*2]=hydro.type?0:data.canopy;
  canopy[i*2+1]=data.crownHeight;
 }
 fineRiverIndex=null;
 return {chunk,n,z,stage,depth,water,tide,color,canopy,cover,detail,fine,trees:trees(frame,chunk,source)};
}

function inspect(point) {
 const p=pointToTile(point[0],point[1]),t=terrain(p);
 const i=clamp(Math.round(p.y),0,255)*256+clamp(Math.round(p.x),0,255);
 const nearest={height:t.height[i]*1000, depth:t.depth[i], lake:t.lakeIds[i], base:t.base[i]*1000, biome:BIOMES[t.habitat[i]][0]};
 return {p,nearest,regional:regional(p,t)};
}

function audit([lat,lon]) {
 const p=pointToTile(lat,lon),t=terrain(p);
 const x=clamp(Math.round(p.x),0,255),y=clamp(Math.round(p.y),0,255),i=y*256+x;
 const eco=prepareEcoTile(t),offset=i*ECO_STRIDE;
 const cell=objectCell(t,eco,Math.min(254,Math.floor(p.x)),Math.min(254,Math.floor(p.y)));
 const regionalSample=regional(p,t);
 const type=t.depth[i]>0?(t.lakeIds[i]>=0?2:t.base[i]<sea?3:1):0;
 const lake=t.lakes[t.lakeIds[i]];
 buildFineRiverIndex({...p,spacing:sampleSpacing(p)},{x0:p.x-20,x1:p.x+20,y0:p.y-20,y1:p.y+20});
 let fine,hydrology;
 const cells=new Map();
 try{
  fine=fineSample(p,p.x,p.y,cells);
  if(fine)hydrology=fineHydrology(p,fine,cells,regionalSample);
 }finally{fineRiverIndex=null;}
 return {lat,lon,sea:sea*1000,
  node:tilePoint(t.row,t.col,y,x,t.mode).map(v=>v/deg),
  nearest:{z:t.height[i]*1000,slope:habitatSlope(t,x,y,...sampleSpacing(t)),wet:t.depth[i]>0,
   type:renderWaterType(type,...tilePoint(t.row,t.col,y,x,t.mode).map(v=>v/deg)),
   stage:type?nodeStage(t,i,type):null,depth:t.depth[i],
   tidal:Boolean(t.coast?.intertidal[i]),discharge:t.channelQ[i],
   lake:lake?{id:t.lakeIds[i],area:lake.wetArea,stage:lake.stage*1000}:null,
   cover:eco.mask[i]?null:Array.from(eco.data.slice(offset+8,offset+14)),
   canopy:eco.data[offset],density:eco.data[offset+2]},
  cell:{trees:cell.counts[0],area:cell.area,canopy:cell.canopy,masked:Boolean(cell.mask)},
  regional:{...regionalSample,type:renderWaterType(regionalSample.type,lat,lon)},
  fine:fine?{...hydrology,type:renderWaterType(fine.water,lat,lon),water:fine.water,atlasStage:fine.stage,
   depth:fine.water?Math.max(0,hydrology.stage-fine.z):0,
   route:fine.river?{stage:fine.river.stage,ratio:fine.river.ratio,discharge:fine.river.q}:null,
   aquatic:fine.aquatic}:null};
}

self.addEventListener('message',({data:{id,method,args}})=>{
 try{
  const result=({initialize,start,meshData,inspect,diagnose,audit})[method](args);
  const buffers=[];
  if(method==='meshData')for(const array of [result.z,result.stage,result.depth,result.water,result.tide,result.color,result.canopy,result.cover,result.trees.records])buffers.push(array.buffer);
  self.postMessage({id,result},buffers);
 }catch(error){self.postMessage({id,error:String(error.stack||error)});}
});


