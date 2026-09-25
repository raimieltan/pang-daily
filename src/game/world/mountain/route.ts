import { filletPolyline } from '../layoutTools';
import type { Point, RaceDefinition, Waypoint } from '../../races/Race';

/** Authored memory of upland Iloilo, not surveyed coordinates. Metres, +z north. */
const anchors = [
  [250,0],[480,0],[650,100],[800,70],[940,230],[870,430],[1080,600],
  [1230,540],[1410,740],[1330,920],[1510,1100],[1420,1260],
  [1630,1430],[1850,1500],[1920,1650],[1780,1770],[1560,1660],
  [1450,1710],[1530,1840],[1780,1950],[1930,2120],[1820,2350],
  [1980,2560],[2220,2680],[2280,2910],[2180,3090],
  [2400,3250],[2520,3450],[2380,3600],[2540,3780],[2450,3950],
  [2680,4120],[2880,4160],[3040,4320],[3280,4320],
] as const;
const rounded = filletPolyline(anchors.map(([x,z]) => ({x,z,width:6.2})), 48, 24);
export type RoadSample = Point & { s: number; heading: number; width: number; speed: number };
const flat: (Point & {s:number})[] = [{...rounded[0],y:0,s:0}];
for (let i=1;i<rounded.length;i++) {
  const a=rounded[i-1], b=rounded[i], length=Math.hypot(b.x-a.x,b.z-a.z);
  const steps=Math.ceil(length/5), start=flat[flat.length-1].s;
  for(let j=1;j<=steps;j++) flat.push({x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps,y:0,s:start+length*j/steps});
}
export const ROUTE_LENGTH=flat[flat.length-1].s;
export const SECTORS = [
  {id:'alimodian',name:'Alimodian outskirts',from:0,to:.17},
  {id:'climb',name:'The climb · vegetable terraces',from:.17,to:.36},
  {id:'wall',name:'The wall · red earth elbow',from:.36,to:.51},
  {id:'ridge',name:'Ridge · open valley',from:.51,to:.66},
  {id:'overlook',name:'Pahuway overlook · bamboo shade',from:.66,to:.79},
  {id:'maasin',name:'Maasin descent',from:.79,to:1},
] as const;
export function sectorAt(s:number) { return SECTORS.find(v=>s/ROUTE_LENGTH<v.to) ?? SECTORS[5]; }
const elevations = [[0,0],[.045,0],[.17,24],[.36,113],[.51,209],[.66,257],[.73,263],[.79,252],[.92,184],[1,162]];
export function elevationAt(s:number) {
  const t=s/ROUTE_LENGTH;
  const i=Math.max(1,elevations.findIndex(v=>v[0]>=t));
  const [a,b]=t>=1?[elevations[elevations.length-2],elevations[elevations.length-1]]:[elevations[i-1],elevations[i]];
  const u=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  return a[1]+(b[1]-a[1])*u*u*(3-2*u);
}
export const ROAD: readonly RoadSample[]=flat.map((p,i)=>{
  const a=flat[Math.max(0,i-1)],b=flat[Math.min(flat.length-1,i+1)];
  const before=Math.atan2(p.x-a.x,p.z-a.z),after=Math.atan2(b.x-p.x,b.z-p.z);
  const angle=Math.abs(Math.atan2(Math.sin(after-before),Math.cos(after-before)));
  const radius=i===0||i===flat.length-1||angle<.0001?10000:Math.hypot(b.x-a.x,b.z-a.z)/(2*Math.sin(angle));
  return {...p,y:elevationAt(p.s),heading:Math.atan2(b.x-a.x,b.z-a.z),width:p.s<160?12-(p.s/160)*5.8:6.2,
    speed:Math.min(sectorAt(p.s).id==='alimodian'?17:23,Math.sqrt(radius*3.6))};
});
export function roadAt(s:number,offset=0):RoadSample {
  s=Math.max(0,Math.min(ROUTE_LENGTH,s));
  let lo=0,hi=ROAD.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(ROAD[m].s<s)lo=m;else hi=m;}
  const a=ROAD[lo],b=ROAD[hi],t=(s-a.s)/(b.s-a.s||1);
  const heading=a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*t;
  return {...a,s,x:a.x+(b.x-a.x)*t+Math.cos(heading)*offset,z:a.z+(b.z-a.z)*t-Math.sin(heading)*offset,
    y:a.y+(b.y-a.y)*t,width:a.width+(b.width-a.width)*t,heading,speed:Math.min(a.speed,b.speed)};
}
export function nearestRoad(p: Pick<Point,'x'|'z'>) {
  let best=ROAD[0],distance=Infinity;
  for(const v of ROAD){const d=(v.x-p.x)**2+(v.z-p.z)**2;if(d<distance){distance=d;best=v;}}
  return {sample:best,distance:Math.sqrt(distance)};
}
export const OVERLOOK_S=ROUTE_LENGTH*.715;
/** Shared by the roadside mesh and props, so vegetation sits on its visible ground. */
export function roadsideDrop(width:number,offset:number){
 const shoulder=Math.max(0,Math.abs(offset)-width/2);
 return shoulder<=.55?shoulder/.55*.12:.12+Math.min(1,(shoulder-.55)/(35-width/2-.55))*.53;
}
export const OVERLOOK=roadAt(OVERLOOK_S,17);
/** Right-hand traffic; reverse lanes use the opposite side of the same road. */
export function laneWaypoints(direction:1|-1,offset=1.5): (Waypoint & {s:number})[] {
  const points=ROAD.map(p=>({...roadAt(p.s,offset*direction),speed:p.speed}));
  return direction===1?points:points.reverse();
}
function raceRoute(direction:1|-1):RaceDefinition {
  const startS=direction===1?90:ROUTE_LENGTH-90,finishS=direction===1?ROUTE_LENGTH-65:65;
  const start=roadAt(startS,1.5*direction);
  const gates=[.17,.36,.51,.66,.79].map((t,i)=>({id:SECTORS[i+1].name,center:roadAt(t*ROUTE_LENGTH),halfSize:{x:6,y:4,z:6}}));
  const points=laneWaypoints(direction).filter(p=>direction===1?p.s!>=startS-10:p.s!<=startS+10);
  return {id:direction===1?'alimodian_maasin':'maasin_alimodian',name:direction===1?'Alimodian → Maasin · mountain run':'Maasin → Alimodian · downhill run',mode:'point-to-point',
    start,heading:start.heading+(direction===-1?Math.PI:0),checkpoints:direction===1?gates:gates.reverse(),
    finish:{id:direction===1?'Maasin arrival':'Alimodian arrival',center:roadAt(finishS),halfSize:{x:6,y:4,z:6}},waypoints:points};
}
export const MOUNTAIN_RACES=[raceRoute(1),raceRoute(-1)] as const;
