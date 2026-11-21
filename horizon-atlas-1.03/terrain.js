(function (root) {
 'use strict';
 const Geo = typeof module === 'object' ? require('../horizon-atlas-1.01/geography.js') : root.AtlasGeography;
 const VERSION = 'atlas-1.03/east-crown-watershed-1';
 const ROOT_ID = 'east-crown/7/right/outlet';
 const KM = Geo.RADIUS * Geo.DEG / 1000;
 const STAGES = 5;
 const CACHE_LIMIT = 384;
 const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
 const smooth = x => { const t = clamp(x); return t*t*(3-2*t); };
 const mix = (a,b,t) => a+(b-a)*t;

 function hash(seed, id) {
  let value = seed | 0;
  for (let i=0; i<id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  return ((value ^ value >>> 15) >>> 0) / 4294967296;
 }

 function createWorld(backbone, seed) {
  const identity = JSON.stringify([VERSION, ...JSON.parse(backbone.identity), seed]);
  const [head,bend,outlet] = backbone.catalog.get(ROOT_ID).geometry.parts[0];
  const projection = KM*Math.cos(head[0]*Geo.DEG);
  const east = (outlet[1]-head[1])*projection, north=(outlet[0]-head[0])*KM;
  const length=Math.hypot(east,north), ex=east/length, ey=north/length;
  function project(lat,lon) {
   const x=Geo.wrap(lon-head[1])*projection, y=(lat-head[0])*KM;
   return [x*ex+y*ey, -x*ey+y*ex];
  }
  function unproject(u,v) {
   return [head[0]+(u*ey+v*ex)/KM, Geo.wrap(head[1]+(u*ex-v*ey)/projection)];
  }
  const [bendU,bendV]=project(...bend);
  // Interpolate the inherited bend with a continuously differentiable centerline.
  const center=u=>bendV*(u/length)*(1-u/length)/(bendU/length*(1-bendU/length));
  const envelope=(lat,lon)=>backbone.displayElevation(lat,lon,7);
  const low=backbone.elevation(...outlet), high=backbone.elevation(...head);
  const middle=clamp(backbone.elevation(...bend),low+10,high-10);
  const active=low>0 && high>low+20;
  const floor=u=>u<bendU ? mix(high,middle,smooth(u/bendU)) : mix(middle,low,smooth((u-bendU)/(length-bendU)));
  const geology=Object.freeze({
   province:'East Crown folded bedrock', resistance:.72, glacialThresholdM:3500, glacialTransitionM:620
  });
  function layout(id,reach) {
   return [-1,1].map(side=>Array.from({length:6},(_,i)=>{
    const offset=i===0||i===5?0:(hash(seed,id+'/'+side+'/boundary/'+i)-.5)*.82;
    return (i+offset)*reach*.15;
   }));
  }
  const trunk=Object.freeze({id:ROOT_ID, depth:0, length, width:25, relief:920, floor, layout:layout(ROOT_ID,length)});
  const cache=new Map();
  function drift(parent,side,run) {
   // Tributaries enter obliquely. Their upstream bias reverses when the
   // downstream coordinate of the trunk becomes the upstream branch axis.
   const span=parent.length*.75;
   const ratio=Math.min(.36,run*(side===1?.94:.46)/span);
   return [1-ratio,parent.depth===0?0:span*ratio];
  }
  function child(parent,side,slot) {
   const id=parent.id+'/'+side+'/'+slot;
   if(cache.has(id)) {
    const branch=cache.get(id);
    cache.delete(id);
    cache.set(id,branch);
    return branch;
   }
   const cells=parent.layout[side===1?1:0];
   const start=cells[slot], spacing=cells[slot+1]-start;
   const station=start+spacing*(.5+(hash(seed,id)-.5)*.14);
   const width=Math.min(spacing*(.21+.12*hash(seed,id+'/width')),parent.width*.29);
   const reach=parent.width*(.36+.26*hash(seed,id+'/head'));
   const junction=parent.floor(station);
   const glacial=smooth((junction-geology.glacialThresholdM)/geology.glacialTransitionM) *
    (parent.depth===0 ? 1 : parent.depth===1 ? .55 : 0);
   const rise=parent.relief*(.25+.15*hash(seed,id+'/relief'))*(.8+.2*geology.resistance);
   const branch=Object.freeze({
    id, depth:parent.depth+1, station, width, length:reach, relief:rise, glacial, layout:layout(id,reach),
    bend:spacing*(hash(seed,id+'/bend')-.5)*.18,
    floor:u=>junction+rise*clamp(u/reach)
   });
   if(cache.size>=CACHE_LIMIT) cache.delete(cache.keys().next().value);
   cache.set(id,branch);
   return branch;
  }
  const curve=(branch,u)=>branch.station+branch.bend*Math.sin(Math.PI*clamp(u/branch.length));
  const profile=(distance,glacial)=>mix(distance, distance*distance*(.55+.45*distance),glacial);
  const weight=(width,footprint)=>1-smooth((footprint/width-.18)/.64);

  function refine(parent,u,v,z,footprint,influence) {
   // One branch per side and station cell. Supports fit inside the cell even
   // at maximum bend and station displacement, leaving a shared interfluve.
   for(let depth=0;depth<STAGES;depth++){
    const side=v<0?-1:1, run=Math.abs(v);
    if(run===0 || run>=parent.width || u<0 || u>=parent.length*.75)break;
    const [stretch,shift]=drift(parent,side,run);
    const station=(u-shift)/stretch;
    if(station<0 || station>=parent.length*.75)break;
    const cells=parent.layout[side===1?1:0];
    let slot=0;
    while(slot<4 && station>cells[slot+1])slot++;
    const next=child(parent,side,slot);
    const across=station-curve(next,run), distance=Math.abs(across)/next.width;
    if(distance>=1 || run>=next.length)break;
    const visible=weight(next.width,footprint);
    if(visible===0)break;
    // The confluence meets the parent's floor exactly. The floor rises
    // upstream and the excavated profile grades back into the hillside.
    const grade=next.floor(run);
    const section=profile(distance,next.glacial);
    const banks=grade+next.relief*.65*section;
    const target=Math.max(banks,mix(grade,z,section));
    influence*=visible*(1-smooth((run/next.length-.76)/.24));
    const confluence=distance===0?1:smooth(run/(.10*next.length*distance));
    z=mix(z,target,influence*confluence*(1-smooth((distance-.68)/.32)));
    // Station cells end below the head taper, and child reaches stop before
    // their parent's bank taper. Their grades share the parent's full weight.
    parent=next; u=run; v=across;
   }
   return z;
  }

  function inRegion(lat,lon) {
   const [u,y]=project(lat,lon);
   return active && u>-24 && u<length+24 && Math.abs(y-center(u))<35;
  }
  function legacy(lat,lon,footprint) {
   return footprint===0?backbone.elevation(lat,lon):backbone.displayElevation(lat,lon,footprint);
  }
  function evaluate(lat,lon,footprint) {
   const visibility=weight(32,footprint);
   if(!active || visibility===0 || Math.abs(lat-head[0])>2 || Math.abs(Geo.wrap(lon-head[1]))>2)return legacy(lat,lon,footprint);
   const [u,y]=project(lat,lon);
   const v=y-center(u), distance=Math.abs(v);
   if(u<=-24 || u>=length+24 || distance>=35)return legacy(lat,lon,footprint);
   const coverage=smooth((u+24)/24)*smooth((length+24-u)/24)*(1-smooth((distance-20)/15));
   const shoulder=envelope(lat,lon);
   // The inherited envelope preserves the same sea-datum sign at every footprint.
   if(shoulder<=0)return shoulder;
   const grade=floor(u);
   const glacial=smooth((grade-geology.glacialThresholdM)/geology.glacialTransitionM);
   const cross=clamp(distance/trunk.width);
   // Replace the old profiles in the basin interior. The floor, cross-valley
   // relief and the parent upland jointly determine its section.
   const trunkSurface=grade+mix(trunk.relief,Math.max(trunk.relief*.55,shoulder-grade),smooth(cross))*
    profile(cross,glacial);
   const surface=mix(trunkSurface,shoulder,smooth((distance-14)/21));
   const detail=refine(trunk,u,v,surface,footprint,1);
   const blend=coverage*visibility;
   return Math.max(.01,blend===1?detail:mix(legacy(lat,lon,footprint),detail,blend));
  }
  const elevation=(lat,lon)=>evaluate(...Geo.coordinate(lat,lon),0);
  const displayElevation=(lat,lon,footprint)=>evaluate(...Geo.coordinate(lat,lon),Math.max(0,footprint));
  function sample(lat,lon,level) {
   const point=Geo.coordinate(lat,lon);
   return {identity,point,address:Geo.locate(...point,level),elevationM:evaluate(...point,0),
    provenance:VERSION,features:featuresAt(...point)};
  }
  function featuresAt(lat,lon) {
   if(!inRegion(lat,lon))return backbone.featuresAt(lat,lon);
   return [catalog.get('east-crown'),catalog.get(ROOT_ID)];
  }
  function nodes(address,segments=16) {
   if(!Number.isInteger(segments)||segments<1||segments>64)throw RangeError('Invalid node grid');
   const {north,south,west,east}=Geo.bounds(address), values=[];
   for(let y=0;y<=segments;y++)for(let x=0;x<=segments;x++){
    values.push(elevation(y===segments?south:north+(south-north)*y/segments,
     x===segments?east:west+(east-west)*x/segments));
   }
   return {segments,values,provenance:VERSION};
  }
  function summarize(address,depth=2) {
   if(!Number.isInteger(depth)||depth<0||depth>6)throw RangeError('Invalid summary depth');
   const {north,south,west,east}=Geo.bounds(address), n=2**depth;
   let min=Infinity,max=-Infinity,weight=0,integral=0;
   for(let y=0;y<n;y++){
    const a=mix(north,south,y/n), b=mix(north,south,(y+1)/n);
    const area=Geo.RADIUS**2*(east-west)*Geo.DEG/n*(Math.sin(a*Geo.DEG)-Math.sin(b*Geo.DEG));
    for(let x=0;x<n;x++){
     const z=elevation((a+b)/2,mix(west,east,(x+.5)/n));
     min=Math.min(min,z); max=Math.max(max,z); weight+=area; integral+=z*area;
    }
   }
   return {address,identity,featureId:'surface',metric:'elevation',unit:'m',weightUnit:'m²',weight,integral,min,max,mean:integral/weight};
  }
  function channel(path) {
   if(!path.length||path.length>STAGES)throw RangeError('Invalid channel depth');
   const chain=[trunk];
   for(const [side,slot] of path){
    if(Math.abs(side)!==1||!Number.isInteger(slot)||slot<0||slot>=5)throw RangeError('Invalid branch address');
    chain.push(child(chain.at(-1),side,slot));
   }
   const branch=chain.at(-1);
   return {id:branch.id,parentId:chain.at(-2).id,lengthKm:branch.length,widthKm:branch.width,
    glacial:branch.glacial,point:(t,acrossKm=0)=>{
    let u=t*branch.length,v=acrossKm;
    for(let i=path.length;i>0;i--){
     const side=path[i-1][0], [stretch,shift]=drift(chain[i-1],side,u);
     [u,v]=[(curve(chain[i],u)+v)*stretch+shift,side*u];
    }
    return unproject(u,center(u)+v);
   },grade:t=>branch.floor(t*branch.length)};
  }
  const focus=Object.freeze(channel([[1,2],[1,2],[-1,2],[1,2],[1,2]]).point(.55));
  const catalog=Geo.featureCatalog(identity,backbone.catalog.records);
  return Object.freeze({...backbone,identity,catalog,sample,nodes,summarize,featuresAt,elevation,displayElevation,
   pilot:Object.freeze({focus,inRegion,geology,channel,trunkPoint:t=>{
    const u=t*length;
    return unproject(u,center(u));
   },cacheSize:()=>cache.size})
  });
 }
 const api=Object.freeze({VERSION,createWorld});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.AtlasTerrain=api;
})(globalThis);
