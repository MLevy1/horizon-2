'use strict';

class AtlasData {
 constructor() {
  const url=URL.createObjectURL(new Blob([HORIZON_WORLD_SOURCE],{type:'text/javascript'}));
  this.worker=new Worker(url);
  URL.revokeObjectURL(url);
  this.next=0;
  this.pending=new Map();
  this.worker.onmessage=({data})=>{
   const ticket=this.pending.get(data.id);
   if(!ticket)return;
   this.pending.delete(data.id);
   if(data.error)ticket.reject(Error(data.error));
   else ticket.resolve(data.result);
  };
  this.worker.onerror=event=>{
   for(const ticket of this.pending.values())ticket.reject(Error(event.message||'Atlas worker failed'));
   this.pending.clear();
  };
 }
 ask(method,args) {
  const id=++this.next;
  return new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve,reject});
   this.worker.postMessage({id,method,args});
  });
 }
}

const Grid = {
 offset:-512,
 root:32768,
 smallest:1024,
 key(c) {return c.size+'/'+c.x+'/'+c.z;},
 minimum(a,size) {return Math.floor((a-this.offset)/size)*size+this.offset;},
 children(c) {
  const size=c.size/2;
  return [[0,0],[1,0],[0,1],[1,1]].map(([x,z])=>({x:c.x+x*size,z:c.z+z*size,size}));
 },
 distance(c,x,z) {
  return Math.hypot(Math.max(c.x-x,0,x-c.x-c.size),Math.max(c.z-z,0,z-c.z-c.size));
 }
};

class TerrainStream {
 constructor(adapter,view,onError) {
  this.adapter=adapter;
  this.view=view;
  this.onError=onError;
  this.cache=new Map();
  this.active=new Set();
  this.failed=new Set();
  this.busy=false;
  this.revision=0;
 }
 reset(frame) {
  this.frame=frame;
  this.revision++;
  for(const item of this.cache.values())this.view.disposeChunk(item.group);
  this.cache.clear();
  this.active.clear();
  this.failed.clear();
 }
 update(x,z) {
  if(!this.frame)return;
  const request=new Map(), active=new Set(), protect=new Set();
  const enqueue=(chunk, priority)=>{
   const key=Grid.key(chunk);
   protect.add(key);
   if(!this.cache.has(key)&&!this.failed.has(key))request.set(key,{chunk,priority});
  };
  const visit=(chunk,depth)=>{
   const key=Grid.key(chunk), item=this.cache.get(key);
   const distance=Grid.distance(chunk,x,z);
   if(!item){enqueue(chunk,chunk.size===Grid.root?-10000+distance*.01:distance+400);return;}
   protect.add(key);
   if(chunk.size>Grid.smallest&&distance<chunk.size*.44){
    const kids=Grid.children(chunk);
    for(const child of kids)enqueue(child,Grid.distance(child,x,z)-950+depth*15);
    if(kids.every(child=>this.cache.has(Grid.key(child)))){
     for(const child of kids)visit(child,depth+1);
     return;
    }
   }
   active.add(key);
  };
  const {root}=Grid;
  const bx=Grid.minimum(x,root),bz=Grid.minimum(z,root);
  for(let row=-1;row<=1;row++) for(let col=-1;col<=1;col++)visit({x:bx+col*root,z:bz+row*root,size:root},0);
  for(const key of this.active)if(!active.has(key))this.cache.get(key).group.visible=false;
  for(const key of active){
   const entry=this.cache.get(key);
   entry.group.visible=true;
   entry.last=performance.now();
  }
  const layoutChanged=active.size!==this.active.size||[...active].some(key=>!this.active.has(key));
  this.active=active;
  if(layoutChanged)this.view.stitch([...active].map(key=>this.cache.get(key)));
  // Parent meshes remain in cache for instant fallback when crossing a LOD boundary.
  if(this.cache.size>78){
   const expired=[...this.cache].filter(([key])=>!protect.has(key)).sort((a,b)=>a[1].last-b[1].last);
   for(const [key,entry] of expired){
    if(this.cache.size<=78)break;
    this.view.disposeChunk(entry.group);
    this.cache.delete(key);
   }
  }
  const next=[...request.values()].sort((a,b)=>a.priority-b.priority)[0];
  if(next&&!this.busy)this.load(next.chunk);
 }
 async load(chunk) {
  this.busy=true;
  const revision=this.revision,started=performance.now();
  try{
   const data=await this.adapter.ask('meshData',{frame:this.frame,chunk,detail:chunk.size<=8192});
   data.loadMs=performance.now()-started;
   if(revision!==this.revision)return;
   const group=this.view.buildChunk(data);
   group.visible=false;
   this.cache.set(Grid.key(chunk),{data,group,last:performance.now()});
  }catch(error){
   if(revision===this.revision){this.failed.add(Grid.key(chunk));this.onError(error);}
  }finally{this.busy=false;}
 }
 sample(x,z) {
  let best=null;
  for(const key of this.active){
   const {data}=this.cache.get(key),c=data.chunk;
   if(x>=c.x&&z>=c.z&&x<=c.x+c.size&&z<=c.z+c.size&&(!best||c.size<best.chunk.size))best=data;
  }
  return best?sampleMesh(best,x,z):null;
 }
}

