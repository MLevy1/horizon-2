'use strict';

const el=id=>document.getElementById(id);
const normalizeLongitude=v=>((v+180)%360+360)%360-180;
class Explorer {
 constructor() {
  this.canvas=el('world');
  this.view=new ExplorerView(this.canvas);
  this.data=new AtlasData();
  this.stream=new TerrainStream(this.data,this.view,error=>this.warning(error.message,8000));
  this.location=el('site');
  this.diagnostics=new SiteDiagnostics(this.data);
  this.renderDiagnostics=new RenderDiagnostics(this);
  this.keys=new Set();
  this.axes={x:0,z:0,up:0};
  this.player={x:0,y:0,z:0,yaw:0,pitch:-.09};
  this.mode='flight';
  this.fps=60;
  this.frameTime=0;
  this.streamTime=0;
  this.startVersion=0;
  this.bindControls();
  this.canvas.addEventListener('webglcontextlost',event=>{
   event.preventDefault();
   this.contextLost=true;
   this.warning('Graphics context paused. Waiting for the browser to restore it.',Infinity);
  });
  this.canvas.addEventListener('webglcontextrestored',()=>{
   this.contextLost=false;
   this.warning('Graphics restored.',1500);
  });
  requestAnimationFrame(time=>this.tick(time));
 }
 async boot() {
  this.baseline=await this.data.ask('initialize');
  this.location.replaceChildren(...Object.entries(this.baseline.catalog).map(([key,{label}])=>new Option(label,key)));
  this.location.disabled=false;
  this.location.value='coastal';
  await this.go('coastal');
 }
 warnText(value) {
  if(el('status').textContent!==value)el('status').textContent=value;
 }
 warning(message,duration=2500) {
  this.message=message;
  this.messageUntil=performance.now()+duration;
 }
 async go(key) {
  if(!key)return;
  const version=++this.startVersion;
  this.loading=true;
  this.diagnostics.select(null);
  this.messageUntil=0;
  this.location.value=key;
  this.warnText('Resolving '+this.location.selectedOptions[0].textContent.toLowerCase()+'…');
  try{
   const site=await this.data.ask('start',key);
   if(version!==this.startVersion)return;
   this.site=site;
   this.renderDiagnostics.clear();
   this.stream.reset(site.frame);
   Object.assign(this.player,{x:0,z:0,y:site.elevation+(key==='alpine'?310:key==='coastal'?130:85),
    yaw:(site.bearing??0)+(key==='coastal'?.67:0),pitch:key==='coastal'?-.18:-.10});
   this.setMode('flight');
   el('environment').textContent=site.biome+' at spawn · '+site.temperature.toFixed(1)+' °C annual mean · '+Math.round(site.canopy*100)+'% modeled canopy';
   this.sceneTime=performance.now();
   this.sawTerrain=false;
   this.fineSeen=false;
   this.fineMs=null;
   this.diagnostics.select(site);
  }catch(error){
   if(version===this.startVersion){this.diagnostics.select(this.site??null);this.warning(error.message,Infinity);}
  }
  finally{if(version===this.startVersion)this.loading=false;}
 }
 setMode(mode) {
  if(mode==='walk'&&this.site){
   const ground=this.stream.sample(this.player.x,this.player.z);
   if(!ground?.detail){this.warning('Walking becomes available when regional terrain loads.');return;}
   if(ground.wet){this.warning('Fly over dry ground to land.');return;}
   this.player.y=ground.surface+1.72;
   this.player.pitch=clamp3(this.player.pitch,-.95,.95);
  }
  this.mode=mode;
  document.body.dataset.mode=mode;
  for(const key of ['walk','flight'])el(key).setAttribute('aria-pressed',String(key===mode));
 }
 look(dx,dy,rate) {
  this.player.yaw-=dx*rate;
  this.player.pitch=clamp3(this.player.pitch-dy*rate,-1.53,1.53);
 }
 bindControls() {
  this.location.addEventListener('change',()=>this.go(this.location.value));
  el('walk').addEventListener('click',()=>{if(this.site)this.setMode('walk');});
  el('flight').addEventListener('click',()=>this.setMode('flight'));
  const handled=['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyF','KeyQ','KeyE'];
  window.addEventListener('keydown',event=>{
   if(!handled.includes(event.code)||event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.target.matches?.('select,input,summary,button')&&document.pointerLockElement!==this.canvas)return;
   event.preventDefault();
   if(event.code==='KeyF'&&!event.repeat)this.setMode(this.mode==='walk'?'flight':'walk');
   else this.keys.add(event.code);
  });
  window.addEventListener('keyup',event=>this.keys.delete(event.code));
  window.addEventListener('blur',()=>{this.keys.clear();this.axes={x:0,z:0,up:0};});
  let pointer=null;
  this.canvas.addEventListener('pointerdown',event=>{
   if(pointer||event.button!==0)return;
   pointer={id:event.pointerId,x:event.clientX,y:event.clientY,travel:0};
   this.canvas.focus();
   this.canvas.setPointerCapture(event.pointerId);
  });
  this.canvas.addEventListener('pointermove',event=>{
   if(document.pointerLockElement===this.canvas){
    this.look(event.movementX,event.movementY,.0023);
   }else if(pointer?.id===event.pointerId){
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    this.look(dx,dy,event.pointerType==='touch'?.005:.004);
    pointer.x=event.clientX;pointer.y=event.clientY;pointer.travel+=Math.hypot(dx,dy);
   }
  });
  const stop=event=>{
   if(pointer?.id!==event.pointerId)return;
   if(event.type==='pointerup'&&pointer.travel<4&&event.pointerType==='mouse'&&this.canvas.requestPointerLock){
    try{this.canvas.requestPointerLock()?.catch(()=>{});}catch{}
   }
   pointer=null;
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(type,stop);

  const stick=el('stick'),thumb=stick.firstElementChild;
  let active;
  const move=event=>{
   if(active!==event.pointerId)return;
   const box=stick.getBoundingClientRect();
   const x=event.clientX-box.left-box.width/2,y=event.clientY-box.top-box.height/2;
   const length=Math.max(31,Math.hypot(x,y));
   this.axes.x=x/length;this.axes.z=y/length;
   thumb.style.transform='translate('+this.axes.x*31+'px,'+this.axes.z*31+'px)';
  };
  stick.addEventListener('pointerdown',event=>{
   if(active!==undefined)return;
   active=event.pointerId;stick.setPointerCapture(active);move(event);
  });
  stick.addEventListener('pointermove',move);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,event=>{
   if(active!==event.pointerId)return;
   active=undefined;this.axes.x=this.axes.z=0;thumb.style.transform='';
  });
  for(const [id,value] of [['ascend',1],['descend',-1]]) {
   const button=el(id);
   button.addEventListener('pointerdown',event=>{button.setPointerCapture(event.pointerId);this.axes.up=value;});
   for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{if(this.axes.up===value)this.axes.up=0;});
  }
 }
 move(dt) {
  if(!this.site||this.loading)return;
  const p=this.player;
  const key=(...codes)=>Number(codes.some(code=>this.keys.has(code)));
  this.look((key('ArrowRight')-key('ArrowLeft'))*dt,(key('ArrowDown')-key('ArrowUp'))*dt,1.6);
  const side=key('KeyD')-key('KeyA')+this.axes.x;
  const forward=key('KeyW')-key('KeyS')-this.axes.z;
  const vector=Math.max(1,Math.hypot(side,forward));
  const speed=(this.mode==='walk'?3.3:Number(el('speed').value))*dt/vector;
  const x=p.x+(Math.cos(p.yaw)*side-Math.sin(p.yaw)*forward)*speed;
  const z=p.z+(-Math.sin(p.yaw)*side-Math.cos(p.yaw)*forward)*speed;
  if(Math.hypot(x,z)>95000&&(side||forward)){
   this.warning('Regional flight limit reached. Choose another Atlas site to relocate.',500);
   return;
  }
  const sample=this.stream.sample(x,z);
  const surface=sample?.surface??null;
  if(this.mode==='walk'){
   if(!sample?.detail||sample.wet)return;
   const height=surface+1.72;
   if(Math.abs(height-p.y)>Math.max(1.3,speed*1.25))return;
   p.y=height;
  }else{
   const up=key('Space','KeyE')-key('ShiftLeft','ShiftRight','KeyQ')+this.axes.up;
   p.y+=up*speed*.75;
   if(surface!==null)p.y=Math.max(p.y,Math.max(surface,sample.waterSurface??-Infinity)+1.72);
   p.y=Math.min(p.y,20000+curves(x,z));
  }
  p.x=x;p.z=z;
 }
 tick(time) {
  requestAnimationFrame(t=>this.tick(t));
  const dt=Math.min(.05,(time-this.frameTime)/1000);
  if(this.frameTime&&time>this.frameTime)this.fps=.95*this.fps+.05*(1000/(time-this.frameTime));
  this.frameTime=time;
  const p=this.player;
  this.move(dt);
  if(time-this.streamTime>80){
   if(this.site&&!this.loading)this.stream.update(p.x,p.z);
   this.updateHUD(time);
   this.streamTime=time;
  }
  this.view.camera.position.set(p.x,p.y,p.z);
  this.view.camera.rotation.set(p.pitch,p.yaw,0,'YXZ');
  if(!this.contextLost)this.view.render();
 }
 coordinates() {
  const p=this.player,f=this.site.frame;
  if(f.mode==='geo')return [clamp3(f.lat-p.z/f.north,-90,90),normalizeLongitude(f.lon+p.x/f.scale)];
  const x=(f.x+p.x)/1000,z=(f.y+p.z)/1000,sign=f.mode==='north'?1:-1;
  return [clamp3(sign*(90-Math.hypot(x,z)/111.195),-90,90),Math.hypot(x,z)<1e-9?0:Math.atan2(x,sign*z)*180/Math.PI];
 }
 updateHUD(time) {
  if(!this.site||this.loading)return;
  const p=this.player, ground=this.stream.sample(p.x,p.z);
  if(ground){
   if(!this.sawTerrain){this.sawTerrain=true;this.previewMs=time-this.sceneTime;}
   if(ground.fine&&!this.fineSeen){this.fineSeen=true;this.fineMs=time-this.sceneTime;}
  }
  const heading=((Math.round(-p.yaw*180/Math.PI)%360)+360)%360;
  el('bearing').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8]+' '+heading+'°';
  const [lat,lon]=this.coordinates(),elev=p.y-curves(p.x,p.z)-this.baseline.sea;
  el('position').textContent=Math.abs(lat).toFixed(5)+'° '+(lat<0?'S':'N')+' · '+Math.abs(lon).toFixed(5)+'° '+(lon<0?'W':'E')+' · Camera '+Math.round(elev).toLocaleString()+' m ASL';
  el('resolution').textContent=ground?'Rendered ground '+(ground.elevation-this.baseline.sea).toFixed(1)+' m ASL · '+ground.step+' m mesh':'Awaiting terrain';
  const renderer=this.view.renderer.info;
  if(el('info').open)el('performance').textContent=Math.round(this.fps)+' fps · '+this.stream.active.size+' terrain sections · '+renderer.render.calls+' draws · '+Math.round(renderer.render.triangles/1000)+'k triangles';
  this.renderDiagnostics.update(ground);
  this.warnText(time<this.messageUntil?this.message:!ground?'Loading terrain…':'');
 }
}

let explorer;
try {
 explorer=new Explorer();
 explorer.boot().catch(error=>explorer.warnText(error.message));
} catch(error) {
 el('status').textContent='Horizon could not start. '+error.message;
}
