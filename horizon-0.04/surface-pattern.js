'use strict';

const PATTERN_SIZE=128;
const STAND_PERIOD=400;

// A periodic, ranked noise tile makes a coverage cutoff an area fraction.
// The same tile and bilinear sampling convention are used for GPU ground
// coverage and CPU selection of candidate tree positions.
function buildSurfacePattern() {
 const size=PATTERN_SIZE;
 let seed=98431;
 const random=()=>{
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;
 };
 const octaves=[8,16,32].map(n=>({n,grid:Float32Array.from({length:n*n},random)}));
 const noise=({n,grid},x,y)=>{
  const gx=x*n/size,gy=y*n/size,i=Math.floor(gx),j=Math.floor(gy);
  const smooth=t=>t*t*(3-2*t);
  const u=smooth(gx-i),v=smooth(gy-j);
  const at=(a,b)=>grid[(b%n)*n+a%n];
  return (1-v)*((1-u)*at(i,j)+u*at(i+1,j))+v*((1-u)*at(i,j+1)+u*at(i+1,j+1));
 };
 const rank=Array.from({length:size*size},(_,i)=>{
  const x=i%size,y=Math.floor(i/size);
  return {i,value:noise(octaves[0],x,y)*.60+noise(octaves[1],x,y)*.28+noise(octaves[2],x,y)*.12};
 });
 rank.sort((a,b)=>a.value-b.value);
 const tile=new Uint8Array(size*size);
 rank.forEach(({i},k)=>{tile[i]=Math.floor(k*256/rank.length);});
 return tile;
}

const SURFACE_PATTERN=buildSurfacePattern();

function standRank(x,z) {
 const size=PATTERN_SIZE;
 const u=x/STAND_PERIOD*size-.5,v=z/STAND_PERIOD*size-.5;
 const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
 const at=(x,y)=>SURFACE_PATTERN[(y&(size-1))*size+(x&(size-1))]/255;
 return (1-b)*((1-a)*at(i,j)+a*at(i+1,j))+b*((1-a)*at(i,j+1)+a*at(i+1,j+1));
}
