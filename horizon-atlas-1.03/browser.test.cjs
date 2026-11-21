const assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {Script}=require('node:vm');
const files=['horizon-atlas-1.03.html'];
for(const file of files) {
 const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
 for(const [,script] of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Script(script,{filename:file});
}
const chrome=process.env.HORIZON_CHROME??(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'chromium');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'horizon103-browser-'));
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
 for(const mobile of [false,true]){
  const {evaluate}=await open(files[0],mobile);
  await until(()=>evaluate('Boolean(atlas.renderer.geographicKey)'));
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.equal(await evaluate('JSON.parse(horizonAtlasGeography.world().identity)[0]'),'atlas-1.03/east-crown-watershed-1');
  await evaluate(`$('atlasSites').value='east-crown-pilot';$('atlasSites').dispatchEvent(new Event('change'))`);
  const probes=[];
  for(const width of [1000000,200000,20000,5000,1000,250,1000]){
   await evaluate(`$('atlasExtent').value='${width}';$('atlasApplyExtent').click()`);
   const start=Date.now();
   await until(()=>evaluate(`!atlas.renderer.geographicJob && JSON.parse(atlas.renderer.geographicKey)[3]===atlas.camera.s`));
   const probe=await evaluate(`(() => {
    const c=atlas.renderer.geographicRaster;
    let hash=2166136261;
    for(const byte of c.getContext('2d').getImageData(0,0,c.width,c.height).data)
     hash=Math.imul(hash^byte,16777619);
    return {width:atlas.viewWidth(),hash,pixels:c.width*c.height,
     elevation:geography().elevation(...atlas.point),text:$('atlasGeoReadout').textContent};
   })()`);
   assert.ok(Math.abs(probe.width/width-1)<.02,JSON.stringify(probe));
   assert.match(probe.text,/East Crown folded bedrock/);
   assert.ok(probe.pixels<=(mobile?15000:24500));
   probes.push({...probe,elapsedMs:Date.now()-start});
   const out=process.env.HORIZON_SNAPSHOTS;
   if(out){
    const data=await evaluate('atlas.renderer.geographicRaster.toDataURL("image/png").split(",")[1]');
    fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,(mobile?'touch-':'desktop-')+width+'.png'),Buffer.from(data,'base64'));
   }
  }
  assert.equal(new Set(probes.map(p=>p.elevation)).size,1);
  assert.equal(new Set(probes.slice(0,-1).map(p=>p.hash)).size,6);
  assert.equal(probes[4].hash,probes[6].hash);
  console.log(JSON.stringify({mobile,views:probes.map(({width,elapsedMs,pixels})=>({width,elapsedMs,pixels}))}));
 }
 assert.deepEqual(errors,[]);
 assert.ok(requests.every(url=>/^(file|blob|data):/.test(url)));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
 for(const socket of sockets)socket.close();
 proc.kill();
 proc.once('exit',()=>{
  const parent=path.resolve(os.tmpdir()), target=path.resolve(dir);
  if(path.dirname(target)!==parent||!path.basename(target).startsWith('horizon103-browser-'))return;
  try{fs.rmSync(target,{recursive:true,force:true,maxRetries:2});}catch{}
 });
});
