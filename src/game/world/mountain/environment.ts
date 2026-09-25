import type { BlockData, ChunkData, LampData, PropPlacement, WireSpan, ZoneData } from '../WorldLayout';
import type { PropId } from '../props/propKit';
import { roadAt, roadsideDrop, ROAD, ROUTE_LENGTH, OVERLOOK_S, OVERLOOK, SECTORS, sectorAt } from './route';
import { pixelText } from '../pixelFont';

export const MOUNTAIN_LAMPS:LampData[]=[];
export const MOUNTAIN_ZONES:ZoneData[]=[];
export const MOUNTAIN_CHUNKS:ChunkData[]=[];
/** Share actual house aprons with ambient residents, so population follows authored settlements. */
export const MOUNTAIN_HOMES: { s: number; side: number; x: number; y: number; z: number; heading: number }[] = [];
const N=Math.ceil(ROUTE_LENGTH/220);
let lastPole:{x:number;y:number;z:number;s:number;heading:number}|null=null;
for(let c=0;c<N;c++) {
 const from=c*220,to=Math.min(ROUTE_LENGTH,(c+1)*220);
 const props:PropPlacement[]=[],blocks:BlockData[]=[],lamps:LampData[]=[],wires:WireSpan[]=[],zones:ZoneData[]=[];
 const add=(prop:PropId,s:number,offset:number,scale=1,turn=0)=>{
  const p=roadAt(s,offset);
  const onApron=Math.abs(s-OVERLOOK_S)<20&&offset>=6&&offset<=30;
  p.y=onApron?OVERLOOK.y:p.y-roadsideDrop(p.width,offset);
  props.push({prop,at:[p.x,p.z],y:p.y,rotDeg:p.heading*180/Math.PI+turn,scale});return p;
 };
 // Continuous roadside fixtures, with poles outside the driving surface.
 for(let s=Math.ceil(from/30)*30;s<to;s+=30){
  const road=roadAt(s), offset=road.width/2+1.8;
  const p=add('street_lamp',s,offset,1,-90);
  const light=roadAt(s,offset-2.2);
  lamps.push({id:`road-lamp-${s}`,at:[light.x,p.y+6.6,light.z],profile:'sodium'});
 }
 // Deliberately sparser settlements with increasing height, then houses return on descent.
 for(let s=from+24;s<to;s+=38) {
  const sector=sectorAt(s).id, i=Math.floor(s/38),side=i%2?1:-1;
  const settled=sector==='alimodian'||sector==='maasin'||Math.abs(s-OVERLOOK_S)<70;
  if(settled&&i%2===0||sector==='climb'&&i%7===0) {
   const p=add(i%3?'rural_house':'timber_house',s,side*11,1,side>0?-90:90);
   // Level house apron and narrow driveway entering directly onto the road.
   const d=roadAt(s,side*7.2);
   MOUNTAIN_HOMES.push({ s, side, x: d.x, y: d.y - .005, z: d.z, heading: d.heading });
   blocks.push({center:[d.x,d.y-.18,d.z],size:[9,.35,5],rotDeg:d.heading*180/Math.PI,color:'#887d65',collide:true});
   add('motorcycle_parked',s+4,side*7,1,55);add('water_tank',s-4,side*12);
   add('dog_sleeping',s-3,side*6.2);
   if(i%4===0)add('sari_store',s+14,side*10,1,side>0?-90:90);
   lamps.push({id:`house-${c}-${i}`,at:[p.x,p.y+2.6,p.z],profile:'porch',strength:.65});
   // Clothesline: two slim posts and a sagging line, a few drying garments.
   const a=roadAt(s-3,side*15),b=roadAt(s+3,side*15);
   wires.push({from:[a.x,a.y+2,a.z],to:[b.x,b.y+2,b.z],sag:.15});
   for(let j=0;j<3;j++){const q=roadAt(s-1+j,side*15);blocks.push({center:[q.x,q.y+1.5,q.z],size:[.65,.8,.05],color:['#aea385','#6d8588','#af7d65'][j]});}
  }
  // Low foliage defines road edge; bamboo becomes dominant toward Maasin.
  for(const side of [-1,1]) {
   if(!(sector==='ridge'&&side===1)&&Math.abs(s-OVERLOOK_S)>55) {
    add(i%5===0?'coconut_palm':sector==='overlook'||sector==='maasin'||i%3===0?'bamboo_cluster':'tree_mango',s,side*(17+i%6),.85+(i%4)*.17);
    add(i%2?'banana_plant':'bush',s+13,side*7.5,.8);
   }
  }
  if(sector==='climb'&&i%3===0||sector==='maasin'&&i%4===0) {
   for(let row=0;row<5;row++){const q=roadAt(s+row*3,20);blocks.push({center:[q.x,q.y-.35,q.z],size:[18,.25,1.3],rotDeg:q.heading*180/Math.PI,color:row%2?'#596f37':'#796345'});}
  }
 }
 // Field-edge groves: irregular clusters with gaps, rather than evenly spaced trees.
 // Keep roots on the road-following ground shelf and away from homes and driveways.
 for(let s=from+35;s<to;s+=82)for(const side of [-1,1]){
  if(Math.abs(s-OVERLOOK_S)<65)continue;
  const sector=sectorAt(s).id,group=Math.floor(s/82);
  if(sector==='ridge'&&side===1&&group%3!==0)continue;
  for(let j=0;j<4;j++){
   const along=Math.min(to-.5,Math.max(from,s+Math.sin(group*2.7+j*3.1)*15));
   const offset=side*(23+j*2.6+Math.sin(group+j)*1.3);
   const species:PropId=sector==='maasin'||sector==='overlook'
    ?(j===0?'tree_mango':'bamboo_cluster')
    :(j===0&&group%2===0?'coconut_palm':j===3?'bamboo_cluster':'tree_mango');
   add(species,along,offset,.85+((group+j*3)%5)*.14,group*29+j*67);
   if(j%2===0)add('bush',along+2,offset-side*1.5,.9+(j*.15));
  }
 }
 for(let s=from+3;s<to;s+=3)for(const side of [-1,1]){
  if(Math.abs(s-OVERLOOK_S)<24&&side===1)continue;
  add('roadside_grass',s,side*(4.7+Math.sin(s)*.4),.65+(Math.floor(s)%4)*.13);
 }
 // Irregular spacing, no poles on the exposed ridge. Three sagging conductors.
 for(let s=from+8;s<to;s+=48+(c%3)*9) {
  if(sectorAt(s).id==='ridge'){lastPole=null;continue;}
  const side=c%7===0?-1:1,p=add(c%5===0?'utility_pole_transformer':'utility_pole',s,side*5.8);
  if(lastPole&&s-lastPole.s<95)for(const delta of [-.8,0,.8])wires.push({from:[lastPole.x+Math.cos(lastPole.heading)*delta,lastPole.y+8.6,lastPole.z-Math.sin(lastPole.heading)*delta],to:[p.x+Math.cos(p.heading)*delta,p.y+8.6,p.z-Math.sin(p.heading)*delta],sag:1.1});
  lastPole={...p,s};
 }
 // Join exact sampled endpoints so drains and rails follow bends and grades.
 for(let s=from;s<to;s+=4) {
  const next=Math.min(s+4,to),sector=sectorAt(s).id;
  const beam=(offset:number,height:number,width:number,thickness:number,color:string,collide=false)=>{
   const a=roadAt(s,offset),b=roadAt(next,offset);
   const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
   blocks.push({center:[(a.x+b.x)/2,(a.y+b.y)/2+height,(a.z+b.z)/2],
    size:[width,thickness,Math.hypot(dx,dy,dz)+.08],rotDeg:Math.atan2(dx,dz)*180/Math.PI,
    pitchDeg:-Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI,color,collide});
  };
  if(s>160)beam(-3.8,-.12,.6,.3,'#53594e');
  if(sector==='wall')beam(-4.5,1.35,.6,3,'#77786d',true);
  if(sector==='ridge'||sector==='wall'){
   beam(3.9,.72,.16,.32,'#a4a79a',true);
   const p=roadAt(s,3.9);
   blocks.push({center:[p.x,p.y+.28,p.z],size:[.18,.9,.18],color:'#85857a'});
  }
 }
 if(from<=OVERLOOK_S&&to>OVERLOOK_S) {
  const p=OVERLOOK;
  blocks.push({center:[p.x,p.y-.35,p.z],size:[26,.7,46],rotDeg:p.heading*180/Math.PI,color:'#938b76',collide:true});
  add('sari_store',OVERLOOK_S+8,22,1.3,180);
  add('utility_pole_transformer',OVERLOOK_S-16,30);
  for(const [ds,off] of [[-6,20],[0,24],[5,17]]){add('plastic_table',OVERLOOK_S+ds,off);add('plastic_chair',OVERLOOK_S+ds+1.2,off,1,180);add('plastic_chair',OVERLOOK_S+ds-1.2,off);}
  for(let j=0;j<3;j++)add('motorcycle_parked',OVERLOOK_S-11+j*2,12,1,80);
  add('tricycle_parked',OVERLOOK_S-13,24,1,80);
  add('store_rack',OVERLOOK_S+9,18);add('ice_cooler',OVERLOOK_S+7,18);
  lamps.push({id:'overlook-store',at:[p.x,p.y+3,p.z+8],profile:'fluorescent'},{id:'overlook-lamp',at:[p.x+10,p.y+5,p.z],profile:'sodium'});
  const zone={id:'pahuway-meet',kind:'interact' as const,locationId:'overlook' as const,rect:{minX:p.x-6,maxX:p.x+6,minZ:p.z-8,maxZ:p.z+8},interaction:{action:'hang_out' as const,label:'Take a break at Pahuway overlook'}};
  zones.push(zone);MOUNTAIN_ZONES.push(zone);
  sign(blocks,OVERLOOK_S,6,'PAHUWAY',true);sign(blocks,OVERLOOK_S+15,8,'OVERLOOK',true);
 }
 for(const sector of SECTORS)if(sector.from*ROUTE_LENGTH>=from&&sector.from*ROUTE_LENGTH<to)sign(blocks,Math.max(25,sector.from*ROUTE_LENGTH),-6,sector.id==='alimodian'?'ALIMODIAN':sector.id==='maasin'?'MAASIN':sector.id==='wall'?'SLOW':sector.id==='ridge'?'RIDGE':'PAHUWAY');
 const samples=ROAD.filter(p=>p.s>=from&&p.s<=to);
 const rect={minX:Math.min(...samples.map(p=>p.x))-45,maxX:Math.max(...samples.map(p=>p.x))+45,minZ:Math.min(...samples.map(p=>p.z))-45,maxZ:Math.max(...samples.map(p=>p.z))+45};
 MOUNTAIN_LAMPS.push(...lamps);
 MOUNTAIN_CHUNKS.push({id:`upland-${c}`,rect,roads:[],surfaces:[],blocks,props,lamps,wires,zones});
}
function sign(blocks:BlockData[],s:number,offset:number,label:string,glow=false){
 const p=roadAt(s,offset),theta=p.heading,scale=.085,text=pixelText(label),width=text.columns*scale+.4;
 blocks.push({center:[p.x,p.y+2.7,p.z],size:[width,1,.12],rotDeg:theta*180/Math.PI,color:'#294839'});
 blocks.push({center:[p.x,p.y+1.3,p.z],size:[.12,2.6,.12],color:'#9b9b89',collide:true});
 for(const r of text.runs){const x=(r.col+r.length/2-text.columns/2)*scale;blocks.push({center:[p.x+Math.cos(theta)*x+Math.sin(theta)*.08,p.y+3-r.row*scale,p.z-Math.sin(theta)*x+Math.cos(theta)*.08],size:[r.length*scale,scale,.035],rotDeg:theta*180/Math.PI,color:'#f0dfaa',glow});}
}
