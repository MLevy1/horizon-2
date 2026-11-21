'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Backbone = require('./backbone.js');
const Geo = require('../horizon-atlas-1.01/geography.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file),'utf8');
function fixture() {
 const html = read('horizon-atlas-1.02.html');
 const script = html.match(/<script id="horizonWorld">([\s\S]*?)<\/script>/)[1].split('const atlasWorldReady=')[0];
 // Inert DOM hooks shared with the frozen worker. Evaluate the same reference
 // world used by the runnable page.
 const dom = `
 const nodes=new Map();
 const make=()=>({checked:true,value:'',dataset:{},style:{},options:[],addEventListener(){},append(){},getContext(){return {};}});
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);},createElement:make};
 function Option() {}
 `;
 const {settings,source} = new Function(dom+script+`
  initializeWorldFields();
  return {settings:{seed:SEED,generator:GENERATOR_VERSION,ageMyr:WORLD_AGE,waterShare,mountainStrength,mountainThreshold,oceanStrength,oceanThreshold},
   source:{width:HW,height:HH,elevationKm:hydro.elev,seaKm:sea}};
 `)();
 return {settings,source,world:Backbone.createWorld(settings,source),base:Geo.createWorld(settings,source)};
}
function offset([lat,lon],x,y) {
 const angular = Math.hypot(x,y)/(Geo.RADIUS/1000), p = lat*Geo.DEG;
 if(!angular)return [lat,lon];
 const bearing=Math.atan2(x,y);
 const s=Math.sin(p), c=Math.cos(p), a=Math.sin(angular), b=Math.cos(angular);
 const target=Math.asin(s*b+c*a*Math.cos(bearing));
 return [target/Geo.DEG, Geo.wrap(lon+Math.atan2(Math.sin(bearing)*a*c,b-s*Math.sin(target))/Geo.DEG)];
}
function windowMetrics(world,point,width,n=32) {
 const elevations=[],slopes=[],step=width/n;
 for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){
  const z=world.elevation(...offset(point,(x-n/2)*step,(y-n/2)*step));
  elevations.push(z);
  if(x)slopes.push(Math.abs(z-elevations.at(-2))/(10*step));
  if(y)slopes.push(Math.abs(z-elevations[elevations.length-n-2])/(10*step));
 }
 return {relief:Math.max(...elevations)-Math.min(...elevations),slope95:percentile(slopes,.95)};
}
function percentile(values,p) {
 return values.slice().sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
}
function drainageMetrics(world,surface){
 let routes=0, pairs=0, downhill=0, netDescent=0;
 for(const feature of world.catalog.records.filter(x=>['drainage corridor','basin outlet constraint'].includes(x.kind))){
  const [a,b,c]=feature.geometry.parts[0], values=[];
  for(let i=2;i<=14;i++){
   const [start,end,t]=i<8?[a,b,i/8]:[b,c,(i-8)/8];
   values.push(surface.elevation(start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t));
  }
  routes++;
  if(values[0]>values.at(-1))netDescent++;
  for(let i=1;i<values.length;i++){
   if(values[i-1]<=0||values[i]<=0)continue;
   pairs++;
   if(values[i]<values[i-1])downhill++;
  }
 }
 return {routes,pairs,downhill,netDescent};
}
module.exports={fixture,offset,windowMetrics,percentile,drainageMetrics};
