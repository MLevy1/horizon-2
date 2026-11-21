const assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {Script}=require('node:vm');
const files=['horizon-055.html','horizon-056.html'];
for(const file of files) {
 const source=fs.readFileSync(file,'utf8');
 for(const [,script] of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Script(script,{filename:file});
}
const chrome=process.env.HORIZON_CHROME??'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'horizon056-browser-'));
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
  await send('Emulation.setDeviceMetricsOverride',{width:mobile==='tablet'?820:390,height:mobile==='tablet'?1180:844,deviceScaleFactor:mobile==='tablet'?2:3,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 }else await send('Emulation.setDeviceMetricsOverride',{width:1380,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:pathToFileURL(path.resolve(file)).href});
 await until(()=>evaluate(file===files[0]?'typeof hydro !== "undefined" && Boolean(hydro) && !busy':'typeof atlas !== "undefined" && Boolean(atlas)').catch(()=>false));
 return {evaluate,send,close:()=>socket.close()};
}
let port;
(async()=>{
 port=await until(()=>{try{return fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];}catch{return null;}},20000);
 const a=await open(files[0]), b=await open(files[1]);
 const world=`(() => {
  const values=[waterShare,sea,scenarioMetrics(model,waterShare),model.elev,climate,hydro,planetBiomes];
  const seen=new WeakSet();let hash=2166136261,bytes=0;
  const add=v=>{if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);
   if(!ArrayBuffer.isView(v)){for(const x of Object.values(v))add(x);return;}
   for(const n of new Uint8Array(v.buffer,v.byteOffset,v.byteLength)){hash=Math.imul(hash^n,16777619);bytes++;}
  };
  values.forEach(add);return [waterShare,sea,values[2],hash>>>0,bytes];
 })()`;
 const fullSurface=world.replace('model.elev,climate,hydro,planetBiomes','model.elev,climate,hydro,planetBiomes,prepareSurfaceWorld(),prepareEcoWorld()');
 const numeric=await a.evaluate(world);
 assert.deepEqual(await b.evaluate(world),numeric);
 console.log('WORLD',JSON.stringify(numeric));
 assert.equal(await b.evaluate('Math.abs(waterVolume(model,sea)/(EARTH_OCEAN_KM3*.69)-1)<1e-10'),true);
 const surface=await a.evaluate(fullSurface);
 assert.deepEqual(await b.evaluate(fullSurface),surface);
 console.log('SURFACE',surface.slice(-2));
 const select=async (page,id,value)=>page.evaluate(`$('${id}').value=${JSON.stringify(value)};$('${id}').dispatchEvent(new Event('change'))`);
 const search=async(page,value)=>page.evaluate(`$ ('atlasCoords').value=${JSON.stringify(value)};$('atlasSearch').requestSubmit()`);
 const state=page=>page.evaluate('({generated:AtlasWorld.generated,fallback:AtlasWorld.workerFallback,errors:\$("atlasError").textContent,status:\$("atlasResolution").textContent,mem:mem.size,point:atlas.point,mode:atlas.camera.mode})');
 const match=async page=>until(()=>page.evaluate('atlas.point&&Boolean(AtlasWorld.get(AtlasCoordinates.locate(...atlas.point)))'));
 const click=async(page,x,y)=>{
  await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
  await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
 };
 assert.equal(await b.evaluate('$("atlasResearch").open'),false);
 assert.equal(await b.evaluate('AtlasWorld.generated'),0);
 await click(b,500,430);
 assert.ok(await b.evaluate('atlas.point.length===2'));
 await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:500,y:430,deltaX:0,deltaY:-380});
 assert.ok(await b.evaluate('atlas.camera.s>atlas.minimum'));
 const originalX=await b.evaluate('atlas.camera.x');
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:550,y:430,button:'left',buttons:1,clickCount:1});
 await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:595,y:450,button:'left',buttons:1});
 await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:595,y:450,button:'left',buttons:0,clickCount:1});
 assert.notEqual(await b.evaluate('atlas.camera.x'),originalX);
 await search(b,'91, 0');
 assert.equal(await b.evaluate('$("atlasError").hidden'),false);
 const start=Date.now();
 await search(b,'0.25 S, 113.75 W');
 await match(b);
 console.log('LOCAL',Date.now()-start,await state(b));
 assert.equal((await state(b)).fallback,'');
 const tileData=`(t => {
  let hash=2166136261,n=0;
  for(const v of Object.values(t)) if(ArrayBuffer.isView(v))
   for(const x of new Uint8Array(v.buffer,v.byteOffset,v.byteLength)){hash=Math.imul(hash^x,16777619);n++;}
  return [hash>>>0,n,t.summary,t.lakes.length];
 })`;
 assert.deepEqual(await b.evaluate(tileData+'(AtlasWorld.get(AtlasCoordinates.locate(...atlas.point)))'),
                  await a.evaluate(tileData+'(generateTile(180,132))'));
 const allLayers=await b.evaluate('Object.values(AtlasLayers).flatMap(Object.keys)');
 for(const layer of allLayers){
  await select(b,'atlasLayer',layer);
  await delay(200);
 }
 await select(b,'atlasLayer','rain');
 await b.evaluate('$("atlasBlend").click()');
 assert.equal(await b.evaluate('$("atlasBlend").checked'),true);
 await select(b,'atlasLayer','terrain');
 await b.evaluate(`for(const d of $('atlasEntries').children)d.open=true`);
 assert.equal(await until(()=>b.evaluate('$("atlasEntries").querySelector("tbody")?.rows.length')),12);
 await until(()=>b.evaluate(`[...$('atlasEntries').children].every(d=>d.querySelector('p')?.textContent.length>20)`));
 assert.match(await b.evaluate('$("atlasEntries").textContent'),/2° geology/);
 await until(()=>b.evaluate('!atlas.fetching'));
 await b.evaluate('$("atlasFine").click()');
 await until(()=>b.evaluate('!atlas.fineBusy'));
 assert.ok(await b.evaluate('AtlasFine.probe(atlas.fine,atlas.point)?.step===16'));
 const fine=await b.evaluate('({samples:atlas.fine.samples.length,finite:atlas.fine.samples.filter(Number.isFinite).length,center:AtlasFine.probe(atlas.fine,atlas.point).height})');
 console.log('FINE',fine);
 const parent=await a.evaluate(`(() => {
  const origin={...geoTile(180,132),x:127.5,y:127.5};
  origin.spacing=sampleSpacing(origin);
  const t=generateTile(origin.row,origin.col);mem.set(tileKey(origin.row,origin.col),t);
  buildFineRiverIndex(origin,{x0:100,x1:155,y0:100,y1:155});
  return fineSample(origin,origin.x,origin.y,new Map()).z;
 })()`);
 assert.equal(fine.center,Math.fround(parent));
 assert.equal(fine.finite,16641);
 for(const step of ['2','64']){
  await until(()=>b.evaluate('!atlas.fetching'));
  await select(b,'atlasFineStep',step);
  await until(()=>b.evaluate('!atlas.fineBusy&&atlas.fine?.step==='+step));
  assert.ok(await b.evaluate('AtlasFine.probe(atlas.fine,atlas.point)?.step==='+step));
 }
 await search(b,'12, 181');
 assert.deepEqual(await b.evaluate('atlas.point'),[12,-179]);
 await search(b,'0.25, 179.99');
 await match(b);
 assert.ok(await b.evaluate('atlas.visibleTiles().some(e=>e.tile.col===0)&&atlas.visibleTiles().some(e=>e.tile.col===719)'));
 const edge=await b.evaluate(`(() => {
  const a=tilePoint(179,719,127,255),b=tilePoint(179,0,127,0);
  return {same:a.every((v,i)=>v===b[i]),height:landform(...a)===landform(...b)};
 })()`);
 assert.deepEqual(edge,{same:true,height:true});
 await until(()=>b.evaluate('Boolean(AtlasWorld.get(geoTile(179,0)))'));
 const seam=await b.evaluate(`(() => {
  const west=AtlasWorld.get(geoTile(179,719)),east=AtlasWorld.get(geoTile(179,0));
  return Math.max(...Array.from({length:256},(_,i)=>Math.abs(west.base[i*256+255]-east.base[i*256])));
 })()`);
 assert.equal(seam,0);
 console.log('SEAM',seam);
 await select(b,'atlasSites','north');
 await match(b);
 assert.equal(await b.evaluate('atlas.camera.mode'),'north');
 await select(b,'atlasSites','south');
 await match(b);
 assert.equal(await b.evaluate('atlas.camera.mode'),'south');
 await select(b,'atlasSites','highest');
 await match(b);
 await select(b,'atlasSites','tropical');
 await match(b);
 assert.ok(await b.evaluate('mem.size<=11'));
 await until(()=>b.evaluate('!atlas.site&&!atlas.fetching'));
 const plot=await b.evaluate('AtlasCoordinates.locate(...atlas.point)');
 const readObjects=`((t,p)=>{
  const cell=objectCell(t,prepareEcoTile(t),Math.min(254,Math.floor(p.x)),Math.min(254,Math.floor(p.y)));
  const data=createObjectExport(cell,objectCohorts(cell));
  return {counts:Array.from(cell.counts),cohorts:data?.treeCohorts,records:data?.objects.slice(0,3)};
 })`;
 const objects=await b.evaluate(readObjects+'(AtlasWorld.get('+JSON.stringify(plot)+'),'+JSON.stringify(plot)+')');
 assert.ok(objects.counts[0]>0);
 assert.deepEqual(objects,await a.evaluate(readObjects+'(generateTile('+plot.row+','+plot.col+','+JSON.stringify(plot.mode)+'),'+JSON.stringify(plot)+')'));
 console.log('OBJECTS',objects.counts);
 const saved=await b.evaluate('atlas.point');
 const mobile=await open(files[1],true);
 assert.deepEqual(await mobile.evaluate('atlas.point'),saved);
 await mobile.evaluate('atlas.fit()');
 const touch=(type,points)=>mobile.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id}))});
 await touch('touchStart',[[130,310,1],[250,310,2]]);
 await touch('touchMove',[[90,315,1],[295,315,2]]);
 await touch('touchEnd',[]);
 assert.ok(await mobile.evaluate('atlas.camera.s>atlas.minimum'));
 await touch('touchStart',[[200,300,1]]);
 await touch('touchMove',[[245,335,1]]);
 await touch('touchEnd',[]);
 assert.notEqual(await mobile.evaluate('atlas.camera.x'),0);
 await touch('touchStart',[[180,330,1]]);
 await touch('touchEnd',[]);
 assert.ok(await mobile.evaluate('atlas.point.length===2'));
 assert.equal(await mobile.evaluate('document.documentElement.scrollWidth'),390);
 await mobile.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await search(mobile,'-0.25,-113.75');
 await match(mobile);
 assert.ok(await mobile.evaluate('AtlasWorld.generated===0'));
 await search(mobile,'64.35, 101.15');
 await match(mobile);
 assert.ok(await mobile.evaluate('AtlasWorld.generated>0&&AtlasWorld.workerFallback===""'));
 await until(()=>mobile.evaluate('!atlas.fetching'));
 await mobile.evaluate('atlas.fit()');
 assert.ok(await mobile.evaluate('$("atlasCanvas").width*$("atlasCanvas").height<=2203000'));
 await mobile.evaluate('$("atlasOpenLocation").click()');
 assert.equal(await mobile.evaluate('document.activeElement.id'),'atlasLocation');
 await mobile.evaluate('window.scrollTo(0,0)');
 await mobile.evaluate('atlas.fit()');
 if(process.env.HORIZON_CAPTURE)await mobile.send('Page.captureScreenshot',{format:'png'}).then(x=>fs.writeFileSync(path.resolve('horizon056-mobile-check.png'),Buffer.from(x.data,'base64')));
 await b.evaluate('atlas.fit()');
 if(process.env.HORIZON_CAPTURE)await b.send('Page.captureScreenshot',{format:'png'}).then(x=>fs.writeFileSync(path.resolve('horizon056-desktop-check.png'),Buffer.from(x.data,'base64')));
 console.log('DESKTOP',await state(b));
 console.log('BUDGET',await b.evaluate('({raw:mem.size,rasters:atlas.renderer.pixels.size,overviews:atlas.renderer.overviews.size,backingPixels:$("atlasCanvas").width*$("atlasCanvas").height})'));
 await b.evaluate('$("atlasEntries").querySelector("button").click()');
 await until(()=>b.evaluate('$("atlasResearch").open&&Boolean(objectSelection)&&!busy'));
 await until(()=>b.evaluate('!busy&&$("generate").textContent!=="Loading tiles…"'));
 assert.equal(await b.evaluate('Boolean($("climateExport")&&$("objectExport")&&$("fineResult")&&$("profile")&&$("scenarioSummary"))'),true);
 assert.equal(await b.evaluate('AtlasWorld.workerFallback'), '');
 console.log('MOBILE',await state(mobile));
 const tablet=await open(files[1],'tablet');
 assert.equal(await tablet.evaluate('document.documentElement.scrollWidth'),820);
 assert.ok(await tablet.evaluate('atlasCompactView.matches&&atlas.camera.w===820&&atlas.camera.h>=1000'));
 await tablet.evaluate('$("atlasHome").click()');
 assert.ok(await tablet.evaluate('AtlasWorld.focusLimit===4'));
 console.log('TABLET',await tablet.evaluate('({width:atlas.camera.w,height:atlas.camera.h,layout:getComputedStyle(document.querySelector(".atlas-shell")).display})'));
 assert.ok(requests.every(url=>!/^https?:/.test(url)),JSON.stringify(requests));
 assert.deepEqual(errors,[]);
 console.log('All browser assertions passed');
})().catch(error=>{console.error(error,errors);process.exitCode=1;}).finally(()=>{
 for(const socket of sockets)socket.close();
 proc.kill();
});


