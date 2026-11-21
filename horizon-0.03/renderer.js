'use strict';

const clamp3=(v,min,max)=>Math.min(max,Math.max(min,v));
const curves=(x,z)=>-(x*x+z*z)/(2*6371000);
const lightColor=new THREE.Color();
const srgb=(r,g,b)=>lightColor.setRGB(r,g,b,THREE.SRGBColorSpace);
const creature=new THREE.Object3D();

class ExplorerView {
 constructor(canvas) {
  this.scene=new THREE.Scene();
  this.scene.background=new THREE.Color('#b0ccd8');
  this.scene.fog=new THREE.Fog('#b8d3dc',30000,150000);
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.ShaderMaterial({
   side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false,
   uniforms:{horizon:{value:new THREE.Color('#c7dce1')},zenith:{value:new THREE.Color('#538eb5')}},
   vertexShader:'varying vec3 skyDirection; void main(){skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   fragmentShader:`uniform vec3 horizon;
    uniform vec3 zenith;
    varying vec3 skyDirection;
    void main(){
     vec3 ray=normalize(skyDirection);
     vec3 direction=normalize(vec3(-.48,.62,.29));
     float up=sqrt(max(0.0,ray.y));
     vec3 color=mix(horizon,zenith,up);
     float glow=pow(max(0.0,dot(direction,ray)),22.0);
     gl_FragColor=vec4(color+vec3(.12,.09,.05)*glow,1.0);
     #include <colorspace_fragment>
    }`
  }));
  this.sky.scale.setScalar(85000);
  this.sky.renderOrder=-10;
  this.sky.frustumCulled=false;
  this.scene.add(this.sky);
  this.camera=new THREE.PerspectiveCamera(64,1,.3,140000);
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,logarithmicDepthBuffer:true,powerPreference:'high-performance'});
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.scene.add(new THREE.HemisphereLight(0xe9f4ff,0x8c8267,1.65));
  const sun=new THREE.DirectionalLight(0xffecd0,2.25);
  sun.position.set(-500,700,330);
  this.scene.add(sun);
  this.layers={slope:false,chunks:false,lod:false,material:false,canopy:true,coverage:false,trees:true};
  this.ground=createGroundMaterial(this.layers);
  this.chunkLine=new THREE.LineBasicMaterial({color:0xe2f6ff,depthTest:false});
  this.lodLine=new THREE.LineBasicMaterial({color:0xffbd63,depthTest:false});
  this.water=new THREE.MeshLambertMaterial({vertexColors:true, side:THREE.DoubleSide, polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  this.water.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 horizonWater;\n'+shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nhorizonWater=(modelMatrix*vec4(position,1.0)).xyz;');
   shader.fragmentShader='varying vec3 horizonWater;\n'+shader.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\nvec2 p=horizonWater.xz; float a=sin(p.x*1.6+p.y*.46)*sin(p.y*.85-p.x*.2); float fresnel=pow(1.0-abs(normalize(cameraPosition-horizonWater).y),4.0); diffuseColor.rgb=mix(diffuseColor.rgb*(1.0+.065*a*(1.0-smoothstep(60.0,260.0,distance(cameraPosition,horizonWater)))),vec3(.24,.43,.52),fresnel*.32);');
  };
  this.trunk=new THREE.CylinderGeometry(.48,.9,1,5);
  this.crowns=[
   new THREE.IcosahedronGeometry(1,0),
   new THREE.IcosahedronGeometry(1,0),
   new THREE.ConeGeometry(1,2,6),
   new THREE.ConeGeometry(1,2,5)
  ];
  this.leafMaterial=new THREE.MeshLambertMaterial();
  this.barkMaterial=new THREE.MeshLambertMaterial({color:0x543c2c});
  this.resize();
  new ResizeObserver(()=>this.resize()).observe(canvas);
 }
 resize() {
  const canvas=this.renderer.domElement,w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5,Math.sqrt(950000/(w*h))));
  this.renderer.setSize(w,h,false);
  this.camera.aspect=w/h;
  this.camera.updateProjectionMatrix();
 }
 buildChunk(data) {
  initializeSurface(data);
  const group=new THREE.Group();
  this.scene.add(group);
  return group;
 }
 stitch(entries) {
  entries.sort((a,b)=>b.data.chunk.size-a.data.chunk.size);
  for(const {data,group} of entries){
   const joined=joinNeighbors(data,entries);
   const signature=joined.map(other=>Grid.key(other.chunk)+'@'+other.stitchRevision).join('|');
   if(data.stitchSignature!==signature){
    data.stitchSignature=signature;
    data.stitchRevision=(data.stitchRevision??0)+1;
    conformSurface(data,joined);
   }
   const finer=entries.map(({data})=>data).filter(other=>other.chunk.size<data.chunk.size&&sharedEdge(data.chunk,other.chunk));
   const meshSignature=[data.stitchRevision,...finer.map(other=>Grid.key(other.chunk))].join('|');
   if(data.meshSignature===meshSignature)continue;
   data.meshSignature=meshSignature;
   const topology=transitionTopology(data,finer);
   this.clearChunk(group);
   group.add(terrainMesh(data,this.ground,topology));
   const water=waterMesh(data,this.water,topology);
   if(water)group.add(water);
   this.addTrees(group,data);
   this.addLines(group,data,joined);
  }
  this.smoothChunkNormals(entries);
 }
 smoothChunkNormals(entries) {
  // Use identical normals along equal-resolution borders. Fine edge normals
  // follow the coarser mesh, using its triangle weights between coarse nodes.
  const active=entries.map(({data,group})=>({data,geometry:group.children[0].geometry}));
  for(const {data,geometry} of active){
   const normal=geometry.getAttribute('normal'),base=geometry.userData.baseNormals;
   const {chunk:c,n}=data;
   const adjacent=active.filter(({data:{chunk:b}})=>
    c.x<=b.x+b.size&&c.x+c.size>=b.x&&c.z<=b.z+b.size&&c.z+c.size>=b.z);
   const edge=geometry.userData.edge;
   for(const i of edge){
    const [x,z]=meshPoint(data,i);
    let level=0,nx=0,ny=0,nz=0;
    for(const entry of adjacent){
     const b=entry.data.chunk;
     if(b.size<level||!contains(b,x,z))continue;
     if(b.size>level){level=b.size;nx=ny=nz=0;}
     const {at,weights}=meshTriangle(entry.data,x,z);
     const source=entry.geometry.userData.baseNormals;
     for(let k=0;k<3;k++){
      const node=at[k]*3,w=weights[k];
      nx+=source[node]*w;ny+=source[node+1]*w;nz+=source[node+2]*w;
     }
    }
    const length=Math.hypot(nx,ny,nz);
    if(length>0)normal.setXYZ(i,nx/length,ny/length,nz/length);
    else normal.setXYZ(i,base[i*3],base[i*3+1],base[i*3+2]);
   }
   geometry.userData.added.forEach(({ids,weights},k)=>{
    const value=component=>ids.reduce((sum,i,j)=>sum+normal.array[i*3+component]*weights[j],0);
    normal.setXYZ(n*n+k,value(0),value(1),value(2));
   });
   normal.needsUpdate=true;
  }
 }
 addLines(group,data,neighbors) {
  const {n,chunk:c}=data;
  const line=Array.from({length:n},(_,i)=>i);
  const edges=[line,line.map(i=>i*n+n-1),line.map(i=>n*n-1-i),line.map(i=>(n-1-i)*n)];
  const points={chunks:[],lod:[]};
  for(const edge of edges)for(let i=1;i<n;i++){
   const ids=[edge[i-1],edge[i]];
   const [x,z]=meshPoint(data,ids[0]),[u,v]=meshPoint(data,ids[1]);
   const coarser=neighbors.some(({chunk:b})=>contains(b,(x+u)/2,(z+v)/2));
   for(const layer of coarser?['chunks','lod']:['chunks'])for(const id of ids){
    const [px,pz]=meshPoint(data,id);
    points[layer].push(px,drawValue(data,'height',id)+.16,pz);
   }
  }
  for(const [layer,vertices] of Object.entries(points)){
   if(!vertices.length)continue;
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
   const line=new THREE.LineSegments(geometry,layer==='lod'?this.lodLine:this.chunkLine);
   line.userData.layer=layer;
   line.renderOrder=layer==='lod'?12:11;
   group.add(line);
  }
  this.applyVisibility(group);
 }
 applyVisibility(group) {
  for(const child of group.children){
   if(child.userData.layer)child.visible=this.layers[child.userData.layer];
  }
 }
 setLayer(name,value) {
  this.layers[name]=value;
  if(this.ground.userData.layers[name])this.ground.userData.layers[name].value=Number(value);
  if(name==='trees'||name==='chunks'||name==='lod'){
   for(const group of this.scene.children)if(group.isGroup)this.applyVisibility(group);
  }
 }
 addTrees(parent,data) {
  const {records}=data.trees;
  if(!records.length)return;
  const groups=[[],[],[],[]], living=[];
  const measured=data.chunk.size<=1024;
  for(let i=0;i<records.length;i+=8){
   const [x,z,height,width,angle,guild,tint,proxy]=records.subarray(i,i+8);
   const {at,weights}=meshTriangle(data,x,z);
   const sample=name=>at.reduce((sum,node,k)=>sum+weights[k]*drawValue(data,name,node),0);
   if(sample('shore')>=0)continue;
   const index=guild===3?2:guild===4?3:(guild===1||guild>=5?1:0);
   const tree={x,z,y:sample('height'),height,width,angle,guild,tint,proxy};
   groups[index].push(tree);
   living.push(tree);
  }
  data.drawnTrees=living.length;
  if(measured&&living.length){
   const trunks=new THREE.InstancedMesh(this.trunk,this.barkMaterial,living.length);
   for(let i=0;i<living.length;i++){
    const {x,y,z,height,width,angle,tint}=living[i];
    const radius=Math.max(.04,width*(.04+.027*tint));
    creature.position.set(x,y+height*.35,z);
    creature.rotation.set(0,angle,0);
    creature.scale.set(radius,height*.72,radius);
    creature.updateMatrix();
    trunks.setMatrixAt(i,creature.matrix);
   }
   trunks.computeBoundingSphere();
   trunks.userData.layer='trees';
   parent.add(trunks);
  }
  for(let a=0;a<groups.length;a++){
   const slots=groups[a];
   if(!slots.length)continue;
   const tapered=a>=2,components=measured?2:1;
   const crowns=new THREE.InstancedMesh(this.crowns[a],this.leafMaterial,slots.length*components);
   for(let j=0;j<slots.length;j++){
    const {x,y,z,height,width,angle,guild,tint,proxy}=slots[j];
    for(let k=0;k<components;k++){
     const drift=tapered?.06:.19;
     const theta=angle+k*2.39;
     creature.position.set(x+Math.cos(theta)*width*drift*k,y+height*(tapered?.57+k*.22:.77+k*.07),z+Math.sin(theta)*width*drift*k);
     creature.rotation.set((tint-.5)*.18,theta,(tint-.5)*.13);
     const r=width*proxy*(tapered?.51-k*.17:.46-k*.07);
     creature.scale.set(r,height*(tapered?.31-k*.105:.21+(tint-.5)*.14),r*(.78+.26*tint));
     creature.updateMatrix();
     crowns.setMatrixAt(j*components+k,creature.matrix);
     crowns.setColorAt(j*components+k,srgb(.21+.15*tint+.04*(guild===1),.32+.19*tint,.16+.10*tint+.075*tapered));
    }
   }
   crowns.computeBoundingSphere();
   crowns.userData.layer='trees';
   parent.add(crowns);
  }
 }
 disposeChunk(group) {
  this.scene.remove(group);
  this.clearChunk(group);
 }
 clearChunk(group) {
  for(const mesh of [...group.children]) {
   group.remove(mesh);
   if(mesh.isInstancedMesh)mesh.dispose();
   else mesh.geometry.dispose();
  }
 }
 render() {this.sky.position.copy(this.camera.position);this.renderer.render(this.scene,this.camera); }
}

function makeGeometry(positions,colors,index) {
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 if(index)geometry.setIndex(index);
 geometry.computeVertexNormals();
 return geometry;
}

function initializeSurface(data) {
 const count=data.n**2;
 data.height=new Float32Array(count);
 data.shore=new Float32Array(count);
 data.waterDepth=new Float32Array(count);
 for(let i=0;i<count;i++){
  const curvature=curves(...meshPoint(data,i));
  data.height[i]=data.z[i]+curvature;
  data.waterDepth[i]=data.water[i]?Math.max(0,data.stage[i]-data.z[i]):0;
  // Signed support is shared by the water clipper, tree placement and collision.
  data.shore[i]=data.water[i]?1:-1;
 }
}

function contains(c,x,z) {
 return x>=c.x&&x<=c.x+c.size&&z>=c.z&&z<=c.z+c.size;
}

function joinNeighbors(data,entries) {
 const a=data.chunk;
 return entries.map(entry=>entry.data).filter(({chunk:b})=>
  b.size>a.size&&a.x<=b.x+b.size&&a.x+a.size>=b.x&&a.z<=b.z+b.size&&a.z+a.size>=b.z);
}

function sharedEdge(a,b) {
 const overlap=(x,y)=>x<y+b.size&&y<x+a.size;
 if((a.x===b.x+b.size||a.x+a.size===b.x)&&overlap(a.z,b.z))return 'vertical';
 if((a.z===b.z+b.size||a.z+a.size===b.z)&&overlap(a.x,b.x))return 'horizontal';
 return null;
}

function transitionTopology(data,finer) {
 const {n,chunk:c}=data,step=c.size/(n-1);
 const indices=[],added=[],cuts=new Map();
 const insert=(ids,weights)=>n*n+added.push({ids,weights})-1;
 // Give the coarse edge the same vertices as its finer neighbor. The new
 // faces remain coplanar with the original and preserve collision sampling.
 for(const {n:nn,chunk:b} of finer){
  const vertical=sharedEdge(c,b)==='vertical';
  const start=vertical?c.z:c.x,offset=vertical?b.z:b.x;
  const base=vertical?(c.x===b.x+b.size?0:n-1):(c.z===b.z+b.size?0:(n-1)*n);
  const stride=vertical?n:1;
  for(let j=0;j<nn;j++){
   const t=(offset+j*b.size/(nn-1)-start)/step;
   if(t<=0||t>=n-1||Number.isInteger(t))continue;
   const a=base+Math.floor(t)*stride,end=a+stride,key=a*n*n+end;
   if(!cuts.has(key))cuts.set(key,{a,end,fractions:new Set()});
   cuts.get(key).fractions.add(t%1);
  }
 }
 const between=new Map();
 for(const [key,{a,end,fractions}] of cuts){
  between.set(key,[...fractions].sort((x,y)=>x-y).map(f=>insert([a,end],[1-f,f])));
 }
 const edge=(i,j)=>{
  const cut=between.get(Math.min(i,j)*n*n+Math.max(i,j));
  return cut?(i<j?cut:[...cut].reverse()):[];
 };
 function triangle(a,b,c){
  const ab=edge(a,b),bc=edge(b,c),ca=edge(c,a);
  if(!ab.length&&!bc.length&&!ca.length){indices.push(a,b,c);return;}
  const poly=[a,...ab,b,...bc,c,...ca],center=insert([a,b,c],[1/3,1/3,1/3]);
  for(let k=0;k<poly.length;k++)indices.push(center,poly[k],poly[(k+1)%poly.length]);
 }
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){
  const i=y*n+x;
  if(between.size){
   triangle(i,i+n,i+1);
   triangle(i+1,i+n,i+n+1);
  }else indices.push(i,i+n,i+1,i+1,i+n,i+n+1);
 }
 return {indices,added};
}

function conformSurface(data,neighbors) {
 data.draw=null;
 if(!neighbors.length)return;
 const {chunk:c,n}=data,step=c.size/(n-1);
 const draw=Object.fromEntries(Object.keys(meshFields).map(name=>[name,data[name].slice()]));
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const x=c.x+i*step,z=c.z+j*step,idx=j*n+i;
  const edgePoints=[
   [x,c.z,j,i],[c.x+c.size,z,n-1-i,j*n+n-1],
   [x,c.z+c.size,n-1-j,(n-1)*n+i],[c.x,z,i,j*n]
  ];
  const targets=[];
  for(const [u,v,distance,edgeNode] of edgePoints){
   const other=neighbors.find(({chunk:b})=>contains(b,u,v));
   if(!other)continue;
   const width=Math.min(c.size/4,Math.max(3*step,1.5*other.chunk.size/(other.n-1)));
   const t=Math.min(1,distance*step/width);
   if(t===1)continue;
   targets.push({other,...meshTriangle(other,u,v),blend:(1-t)**2*(1+2*t),edge:distance===0,edgeNode});
  }
  if(!targets.length)continue;
  const boundary=targets.find(target=>target.edge);
  if(boundary)targets.splice(0,targets.length,boundary);
  const scale=Math.max(1,targets.reduce((sum,target)=>sum+target.blend,0));
  for(const [name,stride] of Object.entries(meshFields))for(let k=0;k<stride;k++){
   const base=data[name][idx*stride+k];
   // Transport ground displacement into the interior so slopes do not flatten
   // toward the joining edge. Substrate and wetness blend as bounded fields.
   const delta=targets.reduce((sum,{other,at,weights,blend,edgeNode})=>{
    const anchor=name==='height'?data.height[edgeNode]:base;
    return sum+blend*(at.reduce((value,node,m)=>value+weights[m]*drawValue(other,name,node,k),0)-anchor);
   },0);
   draw[name][idx*stride+k]=base+delta/scale;
  }
 }
 data.draw=draw;
}

function createGroundMaterial(layers) {
 const material=new THREE.MeshLambertMaterial({vertexColors:true});
 const controls=Object.fromEntries(['slope','material','canopy','coverage'].map(name=>[name,{value:Number(layers[name])}]));
 const pixels=new Uint8Array(SURFACE_PATTERN.length*4);
 for(let i=0;i<SURFACE_PATTERN.length;i++)pixels[i*4]=SURFACE_PATTERN[i];
 const pattern=new THREE.DataTexture(pixels,PATTERN_SIZE,PATTERN_SIZE);
 pattern.wrapS=pattern.wrapT=THREE.RepeatWrapping;
 pattern.minFilter=pattern.magFilter=THREE.LinearFilter;
 pattern.needsUpdate=true;
 material.userData={layers:controls};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,controls,{showMaterial:controls.material,surfacePattern:{value:pattern}});
  const varying='varying vec3 horizonGround; varying vec4 coverA,coverB; varying vec2 habitat;\n';
  shader.vertexShader=varying+'attribute vec4 groundA,groundB; attribute vec2 ecology;\n'+shader.vertexShader
   .replace('#include <begin_vertex>','#include <begin_vertex>\nhorizonGround=position; coverA=groundA; coverB=groundB; habitat=ecology;');
  shader.fragmentShader=varying+`
uniform float slope,showMaterial,canopy,coverage;
uniform sampler2D surfacePattern;
float rankField(vec2 uv) {return texture2D(surfacePattern,uv).r;}
float classEdge(float rank,float sum,float width){return smoothstep(sum-width,sum+width,rank);}
`+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 p=horizonGround.xz;
float rank=rankField(p/24.0+vec2(.41,.28));
float blend=min(.14,max(.018,fwidth(rank)*.4));
vec3 rock=vec3(.133,.133,.117),gravel=vec3(.199,.161,.112),sand=vec3(.365,.271,.143);
vec3 soil=vec3(.161,.109,.058),litter=vec3(.123,.077,.039),moss=vec3(.145,.223,.077);
rock=mix(rock,vec3(.31,.27,.30),showMaterial);
gravel=mix(gravel,vec3(.34,.43,.50),showMaterial);
sand=mix(sand,vec3(.70,.54,.23),showMaterial);
soil=mix(soil,vec3(.42,.22,.10),showMaterial);
litter=mix(litter,vec3(.25,.085,.038),showMaterial);
moss=mix(moss,vec3(.50,.56,.15),showMaterial);
float total=dot(coverA,vec4(1.0))+coverB.x+coverB.y;
float location=mix(blend,total-blend,rank);
vec4 cut=vec4(coverA.x,coverA.x+coverA.y,coverA.x+coverA.y+coverA.z,dot(coverA,vec4(1.0)));
vec4 edge=smoothstep(cut-vec4(blend),cut+vec4(blend),vec4(location));
float last=classEdge(location,cut.w+coverB.x,blend);
vec3 base=rock*(1.0-edge.x)+gravel*(edge.x-edge.y)+sand*(edge.y-edge.z)+
 soil*(edge.z-edge.w)+litter*(edge.w-last)+moss*last;
vec3 mean=(rock*coverA.x+gravel*coverA.y+sand*coverA.z+soil*coverA.w+litter*coverB.x+moss*coverB.y)/max(total,.001);
float pixel=max(length(dFdx(p)),length(dFdy(p)));
base=mix(base,mean,smoothstep(.22,1.5,pixel));
float grain=rankField(p/3.7+vec2(.29,.63)),variation=rankField(p/178.0+vec2(.12,.76));
float grainVisibility=1.0-smoothstep(.05,.48,pixel);
base*=.82+.30*variation+.24*(grain-.5)*grainVisibility;
float lowRank=rankField(p/83.0+vec2(.35,.71));
float low=mix(1.0-smoothstep(coverB.z-.07,coverB.z+.07,lowRank),coverB.z,smoothstep(1.0,8.0,pixel));
low*=smoothstep(0.0,.07,coverB.z)*(1.0-step(0.0,habitat.y));
base=mix(base,vec3(.083,.159,.041),low*.72);
base=mix(base,vColor,coverB.w);
float standRank=rankField(p/${STAND_PERIOD.toFixed(1)});
float stand=mix(1.0-smoothstep(habitat.x-.035,habitat.x+.035,standRank),habitat.x,smoothstep(4.0,27.0,pixel));
stand*=smoothstep(0.0,.035,habitat.x)*(1.0-step(0.0,habitat.y));
float distanceToGround=distance(cameraPosition,horizonGround);
base=mix(base,vec3(.061,.138,.045)*(0.89+.25*variation),stand*canopy*smoothstep(94.0,285.0,distanceToGround)*.92);
base=mix(base,mix(vec3(.095,.105,.112),vec3(.067,.53,.12),stand),coverage);
if(slope>.5){
 vec3 top=normalize(cross(dFdx(horizonGround),dFdy(horizonGround)));
 float steep=1.0-abs(top.y);
 base=mix(base,mix(vec3(.07,.26,.38),vec3(.82,.14,.036),smoothstep(0.0,.27,steep)),.78);
}
diffuseColor.rgb=base;
`);
 };
 return material;
}

function terrainMesh(data,material,{indices,added}) {
 const {n}=data,vertices=[],colors=[],groundA=[],groundB=[],ecology=[];
 for(let i=0;i<n*n;i++){
  const [x,z]=meshPoint(data,i);
  vertices.push(x,drawValue(data,'height',i),z);
  const color=srgb(drawValue(data,'color',i,0),drawValue(data,'color',i,1),drawValue(data,'color',i,2));
  colors.push(color.r,color.g,color.b);
  for(let k=0;k<4;k++){
   groundA.push(drawValue(data,'cover',i,k));
   groundB.push(drawValue(data,'cover',i,k+4));
  }
  ecology.push(drawValue(data,'canopy',i),drawValue(data,'shore',i));
 }
 for(const {ids,weights} of added){
  for(const [target,stride] of [[vertices,3],[colors,3],[groundA,4],[groundB,4],[ecology,2]]){
   for(let k=0;k<stride;k++)target.push(ids.reduce((sum,i,j)=>sum+target[i*stride+k]*weights[j],0));
  }
 }
 const geometry=makeGeometry(vertices,colors,indices);
 const edge=[];
 for(let i=0;i<n;i++){
  edge.push(i,(n-1)*n+i);
  if(i>0&&i<n-1)edge.push(i*n,i*n+n-1);
 }
 geometry.userData={edge,added,baseNormals:geometry.getAttribute('normal').array.slice()};
 geometry.setAttribute('groundA',new THREE.Float32BufferAttribute(groundA,4));
 geometry.setAttribute('groundB',new THREE.Float32BufferAttribute(groundB,4));
 geometry.setAttribute('ecology',new THREE.Float32BufferAttribute(ecology,2));
 return new THREE.Mesh(geometry,material);
}

function waterMesh(data,material,{indices,added}) {
 const {n}=data;
 const shore=(data.draw??data).shore;
 if(!shore.some(v=>v>=0))return null;
 const vertices=[],colors=[];
 const source=Array.from({length:n*n},(_,i)=>{
  const [x,z]=meshPoint(data,i);
  const y=drawValue(data,'waterLevel',i);
  return {x,y,z,s:shore[i],depth:Math.max(0,y-drawValue(data,'height',i))};
 });
 for(const {ids,weights} of added){
  const value=name=>ids.reduce((sum,id,j)=>sum+source[id][name]*weights[j],0);
  source.push({x:value('x'),y:value('y'),z:value('z'),s:value('s'),depth:value('depth')});
 }
 function emit({x,y,z,depth}) {
  vertices.push(x,y+.025,z);
  const dark=clamp3(Math.log1p(depth)/6,0,1);
  const color=srgb(.21-.10*dark,.52-.20*dark,.59-.16*dark);
  colors.push(color.r,color.g,color.b);
 }
 function triangle(ids) {
  const corners=ids.map(i=>source[i]),out=[];
  if(!corners.some(p=>p.s>=0))return;
  for(let i=0;i<3;i++){
   const a=corners[i],b=corners[(i+1)%3];
   if(a.s>=0)out.push(a);
   if((a.s>=0)!==(b.s>=0)){
    const t=a.s/(a.s-b.s);
    out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,depth:0});
   }
  }
  for(let i=1;i<out.length-1;i++){emit(out[0]);emit(out[i]);emit(out[i+1]);}
 }
 for(let i=0;i<indices.length;i+=3)triangle([indices[i],indices[i+1],indices[i+2]]);
 return vertices.length?new THREE.Mesh(makeGeometry(vertices,colors),material):null;
}