function sampleMesh(data,x,z) {
 const {at,weights}=meshTriangle(data,x,z);
 const sample=(name,k=0)=>at.reduce((sum,i,j)=>sum+weights[j]*drawValue(data,name,i,k),0);
 const elevation=sample('height')-curves(x,z);
 const clearance=sample('shore');
 const wet=clearance>0;
 const type=wet?[1,2,3,4].reduce((a,b)=>sample('waterClass',a)>=sample('waterClass',b)?a:b):0;
 return {elevation,surface:sample('height'),wet,waterSurface:wet?sample('waterLevel'):null,waterDepth:wet?clearance:0,
  waterType:type,tidal:sample('waterClass',0),
  slope:meshSlope(data,meshTriangle(data,x,z,false).at),canopy:sample('canopy'),cover:Array.from({length:8},(_,i)=>sample('cover',i)),
  fine:data.fine,detail:data.detail,step:data.chunk.size/(data.n-1)};
}

function roundedBankCell(data,a) {
 const n=data.n;
 const corners=[a,a+n,a+n+1,a+1];
 const mask=corners.reduce((bits,i,k)=>bits|((drawValue(data,'shore',i)>0?1:0)<<k),0);
 // Opposite wet corners are ambiguous. Keep the inherited triangulation
 // there, so rounding a bank cannot introduce a different diagonal link.
 return mask!==0&&mask!==15&&mask!==5&&mask!==10;
}

function meshTriangle(data,x,z,roundBank=true) {
 const {chunk:c,n}=data;
 const gx=Math.max(0,Math.min(n-1,(x-c.x)/c.size*(n-1)));
 const gz=Math.max(0,Math.min(n-1,(z-c.z)/c.size*(n-1)));
 const col=Math.min(n-2,Math.floor(gx)),row=Math.min(n-2,Math.floor(gz));
 const u=gx-col,v=gz-row,k=row*n+col;
 if(roundBank&&roundedBankCell(data,k)){
  const at=[k,k+n,k+n+1,k+1];
  // Four triangles share the bilinear center. Expand its weight back
  // onto the four source vertices, matching the added render vertex.
  const center=2*Math.min(u,v,1-u,1-v);
  const weights=[center/4,center/4,center/4,center/4];
  const edge=[1-u,v,u,1-v];
  const first=edge.indexOf(Math.max(...edge));
  const across=[v,u,1-v,1-u][first];
  weights[first]+=1-across-center/2;
  weights[(first+1)%4]+=across-center/2;
  return {at,weights};
 }
 const at=u+v<=1?[k,k+n,k+1]:[k+1,k+n,k+n+1];
 const weights=u+v<=1?[1-u-v,v,u]:[1-v,1-u,u+v-1];
 return {at,weights};
}

function meshSlope(data,[a,b,c]) {
 const step=data.chunk.size/(data.n-1);
 const y=[a,b,c].map(i=>drawValue(data,'height',i)-curves(...meshPoint(data,i)));
 return b-a===data.n?Math.hypot(y[1]-y[0],y[2]-y[0])/step:
  Math.hypot(y[2]-y[0],y[2]-y[1])/step;
}

const meshFields={height:1,shore:1,waterLevel:1,waterClass:5,cover:8,canopy:2,color:3};
function meshPoint({chunk:c,n},i) {
 const step=c.size/(n-1);
 return [c.x+i%n*step,c.z+Math.floor(i/n)*step];
}
function drawValue(data,name,i,k=0) {
 return (data.draw??data)[name][i*meshFields[name]+k];
}
