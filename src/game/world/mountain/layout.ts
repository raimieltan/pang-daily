import { HUB_LAYOUT } from '../hub/hubLayout';
import type { LocationData, WorldLayout } from '../WorldLayout';
import { ROAD, roadAt, ROUTE_LENGTH, OVERLOOK, OVERLOOK_S } from './route';
const locations:LocationData[]=[['alimodian','Alimodian outskirts',90],['maasin','Maasin arrival',ROUTE_LENGTH-90],['overlook','Pahuway overlook',OVERLOOK_S]].map(([id,name,s])=>{
 const p=id==='overlook'?OVERLOOK:roadAt(Number(s),id==='maasin'?-1.5:1.5);
 const pose={x:p.x,y:p.y,z:p.z,headingDeg:p.heading*180/Math.PI+(id==='maasin'?180:0)};
 return {id:id as LocationData['id'],name:String(name),chunk:'uplands',area:{minX:p.x-35,maxX:p.x+35,minZ:p.z-35,maxZ:p.z+35},spawn:pose,returnPoint:pose};
});
export const CONNECTED_LAYOUT:WorldLayout={...HUB_LAYOUT,bounds:{minX:-160,minZ:-250,maxX:3750,maxZ:4750},locations:[...HUB_LAYOUT.locations,...locations]};
/** Road recovery points at every 100 metres avoid returning to town after a distant fall. */
export function mountainRecovery(x:number,z:number){
 let best=ROAD[0],distance=Infinity;
 for(const p of ROAD){const d=(p.x-x)**2+(p.z-z)**2;if(d<distance){distance=d;best=p;}}
 return roadAt(best.s,1.5);
}
