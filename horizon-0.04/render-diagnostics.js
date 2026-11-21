'use strict';

class RenderDiagnostics {
 constructor(explorer) {
  this.explorer=explorer;
  this.panel=document.getElementById('render-diagnostics');
  this.toggle=document.getElementById('render-toggle');
  this.close=document.getElementById('render-close');
  this.metrics=document.getElementById('render-metrics');
  this.result=document.getElementById('render-audit');
  this.revision=0;
  this.toggle.addEventListener('click',()=>{
   if(this.panel.hidden&&!explorer.diagnostics.panel.hidden)explorer.diagnostics.toggle(false);
   this.show(this.panel.hidden);
  });
  document.getElementById('site-diagnostics').addEventListener('click',()=>this.show(false,false));
  this.close.addEventListener('click',()=>this.show(false));
  this.panel.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();this.show(false);}
  });
  this.panel.addEventListener('change',event=>{
   const {value,checked}=event.target;
   this.explorer.view.setLayer(value,checked);
   if(value==='water')document.getElementById('render-water-key').hidden=!checked;
   if(value==='material')document.getElementById('render-material-key').hidden=!checked;
  });
  document.getElementById('render-sample').addEventListener('click',()=>this.compare());
 }
 show(open,focus=true) {
  this.panel.hidden=!open;
  this.toggle.setAttribute('aria-expanded',String(open));
  if(focus)(open?this.close:this.toggle).focus();
 }
 clear() {
  this.revision++;
  this.result.textContent='';
 }
 update(ground) {
  if(this.panel.hidden)return;
  const {stream,view,fps}=this.explorer;
  const levels=new Map();
  let missing=0,added=0;
  const totals={stage:{count:0,sum:0,max:0},bed:{count:0,sum:0,max:0}};
  for(const key of stream.active){
   const {data}=stream.cache.get(key);
   const step=data.chunk.size/(data.n-1);
   if(view.layers.water&&data.waterErrors){
    missing+=data.waterErrors.missing;
    added+=data.waterErrors.added;
   }
   if(view.layers.water&&data.waterErrors)for(const name of Object.keys(totals)){
    const source=data.waterErrors[name],total=totals[name];
    total.count+=source.count;
    total.sum+=source.sum;
    total.max=Math.max(total.max,source.max);
   }
   levels.set(step,(levels.get(step)??0)+1);
  }
  const lod=[...levels].sort((a,b)=>a[0]-b[0]).map(([step,count])=>count+' × '+step+' m').join(' · ');
  const {calls,triangles}=view.renderer.info.render;
  this.metrics.textContent=[
   Math.round(fps)+' fps · '+calls+' draws · '+Math.round(triangles/1000)+'k triangles',
   lod?'Active chunks by mesh spacing · '+lod:'Waiting for active chunks',
   ...Object.entries(totals).filter(([,stats])=>stats.count).map(([name,{count,sum,max}])=>
    'Water '+name+' error · mean '+(sum/count).toFixed(3)+' m · max '+max.toFixed(3)+' m · '+count+' vertices'),
   view.layers.water?'LOD mask differences · '+missing+' source-wet now dry · '+added+' source-dry now wet':'',
   ground?'Current mesh · '+(ground.fine?'fine':ground.detail?'regional':'broad')+' · '+(ground.slope*100).toFixed(1)+'% slope':''
  ].filter(Boolean).join('\n');
 }
 async compare() {
  const {site,stream,player}=this.explorer;
  if(!site||this.explorer.loading)return;
  const revision=++this.revision;
  const coordinates=this.explorer.coordinates();
  const curvature=curves(player.x,player.z);
  const ground=stream.sample(player.x,player.z);
  const camera=player.y-curves(player.x,player.z)-this.explorer.baseline.sea;
  this.result.textContent='Sampling Atlas…';
  try{
   const audit=await this.explorer.data.ask('audit',coordinates);
   if(revision!==this.revision)return;
   const asl=z=>(z-audit.sea).toFixed(2)+' m ASL';
   const pct=f=>(100*f).toFixed(1)+'%';
   const water=(type,stage,depth,tide)=>['dry','river','lake','ocean','marine inundation'][type]+
    (tide>.1?' · tidal':'')+(type?' · stage '+asl(stage)+' · depth '+depth.toFixed(2)+' m':'');
   const xyz=point=>point.map(v=>v.toFixed(5)+'°').join(', ');
   const mix=values=>values.map((f,i)=>['rock','gravel','sand','soil','litter','moss'][i]+' '+pct(f)).join(' · ');
   const {nearest,regional,fine,cell}=audit;
   this.result.textContent=[
    'Captured '+xyz(coordinates)+' · camera '+camera.toFixed(2)+' m ASL',
    'Nearest Atlas node '+xyz(audit.node)+' · '+asl(nearest.z)+' · '+pct(nearest.slope)+' slope · '+water(nearest.type,nearest.stage,nearest.depth,nearest.tidal),
    'Atlas regional at capture · '+asl(regional.z)+' · '+water(regional.type,regional.stage,regional.depth,regional.tide),
    fine?'Atlas fine at capture · '+asl(fine.z)+' · '+water(fine.type,fine.stage,fine.depth,fine.tide):'',
    ground?'Rendered at capture · '+asl(ground.elevation)+' · '+pct(ground.slope)+' slope · '+water(ground.waterType,ground.wet?ground.waterSurface-curvature:null,ground.waterDepth,ground.tidal)+' · '+ground.step+' m spacing':'Rendered mesh pending at capture',
    fine?.water&&ground?.wet?'Captured water stage error · '+Math.abs(ground.waterSurface-curvature-fine.stage).toFixed(3)+' m':'',
    fine?.water===2&&nearest.lake?'Atlas lake · '+(nearest.lake.area/1e6).toFixed(3)+' km²':'',
    'Atlas node canopy '+pct(nearest.canopy)+' · '+nearest.density.toFixed(1)+' stems/ha',
    'Population cell · '+(cell.masked?'masked':cell.trees.toLocaleString()+' trees · '+(cell.area/10000).toFixed(2)+' ha · '+pct(cell.canopy)+' canopy'),
    ground?'Rendered canopy input '+pct(ground.canopy)+' · low vegetation '+pct(ground.cover[6]):'',
    nearest.cover?'Atlas ground · '+mix(nearest.cover):'',
    ground?'Rendered ground inputs · '+mix(ground.cover.slice(0,6))+(ground.cover[7]>.001?' · snow/ice '+pct(ground.cover[7]):''):''
   ].filter(Boolean).join('\n');
  }catch(error){
   if(revision===this.revision)this.result.textContent=error.message;
  }
 }
}

