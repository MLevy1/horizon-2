const assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {Script}=require('node:vm');
const files=['horizon-056.html','horizon-atlas-1.01.html'];
for(const file of files) {
 const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
 for(const [,script] of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Script(script,{filename:file});
}
const chrome=process.env.HORIZON_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'horizon101-browser-'));
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
 const legacy=await open(files[0]), desktop=await open(files[1]);
 const fingerprint=`(() => {
  let hash=2166136261;
  for(const buffer of [model.elev,hydro.elev,hydro.meanQ,climate.annual,planetBiomes]){
   for(const byte of new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength))hash=Math.imul(hash^byte,16777619);
  }
  return [SEED,sea,waterShare,hash>>>0];
 })()`;
 assert.deepEqual(await desktop.evaluate(fingerprint),await legacy.evaluate(fingerprint));
 assert.notEqual(await desktop.evaluate('APP_CACHE'),await legacy.evaluate('APP_CACHE'));
 assert.notEqual(await desktop.evaluate('tileKey(180,360)'),await legacy.evaluate('tileKey(180,360)'));
 assert.equal(await desktop.evaluate('horizonAtlasGeography.world().elevation(12.25,-179.75)'),await legacy.evaluate('(hydro.elev[hidx(155,0)]-sea)*1000'));
 const search=(page,point)=>page.evaluate(`$('atlasCoords').value=${JSON.stringify(point)};$('atlasSearch').requestSubmit()`);
 const widths=[500000,100000,20000,2000,200,20];
 await desktop.evaluate('$("atlasGeography").open=true');
 for(const [input,expected,mode] of [
  ['12.3456789, 540.0000001',[12.3456789,-179.99999990000003],'geo'],
  ['90, 177',[90,0],'north'],
  ['-90, -179',[-90,0],'south']
 ]){
  await search(desktop,input);
  const point=await desktop.evaluate('atlas.point');
  assert.equal(point[0],expected[0]);
  assert.ok(Math.abs(point[1]-expected[1])<1e-10);
  const elevation=await desktop.evaluate('horizonAtlasGeography.world().elevation(...atlas.point)');
  for(const width of widths){
   await desktop.evaluate(`$('atlasExtent').value='${width}';$('atlasApplyExtent').click()`);
   const current=await desktop.evaluate(`({
    point:atlas.point,center:atlas.locationAt(atlas.camera.w/2,atlas.camera.h/2),
    width:atlas.viewWidth(),mode:atlas.camera.mode,height:horizonAtlasGeography.world().elevation(...atlas.point)
   })`);
   assert.ok(Math.abs(current.width-width)<1e-5);
   assert.equal(current.mode,mode);
   assert.deepEqual(current.point,point);
   for(let i=0;i<2;i++)assert.ok(Math.abs(current.center[i]-point[i])<1e-10);
   assert.equal(current.height,elevation);
  }
 }
 await until(()=>desktop.evaluate('$("atlasGeoReadout").textContent.includes("nearest tile node") && $("atlasResolution").textContent.includes("detail unresolved")'));
 assert.equal(await desktop.evaluate('AtlasWorld.generated'),0);
 console.log('Source parity, exact coordinates, pole navigation and all preset widths passed');

 // Fixture data lives only in this disposable browser profile.
 await desktop.evaluate(`(async()=>{
  const api=horizonAtlasGeography;
  const catalog=await api.readFeatures();
  if(catalog.records.length)throw Error('Expected an empty Stage A catalog');
  await api.saveFeatures(AtlasGeography.featureCatalog(catalog.identity,[{
   id:'qa-crossing',kind:'fixture',status:'provisional',source:'QA fixture',level:5,
   geometry:{type:'line',parts:[[[3,179],[3,181]]]}
  }]));
 })()`);
 const reopened=await open(files[1]);
 assert.equal(await reopened.evaluate(`(async()=>{
  const catalog=await horizonAtlasGeography.readFeatures();
  const address=AtlasGeography.locate(3,-179.5,12);
  return catalog.query(address)[0].id;
 })()`),'qa-crossing');
 assert.deepEqual(await reopened.evaluate('atlas.point'),[-90,0]);
 console.log('Feature catalog and selected location survived reload');

 await desktop.send('Page.bringToFront');
 await search(desktop,'0, 179.99999');
 await desktop.evaluate('$("atlasLayer").value="terrain";$("atlasLayer").dispatchEvent(new Event("change"))');
 await until(()=>desktop.evaluate('Boolean(AtlasWorld.get(AtlasCoordinates.locate(...atlas.point)))'));
 assert.equal(await desktop.evaluate('AtlasWorld.workerFallback'),'');
 const sourceTile=`(() => {
  const data=AtlasWorld.get(AtlasCoordinates.locate(0,179.99999));
  let hash=2166136261;
  for(const array of [data.height,data.base,data.depth,data.channelQ]){
   for(const byte of new Uint8Array(array.buffer))hash=Math.imul(hash^byte,16777619);
  }
  return hash>>>0;
 })()`;
 await search(legacy,'0, 179.99999');
 await until(()=>legacy.evaluate('Boolean(AtlasWorld.get(AtlasCoordinates.locate(...atlas.point)))'));
 assert.equal(await desktop.evaluate(sourceTile),await legacy.evaluate(sourceTile));
 await until(()=>desktop.evaluate('!atlas.fetching&&!busy&&($("atlasFine").click(), atlas.fineBusy)'));
 await until(()=>desktop.evaluate('Boolean(atlas.fine)&&!atlas.fineBusy'));
 await until(()=>desktop.evaluate('$("atlasResolution").textContent.includes("provisional roughness")'));
 console.log('Legacy worker tile parity and provisional roughness preview passed');

 const mobile=await open(files[1],true);
 assert.equal(await mobile.evaluate('document.documentElement.scrollWidth'),390);
 await mobile.evaluate('$("atlasHome").click()');
 const startScale=await mobile.evaluate('atlas.camera.s');
 const start=[{x:105,y:270,id:1},{x:215,y:270,id:2}];
 await mobile.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:start});
 await mobile.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:72,y:270,id:1},{x:256,y:270,id:2}]});
 await mobile.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until(()=>mobile.evaluate('atlas.camera.s > '+startScale));
 await mobile.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:320}]});
 await mobile.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await until(()=>mobile.evaluate('Boolean(atlas.point)'));
 await mobile.evaluate('$("atlasGeography").open=true;$("atlasExtent").value="20";$("atlasApplyExtent").click()');
 await until(()=>mobile.evaluate('Math.abs(atlas.viewWidth()-20)<1e-5 && $("atlasResolution").textContent.includes("detail unresolved")'));
 const budget=await mobile.evaluate(`({
  width:atlas.viewWidth(),rawLegacyTiles:mem.size,
  geographicRaster:atlas.renderer.geographicRaster.width*atlas.renderer.geographicRaster.height,
  backingPixels:$("atlasCanvas").width*$("atlasCanvas").height
 })`);
 assert.ok(budget.backingPixels<=2203000 && budget.geographicRaster<=14200 && budget.rawLegacyTiles===0);
 const timing=await mobile.evaluate(`(() => {
  const values=[];
  for(let i=0;i<20;i++){
   atlas.pan(4,0);
   const start=performance.now();
   atlas.renderer.drawGeography(atlas.camera,atlas.renderer.context);
   values.push(performance.now()-start);
  }
  return values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 })()`);
 console.log('Chrome mobile canvas budget',budget,'median synchronous raster ms',timing);
 assert.ok(requests.every(url=>!/^https?:/.test(url)),JSON.stringify(requests));
 assert.deepEqual(errors,[]);
 console.log('Browser assertions passed');
})().catch(error=>{console.error(error,errors);process.exitCode=1;}).finally(()=>{
 for(const socket of sockets)socket.close();
 proc.kill();
});
