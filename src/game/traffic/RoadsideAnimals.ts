import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { GameSystem } from '../engine/types';
import type { WorldKit } from '../world/WorldChunk';
import type { RoadUser } from './TrafficFlow';
import type { RoadSample } from '../world/mountain/route';
import { roadsideDrop } from '../world/mountain/route';
/** Fixed authored shoulder homes. Vehicles must have at least six seconds to react. */
export function safeToCross(at:{x:number;z:number},vehicles:readonly RoadUser[]){
 return vehicles.every(v=>Math.hypot(v.x-at.x,v.z-at.z)>Math.max(90,Math.abs(v.speed)*6+18));
}
export type AnimalSite={s:number;kind:'dog'|'cat';side:1|-1;crosses:boolean};
export class RoadsideAnimals implements GameSystem {
 readonly name='roadsideAnimals';
 private actors:{root:TransformNode;site:AnimalSite;offset:number;target:number;wait:number}[]=[];
 constructor(scene:Scene,kit:WorldKit,sites:readonly AnimalSite[],private sample:(s:number,offset:number)=>RoadSample,private users:()=>RoadUser[]){
  for(const site of sites){
   const root=new TransformNode(`roadside-${site.kind}`,scene);
   for(const template of Object.values(kit.props.template(site.kind==='dog'?'dog_sleeping':'cat_roadside'))){const mesh=template.clone('animal',root);mesh.setEnabled(true);}
   this.actors.push({root,site,offset:site.side*4.8,target:site.side*4.8,wait:18+site.s%23});
  }
  this.update(0);
 }
 update(dt:number){
  const users=this.users();
  for(const a of this.actors){
   const p=this.sample(a.site.s,0);a.wait-=dt;
   const near=users.some(v=>Math.hypot(v.x-p.x,v.z-p.z)<45);
   const moving=Math.abs(a.target-a.offset)>.05;
   if(!moving&&a.wait<0&&a.site.crosses&&safeToCross(p,users)){a.target=-Math.sign(a.offset)*4.8;a.wait=65;}
   else if(!moving&&near){a.target=Math.sign(a.offset)*5.5;}
   const speed=a.site.kind==='cat'?2.7:1.8;
   a.offset+=Math.max(-speed*dt,Math.min(speed*dt,a.target-a.offset));
   const q=this.sample(a.site.s,a.offset);
   const drop=roadsideDrop(q.width,a.offset);
   a.root.position.set(q.x,q.y-drop,q.z);
   if(Math.abs(a.target-a.offset)>.05)a.root.rotation.y=q.heading+(a.target>a.offset?Math.PI/2:-Math.PI/2);
  }
 }
 dispose(){this.actors.forEach(a=>a.root.dispose());}
}
