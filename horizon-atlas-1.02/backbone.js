(function (root) {
 'use strict';

 const Geo = typeof module === 'object' && module.exports ?
  require('../horizon-atlas-1.01/geography.js') : root.AtlasGeography;
 const VERSION = 'atlas-1.02/backbone-1';
 const SOURCE = 'Procedural geographic backbone · Atlas 0.01 continental envelope';
 const provenance = Object.freeze({source: SOURCE, status: 'modeled', smallestStructureKm: 0.55});
 const R = Geo.RADIUS / 1000;
 const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
 function smooth(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
 }
 const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

 function frame(lat, lon) {
  const p = lat*Geo.DEG, l = lon*Geo.DEG;
  const c = Math.cos(p), s = Math.sin(p), x = Math.cos(l), y = Math.sin(l);
  return {up:[c*x,c*y,s], east:[-y,x,0], north:[-s*x,-s*y,c]};
 }

 function position(lat,lon) {
  const p=lat*Geo.DEG, l=lon*Geo.DEG, c=Math.cos(p);
  return [c*Math.cos(l),c*Math.sin(l),Math.sin(p)];
 }

 function offset(origin, east, north) {
  const {up, east:e, north:n} = frame(...origin);
  const km = Math.hypot(east, north);
  const scale = km ? Math.sin(km/R)/km : 0, base = Math.cos(km/R);
  const q = up.map((v,i) => base*v + scale*(east*e[i] + north*n[i]));
  return [Math.atan2(q[2], Math.hypot(q[0], q[1]))/Geo.DEG, Math.atan2(q[1],q[0])/Geo.DEG];
 }

 // Skeleton waypoints follow the dry continental envelope of the pinned world.
 // Widths are kilometres and amplitudes are metres relative to the softened basement.
 const BELTS = [
  ['east-crown','East Crown Range', [[13,52],[14.7,52.2],[16.25,54.25],[18.6,55.2],[20.6,57],[23,57.2]], 92, 2500],
  ['north-arc','Northern Arc', [[39,-9],[44,0],[45,12],[47,24],[45,36]], 220, 2050],
  ['inland-folds','Inland Fold Belt', [[44,43],[46,53],[50,60],[56,58],[62,62],[66,73]], 158, 1600],
  ['boreal-suture','Boreal Suture', [[62,95],[67,88],[70,78],[72,58],[73,40],[77,20]], 180, 1350],
  ['far-east','Far Eastern Highlands', [[51,92],[54,108],[60,123],[67,130],[73,131]], 185, 1450],
  ['western-coast','Western Coastal Range', [[44,-148],[49,-147],[54,-146],[58,-142],[64,-137],[71,-132]], 145, 1650],
  ['western-shield','Western Shield', [[79,-161],[81,177],[83,144],[84,100]], 180, 1150],
  ['eastern-rim','Eastern Rift Shoulder', [[-15,171],[-7,169],[1,166],[7,161],[13,151],[18,143],[25,158]], 115, 1500],
  ['equatorial-spine','Equatorial Spine', [[-12,-74],[-6,-69],[0,-65],[5,-66],[10,-73]], 92, 1440],
  ['meridian-folds','Meridian Fold Belt', [[-35,18],[-28,23],[-21,30],[-16,23],[-10,15],[-4,12]], 122, 1450],
  ['southern-arc','Southern Arc', [[-46,-87],[-53,-85],[-61,-77],[-68,-73],[-75,-71]], 166, 1650],
  ['austral-divide','Austral Divide', [[-78,-145],[-81,-108],[-83,-70],[-84,5],[-83,62]], 155, 1050]
 ];
 const VOLCANOES = [
  ['crown-massif','Crown Volcanic Complex',[17.32,56.87],49,3060],
  ['western-fire','Western Fire Massif',[53.3,-146.4],36,1900],
  ['rift-dome','Rift Dome',[6.1,146.4],37,2450],
  ['meridian-volcano','Meridian Volcano',[-8.2,10.5],52,2210],
  ['southern-caldera','Southern Caldera',[-47,-82.9],30,2100],
  ['seam-shield','Seam Shield',[9.8,179.85],68,1610]
 ];
 const LOWLANDS = [
  ['north-foreland','Northern foreland',[51.6,7],580,570,'basin'],
  ['inner-lowland','Inner lowland',[57,83],470,510,'plain'],
  ['western-lowland','Western lowland',[61,-162],540,500,'plain'],
  ['eastern-basin','Eastern inland basin',[2,132],360,410,'basin'],
  ['meridian-plain','Meridian coastal plain',[-25,17],310,365,'plain'],
  ['southern-foreland','Southern foreland',[-65,-95],530,475,'basin'],
  ['polar-basin','Austral basin',[-83,105],550,480,'basin'],
  ['equatorial-plain','Equatorial plain',[2,-78],320,380,'plain']
 ];

 function random(seed, key) {
  let value = (seed | 0) ^ 2166136261;
  for (const char of VERSION + '/' + key) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0)/4294967296;
 }

 function spline(path) {
  const points = [];
  const unwrapped = path.map((p,i) => [p[0], i ? path[0][1] + Geo.wrap(p[1]-path[0][1]) : p[1]]);
  // Longitude is unwrapped sequentially for polar belts spanning more than 180°.
  for (let i=1;i<path.length;i++) unwrapped[i][1] = unwrapped[i-1][1] + Geo.wrap(path[i][1]-path[i-1][1]);
  for (let i=0;i<path.length-1;i++) {
   const a=unwrapped[Math.max(0,i-1)], b=unwrapped[i], c=unwrapped[i+1], d=unwrapped[Math.min(path.length-1,i+2)];
   const steps = Math.max(1,Math.ceil(Math.hypot(c[0]-b[0], (c[1]-b[1])*Math.cos((b[0]+c[0])*.5*Geo.DEG))*111/85));
   for (let j=0;j<steps;j++) {
    const t=j/steps;
    points.push(b.map((v,k)=>v+.5*t*(c[k]-a[k]+t*(2*a[k]-5*v+4*c[k]-d[k]+t*(3*v-3*c[k]+d[k]-a[k])))));
   }
  }
  points.push(unwrapped.at(-1));
  return points;
 }

 // A coordinate-only Cartesian index. Each primitive is inserted into every
 // intersected cell, with conservative bounds even at poles and the date line.
 const CELL = 210;
 function index() {
  const bins = new Map();
  const bin = v => Math.floor(v*R/CELL);
  const key = (x,y,z) => (x+64)*16384+(y+64)*128+z+64;
  return {
   add(shape,radius) {
    const p = shape.frame.up, margin = radius/R;
    for(let x=bin(p[0]-margin);x<=bin(p[0]+margin);x++)
     for(let y=bin(p[1]-margin);y<=bin(p[1]+margin);y++)
      for(let z=bin(p[2]-margin);z<=bin(p[2]+margin);z++){
       const k=key(x,y,z);
       if(!bins.has(k))bins.set(k,[]);
       bins.get(k).push(shape);
      }
   },
   at: p => bins.get(key(bin(p[0]),bin(p[1]),bin(p[2]))) ?? []
  };
 }

 function createWorld(settings, source) {
  const base = Geo.createWorld(settings, source);
  const identity = JSON.stringify([VERSION, ...JSON.parse(base.identity).slice(1)]);
  const seed = settings.seed;
  const spatial = index(), records = [], grading = [];
  const include = (id, kind, name, level, parentId, type, vertices) => {
   records.push({id, kind, level, parentId, status:'provisional', source:SOURCE, geometry:{type,parts:[vertices]}});
   names.set(id,name);
  };
  const names = new Map();
  const pointShape = (id, kind, point, width, amplitude, phase=0) => {
   spatial.add({id,kind,frame:frame(...point),width,amplitude,phase,c:Math.cos(phase),s:Math.sin(phase)},width*1.6);
  };
  function ribbon(id, kind, a, b, width, amplitude, start=1, end=1, grade=null, section=0) {
   const origin = [(a[0]+b[0])/2,(a[1]+b[1])/2];
   const f = frame(...origin), pa=frame(...a).up, pb=frame(...b).up;
   const ax=dot(pa,f.east)*R, ay=dot(pa,f.north)*R;
   const dx=dot(pb,f.east)*R-ax, dy=dot(pb,f.north)*R-ay;
   const length=Math.hypot(dx,dy);
   if(length<.001)return;
   spatial.add({id,kind,frame:f,width,amplitude,ax,ay,ux:dx/length,uy:dy/length,length,start,end,grade,section},
    (length*.55+width)*1.05);
  }

  function tangent(path,i){
   const before=path[Math.max(0,i-1)], after=path[Math.min(path.length-1,i+1)];
   return Math.atan2(after[0]-before[0],(after[1]-before[1])*Math.cos(path[i][0]*Geo.DEG));
  }

  for (const [id,name,waypoints,width,amplitude] of BELTS) {
   const path = spline(waypoints);
   include(id,'mountain belt',name,2,null,'line',path);
   include(id+'/divide','drainage divide',name+' main divide',5,id,'line',path);
   // Outer folds follow the parent strike for several consecutive segments.
   // Their staggered ends and variable offsets leave elongated intervening valleys.
   for(const side of [-1,1]){
    for(let first=side<0?0:2;first<path.length-3;first+=5){
     const key=id+'/outer-fold/'+side+'/'+first;
     const length=3+Math.floor(random(seed,key+'/length')*3);
     const vertices=path.slice(first,first+length).map((p,k)=>{
      const normal=tangent(path,first+k)+side*Math.PI/2;
      const radius=width*(.3+.26*random(seed,key+'/'+k));
      const q=offset(p,radius*Math.cos(normal),radius*Math.sin(normal));
      return [q[0],p[1]+Geo.wrap(q[1]-p[1])];
     });
     const height=amplitude*(.38+.22*random(seed,key+'/height'));
     const bandWidth=width*(.11+.05*random(seed,key+'/width'));
     include(key,'outer fold',name+' outer fold',6,id,'line',vertices);
     for(let j=0;j<vertices.length-1;j++){
      ribbon(key,'ridge',vertices[j],vertices[j+1],bandWidth,height,
       j===0?0:1,j===vertices.length-2?0:1);
     }
    }
   }
   const strength = path.map((_,i) => (.68+.32*random(seed,id+'/crest/'+i))*
    (.32+.68*smooth(Math.min(i,path.length-1-i)/3)));
   for (let i=0;i<path.length-1;i++) {
    const a=path[i], b=path[i+1];
    ribbon(id,'belt',a,b,width,amplitude,strength[i],strength[i+1]);
    ribbon(id+'/divide','divide',a,b,width*.27,amplitude*.3,strength[i],strength[i+1]);
    const crown=a;
    const angle=Math.atan2((b[0]-a[0]),(b[1]-a[1])*Math.cos(crown[0]*Geo.DEG));
    const spur=offset(crown,Math.cos(angle+.94)*8,Math.sin(angle+.94)*8);
    spur[1]=crown[1]+Geo.wrap(spur[1]-crown[1]);
    const key=id+'/crest-rib/'+i;
    include(key,'crest rib',name+' crest rib',10,id+'/divide','line',[crown,spur]);
    ribbon(key,'rib',crown,spur,1.8,220,.9,0);
    if(i%2!==1)continue;
    const origin=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const east=(b[1]-a[1])*Math.cos(origin[0]*Geo.DEG), north=b[0]-a[0];
    const bearing=Math.atan2(north,east);
    for (const side of [-1,1]) {
     const key=id+'/'+i+'/'+(side<0?'left':'right');
     const angle=bearing+side*(.65+.7*random(seed,key));
     const along=(d,bend=0)=>offset(origin,Math.cos(angle+bend)*d,Math.sin(angle+bend)*d);
     const align=p=>[p[0],origin[1]+Geo.wrap(p[1]-origin[1])];
     const mid=align(along(width*.43)), toe=align(along(width*.96,.26*side));
     include(key,'structural ridge',name+' spur',7,id+'/divide','line',[origin,mid,toe]);
     ribbon(key,'ridge',origin,mid,11,610,.08,1);
     ribbon(key,'ridge',mid,toe,9,610,1,0);
     const head=align(along(width*.19,.55*side)), bend=align(along(width*.54,.45*side));
     const outlet=align(along(width*1.27,.38*side));
     include(key+'/outlet','drainage corridor',name+' transverse valley',8,id+'/divide','line',[head,bend,outlet]);
     const grade={path:[head,bend,outlet],profile:null};
     grading.push(grade);
     ribbon(key+'/outlet','valley',head,bend,9,-650,0,1,grade,0);
     ribbon(key+'/outlet','valley',bend,outlet,12,-650,1,0,grade,1);
     const tributary=align(along(width*.34,.81*side));
     include(key+'/outlet/tributary','tributary corridor',name+' tributary',11,key+'/outlet','line',[tributary,bend]);
     ribbon(key+'/outlet/tributary','tributary',tributary,bend,1.4,-205,0,1);
    }
   }
  }

  for (const [id,name,point,width,amplitude] of VOLCANOES) {
   const phase=random(seed,id)*2*Math.PI;
   include(id,'volcanic complex',name,4,null,'point',[point]);
   pointShape(id,'volcano',point,width,amplitude,phase);
   for(let i=0;i<6;i++){
    const key=id+'/ravine/'+i;
    const angle=phase+(i+.32*random(seed,key))*Math.PI/3;
    const radial=(r,b)=>offset(point,Math.cos(angle+b)*width*r,Math.sin(angle+b)*width*r);
    const align=q=>[q[0],point[1]+Geo.wrap(q[1]-point[1])];
    const a=align(radial(.16,0)), b=align(radial(.43,.14)), c=align(radial(.82,-.1));
    const cut=220+280*random(seed,key+'/depth');
    include(key,'volcanic ravine',name+' ravine',9,id,'line',[a,b,c]);
    ribbon(key,'valley',a,b,width*.045,-cut,0,1);
    ribbon(key,'valley',b,c,width*.06,-cut,1,0);
    const fork=align(radial(.28,.45));
    include(key+'/fork','ravine tributary',name+' ravine tributary',11,key,'line',[fork,b]);
    ribbon(key+'/fork','tributary',fork,b,width*.023,-cut*.43,0,1);
   }
   for(let i=0;i<3;i++){
    const key=id+'/vent/'+i, angle=phase+i*2*Math.PI/3;
    const distance=width*(.13+.21*random(seed,key));
    const vent=offset(point,Math.cos(angle)*distance,Math.sin(angle)*distance);
    include(key,'volcanic vent',name+' subsidiary vent',8,id,'point',[vent]);
    pointShape(key,'vent',vent,width*(.09+.06*random(seed,key+'/width')),270+360*random(seed,key+'/height'),angle);
   }
  }

  for(const [id,name,point,width,amplitude,kind] of LOWLANDS){
   include(id,kind,name,3,null,'point',[point]);
   const phase=random(seed,id)*2*Math.PI;
   pointShape(id,kind,point,width,amplitude,phase);
   if(kind==='basin'){
    let lowest=Infinity, outlet, angle;
    for(let i=0;i<16;i++){
     const bearing=phase+2*Math.PI*i/16;
     const p=offset(point,Math.cos(bearing)*width*.92,Math.sin(bearing)*width*.92);
     const z=base.elevation(...p);
     if(z<lowest){lowest=z;outlet=p;angle=bearing;}
    }
    const at=(r,b)=>offset(point,Math.cos(b)*r,Math.sin(b)*r);
    const align=p=>[p[0],point[1]+Geo.wrap(p[1]-point[1])];
    const bend=align(at(width*.41,angle+.23)), end=align(outlet);
    const key=id+'/spillway', grade={path:[point,bend,end],profile:null};
    grading.push(grade);
    include(key,'basin outlet constraint',name+' spillway',7,id,'line',grade.path);
    ribbon(key,'valley',point,bend,17,-210,.2,1,grade,0);
    ribbon(key,'valley',bend,end,22,-210,1,0,grade,1);
   }
  }
  const catalog=Geo.featureCatalog(identity,records);

  function evaluate(lat,lon,footprintKm, applyGrade=true) {
   const z=base.elevation(lat,lon);
   if(z<=0)return z;
   const p=position(lat,lon);
   const damping=smooth(z/430);
   const basement=z-.62*Math.max(z-1350,0);
   let belt=0, divide=0, ridge=0, valley=0, volcanic=0, vents=0, lowland=0, fine=0, constraints=null;
   for(const item of spatial.at(p)){
    const {frame:f,kind,width,amplitude}=item;
    if(dot(p,f.up)<.975)continue;
    const x=dot(p,f.east)*R, y=dot(p,f.north)*R;
    if(item.length){
     const dx=x-item.ax, dy=y-item.ay;
     const along=dx*item.ux+dy*item.uy;
     const t=clamp(along/item.length,0,1);
     const across=dx*item.uy-dy*item.ux;
     const distance=Math.hypot(across,along-t*item.length);
     if(distance>=width)continue;
     // Suppress unresolved bands continuously as the render footprint widens.
     const band=1-smooth((footprintKm/width-.35)/1.55);
     const strength=item.start+(item.end-item.start)*t;
     const value=amplitude*strength*(1-smooth(distance/width));
     if(kind==='belt')belt=Math.max(belt,value);
     else if(kind==='divide')divide=Math.max(divide,value*(.35+.65*band));
     else if(kind==='ridge'||kind==='rib')ridge=Math.max(ridge,value*band);
     else if(kind==='valley'){
      valley=Math.min(valley,value*band);
      if(applyGrade&&item.grade&&distance<3.2){
       const chainage=(item.section+t)*8, i=Math.min(15,Math.floor(chainage)), fraction=chainage-i;
       const profile=item.grade.profile;
       const target=profile[i]*(1-fraction)+profile[i+1]*fraction;
       const influence=(1-smooth(distance/3.2))*smooth(chainage/2)*smooth((16-chainage)/2)*band;
       if(influence>0)(constraints??=[]).push([target,influence]);
      }
     } else fine=Math.min(fine,value*band);
    } else {
     const radius=Math.hypot(x,y)/width;
     if(radius>=1.35)continue;
     if(kind==='volcano'){
      const angle=Math.atan2(y,x)-item.phase;
      const r=radius/(1+.16*Math.cos(2*angle)+.09*Math.cos(3*angle+.9));
      const apron=(1-smooth(r))*amplitude*.40;
      const core=(1-smooth(r/.51))*amplitude*.60;
      const gully=155*smooth(r/.16)*(1-smooth(r))*(.5+.5*Math.cos(angle*7+.9*r));
      const gullies=1-smooth((footprintKm-1.1)/4);
      volcanic=Math.max(volcanic,apron+core-gully*gullies);
      const crater=1-smooth(radius/.019);
      fine=Math.min(fine,-185*crater*(1-smooth(footprintKm/.7)));
     } else if(kind==='vent'){
      vents+=amplitude*(1-smooth(radius))*(1-smooth((footprintKm-width*.55)/width));
     } else {
      const floor = kind==='plain' ? Math.min(amplitude+basement*.20,basement*.68) : Math.min(amplitude,basement*.56);
      const u=x*item.c+y*item.s;
      const v=y*item.c-x*item.s;
      const shape=Math.hypot(u/(width*1.28),v/(width*.67));
      lowland=Math.max(lowland,floor*(1-smooth(shape)));
     }
    }
   }
    volcanic+=vents;
   // Volcanic loading can sit beside or overlap a raised belt. Blend the lower
   // contribution into the foundation instead of stacking two entire summits.
   const orogen=belt+divide;
   const uplift=Math.max(orogen,volcanic)+.26*Math.min(orogen,volcanic);
   const incision=Math.max(valley+fine,-uplift*.72-140);
   const terrain=basement+damping*(uplift+ridge+incision-lowland);
   let cut=0;
   if(constraints)for(const [target,influence] of constraints)
    cut=Math.max(cut,influence*clamp(terrain-target,0,320));
   return Math.max(z*.025,terrain-cut*damping);
  }

  // Fix an outlet-directed grade before any viewport can request terrain.
  // Only a bounded incision is allowed, so adverse inherited terrain survives
  // as an unresolved barrier for a future watershed solver to reconcile.
  for(const grade of grading){
   let ceiling=Infinity;
   grade.profile=Array.from({length:17},(_,i)=>{
    const j=Math.min(1,Math.floor(i/8)), t=i/8-j;
    const a=grade.path[j], b=grade.path[j+1];
    const [lat,lon]=Geo.coordinate(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);
    ceiling=Math.min(ceiling-.8,evaluate(lat,lon,0,false));
    return ceiling;
   });
  }

  const elevation = (lat,lon) => evaluate(...Geo.coordinate(lat,lon),0);
  function displayElevation(lat,lon,footprintKm) {
   return evaluate(...Geo.coordinate(lat,lon),Math.max(0,footprintKm));
  }
  function featuresAt(lat,lon) {
   const p=position(...Geo.coordinate(lat,lon)), ids=new Set();
   for(const item of spatial.at(p)){
    const {frame:f,width}=item;
    if(dot(p,f.up)<.975)continue;
    const x=dot(p,f.east)*R, y=dot(p,f.north)*R;
    const along=item.length ? clamp((x-item.ax)*item.ux+(y-item.ay)*item.uy,0,item.length) : 0;
    const distance=item.length ? Math.hypot(x-item.ax-along*item.ux,y-item.ay-along*item.uy) : Math.hypot(x,y);
    if(distance<=width)ids.add(item.id);
   }
   return [...ids].sort().map(id=>catalog.get(id));
  }
  function sample(lat,lon,level) {
   const point=Geo.coordinate(lat,lon);
   return {identity,point,address:Geo.locate(...point,level),elevationM:elevation(...point),provenance,features:featuresAt(...point)};
  }
  function nodes(address, segments=16) {
   if(!Number.isInteger(segments)||segments<1||segments>64)throw RangeError('Invalid node grid');
   const {north,south,west,east}=Geo.bounds(address), values=[];
   for(let y=0;y<=segments;y++)for(let x=0;x<=segments;x++){
    values.push(elevation(y===segments?south:north+(south-north)*y/segments,
     x===segments?east:west+(east-west)*x/segments));
   }
   return {segments,values,provenance};
  }
  function summarize(address, depth=2) {
   if(!Number.isInteger(depth)||depth<0||depth>6)throw RangeError('Invalid summary depth');
   const box=Geo.bounds(address), n=2**depth;
   let min=Infinity,max=-Infinity,weight=0,integral=0;
   for(let y=0;y<n;y++){
    const north=box.north-(box.north-box.south)*y/n;
    const south=box.north-(box.north-box.south)*(y+1)/n;
    const area=Geo.RADIUS**2*(box.east-box.west)*Geo.DEG/n*
     (Math.sin(north*Geo.DEG)-Math.sin(south*Geo.DEG));
    for(let x=0;x<n;x++){
     const z=elevation((north+south)/2,box.west+(box.east-box.west)*(x+.5)/n);
     weight+=area;integral+=z*area;min=Math.min(min,z);max=Math.max(max,z);
    }
   }
   return {address,identity,featureId:'surface',metric:'elevation',unit:'m',weightUnit:'m²',weight,integral,min,max,mean:integral/weight};
  }
  return Object.freeze({identity,elevation,displayElevation,sample,featuresAt,catalog,nodes,summarize,
   nameOf:id=>names.get(id)});
 }

 const SITES = Object.freeze({
  'backbone-massif':Object.freeze({name:'Crown Volcanic Complex',point:Object.freeze([17.32,56.87])}),
  'backbone-range':Object.freeze({name:'East Crown Range',point:Object.freeze([16.25,54.25])}),
  'backbone-seam':Object.freeze({name:'Seam Shield',point:Object.freeze([9.8,179.85])})
 });
 const api = Object.freeze({VERSION,createWorld,SITES,provenance});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.AtlasBackbone=api;
})(globalThis);
