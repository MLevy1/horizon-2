function diagnose({lat,lon}) {
 const p=pointToTile(lat,lon),t=recall(p)??terrain(p);
 const x=clamp(Math.round(p.x),0,255),y=clamp(Math.round(p.y),0,255),i=y*256+x;
 const [a,b]=tilePoint(t.row,t.col,y,x,t.mode);
 const spacing=sampleSpacing(t), wet=surfaceTileWater(t,i);
 const thermal={}, [warm,cold,ratio,rain,snow]=bioclimate(a,b,t.height[i],thermal);
 const eco=prepareEcoTile(t),o=i*ECO_STRIDE,d=eco.data;
 const cell=objectCell(t,eco,Math.min(254,Math.floor(p.x)),Math.min(254,Math.floor(p.y)));
 const lake=t.lakes[t.lakeIds[i]], surface=sampleSurface(a,b,wet);
 const fmt=(v,digits=1)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'Unavailable';
 const m=(v,digits)=>fmt(v,digits)+' m', pct=v=>fmt(100*v,1)+'%';
 const groups=ECO_GUILDS.slice(1).map(([name],k)=>[name,d[o+ECO_GROUP+k]])
  .filter(([,fraction])=>fraction>=.001).sort((a,b)=>b[1]-a[1]);
 const inventory=['Trees','Shrub clumps','Grass and forb patches','Fern patches','Boulders','Fallen logs'];
 const cohorts=[0,0,0];
 for(const c of objectCohorts(cell))cohorts[c.s]+=c.end-c.start;
 const water=wet===MARINE?'Marine water':wet===INLAND_WATER?lake?'Modeled lake':'Routed inland water':'Dry node';
 return {
  coordinates:[a/deg,b/deg],
  sections:[
   ['Terrain and water',[
    ['Habitat',BIOMES[t.habitat[i]][0]],['Climate biome',BIOMES[t.biome[i]][0]],
    ['Ground elevation above sea level',m((t.height[i]-sea)*1000)],
    ['Underlying regional bed before channel and coastal shaping',m((t.base[i]-sea)*1000)],
    ['Terrain slope',pct(habitatSlope(t,x,y,...spacing))],['Water classification',water],
    ['Water depth',m(t.depth[i],2)],['Regional channel discharge',fmt(t.channelQ[i],2)+' m³/s'],
    ...(lake?[['Modeled lake area',fmt(lake.wetArea/1e6,2)+' km²']]:[]),
    ...(t.coast?.kinds[i]?[['Coastal landform',COAST_NAMES[t.coast.kinds[i]]]]:[])
   ]],
   ['Climate',[
    ['Annual mean air temperature',fmt(thermal.mean)+' °C'],['Warmest / coldest month',fmt(warm)+' / '+fmt(cold)+' °C'],
    ['Annual modeled precipitation',fmt(rain,0)+' mm'],['Adjusted potential evapotranspiration',fmt(thermal.pet,0)+' mm/yr'],
    ['Precipitation / adjusted PET',fmt(ratio,2)],['Share of precipitation falling as snow',pct(snow)]
   ]],
   ['Substrate, snow and volcanism',[
    ['Substrate',MATERIAL_NAMES[t.material[i]]],['Plant-accessible soil',m(t.soil[i],2)],
    ['Weathered mantle',m(t.mantle[i],2)],['Transported deposit',m(t.deposit[i],3)],
    ['Ground moisture index',pct(t.moisture[i])],['Enriched crust component proxy',pct(t.rockIndex[i])],
    ...(wet?[]:[['Snow / ice state',SNOW_STATES[surface.state]]]),
    ...(surface.state===3?[['Candidate ice thickness',m(surface.thickness,0)]]:[]),
    ['Hypothetical volcanic deposit',surface.deposit?VOLCANIC_STATES[surface.deposit.type]+' · '+m(surface.deposit.depth,2):'None at sampled node']
   ]],
   ['Ecology and ground cover',eco.mask[i]?[['Terrestrial ecology','Unavailable at this water or permanent snow/ice node']]:[
    ['Canopy cover',pct(d[o])],['Canopy height',m(d[o+1])],['Modeled stems per hectare',fmt(d[o+2])],
    ['Shrub / herb cover',pct(d[o+3])+' / '+pct(d[o+4])],
    ...groups.map(([name,value])=>[name+' share of stems',pct(value)]),
    ...ECO_GROUND.map(([name],k)=>[name,pct(d[o+8+k])])
   ]],
   ['Modeled object inventory',cell.mask?[['Cell','Population unavailable due to water, ice, or mixed support']]:[
    ['Population cell area',fmt(cell.area/10000,2)+' ha'],
    ...inventory.map((name,k)=>[name,fmt(cell.counts[k],0)]),
    ...(cell.counts[0]?[['Small / medium / large tree cohorts',cohorts.map(count=>fmt(count,0)).join(' / ')]]:[])
   ]]
  ],
  source:'Atlas 0.01 · seed '+SEED+' · regional tile '+t.row+', '+t.col+' · nearest node '+x+', '+y+
   ' · approximately '+spacing.map(v=>Math.round(v)).join(' × ')+' m between nodes. Climate values use the 1° climate model with interpolation and elevation adjustment. Object counts describe the Atlas population cell, independently of the trees drawn in 3D.'
 };
}
