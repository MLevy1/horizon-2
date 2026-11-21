'use strict';

class SiteDiagnostics {
 constructor(data) {
  this.data=data;
  this.cache=new Map();
  this.button=document.getElementById('site-diagnostics');
  this.panel=document.getElementById('atlas-diagnostics');
  this.heading=document.getElementById('diagnostics-site');
  this.fields=document.getElementById('diagnostics-fields');
  this.source=document.getElementById('diagnostics-source');
  this.close=document.getElementById('diagnostics-close');
  this.button.addEventListener('click',()=>this.toggle(this.panel.hidden));
  this.close.addEventListener('click',()=>this.toggle(false));
  this.panel.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();this.toggle(false);}
  });
 }
 toggle(open) {
  this.panel.hidden=!open;
  this.button.setAttribute('aria-expanded',String(open));
  if(open){this.close.focus();void this.refresh();}
  else this.button.focus();
 }
 select(site) {
  this.site=site;
  if(!this.panel.hidden)void this.refresh();
 }
 async refresh() {
  const site=this.site;
  this.fields.replaceChildren();
  this.source.textContent='';
  if(!site){this.heading.textContent='Waiting for the selected site…';return;}
  const {lat,lon}=site.frame,key=JSON.stringify([lat,lon]);
  const format=([a,b])=>Math.abs(a).toFixed(5)+'° '+(a<0?'S':'N')+' · '+Math.abs(b).toFixed(5)+'° '+(b<0?'W':'E');
  this.heading.textContent=site.site.label+' spawn · '+format([lat,lon]);
  try{
   if(!this.cache.has(key)){
    this.fields.textContent='Reading Atlas data…';
    this.cache.set(key,this.data.ask('diagnose',{lat,lon}).catch(error=>{this.cache.delete(key);throw error;}));
   }
   const result=await this.cache.get(key);
   if(this.site!==site||this.panel.hidden)return;
   this.fields.replaceChildren(...result.sections.map(([label,rows],i)=>{
    const section=document.createElement('details');
    const summary=document.createElement('summary');
    const list=document.createElement('dl');
    section.open=i===0;
    summary.textContent=label;
    for(const [term,value] of rows){
     const dt=document.createElement('dt'),dd=document.createElement('dd');
     dt.textContent=term;dd.textContent=value;list.append(dt,dd);
    }
    section.append(summary,list);
    return section;
   }));
   this.source.textContent='Sampled node '+format(result.coordinates)+'. '+result.source;
  }catch(error){
   if(this.site===site&&!this.panel.hidden)this.fields.textContent='Atlas data could not load. Close and reopen the panel to retry.';
  }
 }
}
