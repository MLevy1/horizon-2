const fs=require('node:fs'),assert=require('node:assert/strict');
const THREE=require('./horizon-0.01/vendor/three-r160.1.min.js');
const read=path=>fs.readFileSync(path,'utf8');
const self={addEventListener(){}};
const sites=[['coastal',15.30196,-41.87843],['lake',16.87939,55.05695],
 ['dry',-32.24902,17.74902],['boreal',56.76,14.75],['tropical',12.25,-169.245],
 ['ocean',15.30196,-41.879363],['river',56.7608993,14.746722]];
for(const version of ['0.03','0.04']){
 const dir='horizon-'+version;
 const atlas=new Function('self',read(dir+'/world-source.js')+
  ';return new Function("self",HORIZON_WORLD_SOURCE+";return {initialize,audit,start,frameAt,toLocal,meshData};")(self);')(self);
 const render=new Function('THREE',read(dir+'/stream.js')+'\n'+read(dir+'/renderer.js')+
 ';return {Grid,curves,initializeSurface,transitionTopology,sampleMesh,waterMesh,terrainMesh'+
 (version==='0.04'?',measureWater':'')+'};')(THREE);
 atlas.initialize();
 for(const [name,lat,lon] of sites){
  const a=atlas.audit([lat,lon]),frame=atlas.start(name==='lake'?'alpine':name==='ocean'?'coastal':name==='river'?'boreal':name).frame;
  const [x,z]=atlas.toLocal(frame,lat,lon),size=1024;
  const chunk={size,x:render.Grid.minimum(x,size),z:render.Grid.minimum(z,size)};
  const d=atlas.meshData({frame,chunk,detail:true});
  render.initializeSurface(d);
  render.measureWater?.(d);
  const topo=render.transitionTopology(d,[]);
  const water=render.waterMesh(d,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),topo);
  const ground=render.terrainMesh(d,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),topo);
  const ray=new THREE.Raycaster(new THREE.Vector3(x,25000,z),new THREE.Vector3(0,-1,0));
  const actual=mesh=>mesh?ray.intersectObject(mesh,false)[0]?.point.y:null;
  const s=render.sampleMesh(d,x,z),w=actual(water),g=actual(ground),cur=render.curves(x,z);
  assert.ok(Math.abs(g-s.surface)<.001);
  if(version==='0.04'){
   const expected={coastal:0,lake:2,dry:0,boreal:0,tropical:1,ocean:3,river:1}[name];
   assert.equal(s.waterType,expected);
   if(expected){
    assert.ok(w>g);
    const tolerance=name==='tropical'?.15:.001;
    assert.ok(Math.abs(w-cur-a.fine.stage)<tolerance);
   }
  }
  console.log(version,name,JSON.stringify({
   point:[lat,lon],node:a.node,atlas:a.nearest.type??a.nearest.wet,
   fine:a.fine.type??a.fine.water,fineBed:a.fine.z-a.sea,fineStage:a.fine.stage==null?null:a.fine.stage-a.sea,
   rendered:s.waterType??s.wet,ground:g-cur-a.sea,stage:w==null?null:w-cur-a.sea,
   depth:w==null?null:w-g,groundError:Math.abs(g-s.surface),
   wetStageError:d.waterErrors?.stage,wetBedError:d.waterErrors?.bed
  }));
 }
}
