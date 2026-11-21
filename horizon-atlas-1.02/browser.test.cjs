const assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {Script}=require('node:vm');
const files=['horizon-atlas-1.02.html'];
for(const file of files) {
 const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
 for(const [,script] of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Script(script,{filename:file});
}
const chrome=process.env.HORIZON_CHROME??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'chromium');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'horizon102-browser-'));
const proc=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','inherit']});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn, milliseconds=120000){
 const end=Date.now()+milliseconds;
 do{const value=await fn();if(value)return value;await delay(125);}while(Date.now()<end);
 throw Error('Timed out waiting for browser condition: '+fn);
}
const errors=[],sockets=[],requests=[];
async function open(file, mobile=false){
 const target=await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
 const socket=new WebSocket(target.webSocketDebuggerUrl);
 sockets.push(socket);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 const pending=new Map();let id=0;
 socket.onmessage=event=>{
  const {id,method,params,result,error}=JSON.parse(event.data);
  if(id){const {resolve,reject}=pending.get(id);pending.delete(id);error?reject(Error(error.message)):resolve(result);}
  if(method==='Runtime.exceptionThrown')errors.push([file,params.exceptionDetails.exception?.description??params.exceptionDetails.text]);
  if(method==='Runtime.consoleAPICalled'&&params.type==='error')errors.push([file,params.args.map(x=>x.value??x.description)]);
  if(method==='Network.requestWillBeSent')requests.push(params.request.url);
 };
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{
  const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text);
  return response.result.value;
 };
 await send('Runtime.enable');
 await send('Network.enable');
 if(mobile){
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await send('Emulation.setCPUThrottlingRate',{rate:4});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 }else await send('Emulation.setDeviceMetricsOverride',{width:1380,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:pathToFileURL(path.resolve(__dirname,'..',file)).href});
 await until(async()=>{
  const problem=errors.find(([name])=>name===file);
  if(problem)throw Error(JSON.stringify(problem));
  return evaluate('typeof atlas !== "undefined" && Boolean(atlas)').catch(()=>false);
 });
 console.log('Loaded',file,mobile?'(touch viewport)':'');
 return {evaluate,send};
}
let port;
(async()=>{
 port=await until(()=>{try{return fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];}catch{return null;}},20000);
 const widths=[1000000,200000,100000,20000,2000];
 const snapshots=process.env.HORIZON_SNAPSHOTS;
 if(snapshots)fs.mkdirSync(snapshots,{recursive:true});
 for(const mobile of [false,true]){
  const {evaluate,send}=await open(files[0],mobile);
  const start=await evaluate(`({
   version:JSON.parse(horizonAtlasGeography.world().identity)[0],
   main:atlas.layer,planet:$('globalLayer').value,
   raster:atlas.renderer.geographicRaster.width*atlas.renderer.geographicRaster.height,
   viewport:[document.documentElement.scrollWidth,innerWidth]
  })`);
  assert.equal(start.version,'atlas-1.02/backbone-2');
  assert.equal(start.main,'geography');
  assert.equal(start.planet,'backbone');
  assert.ok(start.viewport[0]<=start.viewport[1]);
  assert.ok(start.raster<=24500);
  await evaluate(`(() => {
   const original=atlas.renderer.drawGeography;
   atlas.renderer.drawGeography=function(...args){
    const changed=this.geographicKey;
    const start=performance.now();
    const result=original.apply(this,args);
    if(this.geographicKey!==changed)this.backboneDrawMs=performance.now()-start;
    return result;
   };
  })()`);
  const globe=await evaluate(`(async () => {
   $('atlasHome').click();
   atlas.renderer.geographicKey=null;atlas.redraw();
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return atlas.renderer.backboneDrawMs;
  })()`);
  async function snapshot(name){
   if(!snapshots)return;
   const data=await evaluate('atlas.renderer.canvas.toDataURL("image/png").split(",")[1]');
   fs.writeFileSync(path.join(snapshots,(mobile?'touch-':'desktop-')+name+'.png'),Buffer.from(data,'base64'));
  }
  await snapshot('planet');
  const comparisons=[];
  for(const site of ['backbone-massif','backbone-range','backbone-seam']){
   await evaluate(`$('atlasSites').value='${site}';$('atlasSites').dispatchEvent(new Event('change'))`);
   const canonical=await evaluate('horizonAtlasGeography.world().elevation(...atlas.point)');
   const timings=[];
   const rasterHashes=new Set();
   for(const width of widths){
    const result=await evaluate(`(async () => {
     $('atlasExtent').value='${width}';
     $('atlasApplyExtent').click();
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const ms=atlas.renderer.backboneDrawMs;
     const canvas=atlas.renderer.geographicRaster;
     let hash=2166136261;
     for(const byte of canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data)hash=Math.imul(hash^byte,16777619);
     return {width:atlas.viewWidth(),elevation:horizonAtlasGeography.world().elevation(...atlas.point),
      text:$('atlasGeoReadout').textContent,hash,ms};
    })()`);
    assert.ok(Math.abs(result.width/width-1)<.02, JSON.stringify(result));
    assert.equal(result.elevation,canonical);
    assert.match(result.text,/Canonical elevation/);
    timings.push(Number(result.ms.toFixed(1)));
    rasterHashes.add(result.hash);
    await snapshot(site+'-'+width);
   }
   assert.equal(rasterHashes.size,widths.length);
   comparisons.push({site,timings});
  }
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(url=>url.startsWith('file:')||url.startsWith('blob:')||url.startsWith('data:')),requests.join('\n'));
  const heap=(await send('Runtime.getHeapUsage')).usedSize/1024**2;
  console.log(JSON.stringify({mobile,globeMs:Number(globe.toFixed(1)),heapMiB:Number(heap.toFixed(1)),rasterPixels:start.raster,comparisons}));
 }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
 for(const socket of sockets)socket.close();
 proc.kill();
 proc.once('exit',()=>{try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:2});}catch{}});
});
