import type { Point, Waypoint } from '../races/Race';
/** Kinematic civilian traffic follower. Race opponents use VehicleController instead. */
export class TrafficFollower {
 position:Point;speed=0;heading=0;segment=1;
 constructor(readonly points:readonly Waypoint[],readonly tuning={speedScale:1,acceleration:2,braking:5}){
  if(points.length<2)throw new Error('Traffic route requires two points');
  this.position={...points[0]};this.heading=Math.atan2(points[1].x-points[0].x,points[1].z-points[0].z);
 }
 reset(){this.position={...this.points[0]};this.speed=0;this.segment=1;this.heading=Math.atan2(this.points[1].x-this.points[0].x,this.points[1].z-this.points[0].z);}
 get departed(){return this.segment>=this.points.length;}
 update(dt:number){
  const target=this.points[this.segment];if(!target){this.speed=0;return;}
  const distance=Math.hypot(target.x-this.position.x,target.y-this.position.y,target.z-this.position.z);
  const limit=Math.min(this.points[this.segment-1].speed*this.tuning.speedScale,
   Math.sqrt((target.speed*this.tuning.speedScale)**2+2*this.tuning.braking*distance));
  this.speed+=Math.max(-this.tuning.braking*dt,Math.min(this.tuning.acceleration*dt,limit-this.speed));
  let remaining=this.speed*dt;
  while(this.segment<this.points.length){
   const p=this.points[this.segment],d=Math.hypot(p.x-this.position.x,p.y-this.position.y,p.z-this.position.z);
   this.heading=Math.atan2(p.x-this.position.x,p.z-this.position.z);
   if(remaining<d){for(const axis of ['x','y','z'] as const)this.position[axis]+=(p[axis]-this.position[axis])*remaining/d;break;}
   this.position={...p};remaining-=d;this.segment++;
  }
 }
}
export const TRAFFIC_TYPES = [
 {id:'motorcycle',width:.7,length:1.9,speed:15}, {id:'tricycle',width:1.7,length:2.5,speed:10},
 {id:'car',width:1.7,length:4.33,speed:12}, {id:'car',width:1.7,length:4.33,speed:16},
 {id:'car',width:1.7,length:4.33,speed:13}, {id:'car',width:1.7,length:4.33,speed:10},
] as const;
export type RoadUser=Point & {speed:number;heading:number};
export type TrafficActor={follower:TrafficFollower;kind:typeof TRAFFIC_TYPES[number];direction:1|-1;active:boolean;stalledSeconds:number};
// Match the renderer: recycling must happen beyond the distance at which cars are drawn.
export const TRAFFIC_DRAW_DISTANCE=650;
export const SPAWN_CLEARANCE=TRAFFIC_DRAW_DISTANCE;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
/** Generic bidirectional lane flow. No map coordinates, teleports only outside the safety radius. */
export class TrafficFlow {
 readonly actors:TrafficActor[]=[];
 constructor(lanes:readonly (readonly Waypoint[])[],player:Point,count=18){
  for(let i=0;i<count;i++){
   const direction=i%2===0?1:-1,kind=TRAFFIC_TYPES[i%TRAFFIC_TYPES.length],lane=lanes[i%lanes.length];
   const points=lane.map(p=>({...p,speed:Math.min(kind.speed,p.speed*.8)}));
   const follower=new TrafficFollower(points);
   const index=Math.floor((i+.5)/count*(points.length-2));
   follower.position={...points[index]};follower.segment=index+1;follower.speed=kind.speed*.7;
   follower.heading=Math.atan2(points[index+1].x-points[index].x,points[index+1].z-points[index].z);
   // Initial population is placed before the scene is shown. Later spawns stay out of sight.
   this.actors.push({follower,kind,direction,active:distance(follower.position,player)>20,stalledSeconds:0});
  }
 }
 suspend(){for(const actor of this.actors){actor.active=false;actor.follower.speed=0;}}
 update(dt:number,player:RoadUser){
  if(!Number.isFinite(dt)||dt<=0)return;
  let remaining=Math.min(dt,.25);
  while(remaining>1e-8){
   const step=Math.min(remaining,1/60);
   this.step(step,player);
   remaining-=step;
  }
 }
 private step(dt:number,player:RoadUser){
  for(const actor of this.actors){
   const f=actor.follower;
   const clear=(at:Point)=>distance(at,player)>SPAWN_CLEARANCE&&this.actors.every(other=>other===actor||!other.active||distance(at,other.follower.position)>20);
   if(f.departed){
    if(distance(f.points[0],f.points[f.points.length-1])<.01){
     // A stalled loop can only restart when its new position is also out of sight.
     if(!actor.active&&!clear(f.points[0]))continue;
     const speed=f.speed;f.reset();f.speed=speed;
    }else{
     f.speed=0;
     if(distance(f.position,player)>SPAWN_CLEARANCE)actor.active=false;
     if(!actor.active&&clear(f.points[0])){f.reset();actor.active=true;actor.stalledSeconds=0;}
     continue;
    }
   }
   if(!actor.active){if(clear(f.position))actor.active=true;else continue;}
   let limit=Infinity;
   const users:RoadUser[]=[player,...this.actors.filter(a=>a!==actor&&a.active).map(a=>({...a.follower.position,speed:a.follower.speed,heading:a.follower.heading}))];
   for(const p of users){
    if(Math.abs(p.y-f.position.y)>3)continue;
    const dx=p.x-f.position.x,dz=p.z-f.position.z;
    const ahead=dx*Math.sin(f.heading)+dz*Math.cos(f.heading),lateral=Math.abs(dx*Math.cos(f.heading)-dz*Math.sin(f.heading));
    if(ahead>0&&ahead<65&&lateral<(actor.kind.width/2+1.05))limit=Math.min(limit,Math.sqrt(Math.max(0,2*4*(ahead-actor.kind.length/2-5))));
   }
   // The shared follower accelerates at 2 m/s²; clamp both sides of its update to honour a stop.
   f.speed=Math.min(f.speed,limit);
   const before={...f.position};
   if(limit>=.1){f.update(dt);f.speed=Math.min(f.speed,limit);}
   actor.stalledSeconds=distance(before,f.position)<.1*dt?actor.stalledSeconds+dt:0;
   if(actor.stalledSeconds>20&&distance(f.position,player)>SPAWN_CLEARANCE){
    actor.active=false;f.speed=0;f.segment=f.points.length;
   }
  }
 }
}
