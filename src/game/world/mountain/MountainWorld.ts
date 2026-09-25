import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsShapeMesh } from '@babylonjs/core/Physics/v2/physicsShape';
import type { Scene } from '@babylonjs/core/scene';
import type { GameSystem } from '../../engine/types';
import { CollisionGroup } from '../../physics/PhysicsWorld';
import { buildChunk, type WorldKit } from '../WorldChunk';
import { roadAt, nearestRoad, ROUTE_LENGTH, OVERLOOK, OVERLOOK_S, sectorAt } from './route';
import { MOUNTAIN_CHUNKS } from './environment';

/** Indexed, vertex-coloured terrain/road batches; one material, spatially culled chunks. */
class Surface {
 positions:number[]=[];indices:number[]=[];colors:number[]=[];
 quad(points:readonly {x:number;y:number;z:number}[],hex:string){
  const base=this.positions.length/3,c=Color3.FromHexString(hex);
  for(const p of points){this.positions.push(p.x,p.y,p.z);this.colors.push(c.r,c.g,c.b,1);}
  // Winding follows Babylon's left-handed front face.
  this.indices.push(base,base+2,base+1,base,base+3,base+2);
 }
 mesh(scene:Scene,name:string,kit:WorldKit){const m=new Mesh(name,scene),d=new VertexData();d.positions=this.positions;d.indices=this.indices;d.colors=this.colors;d.normals=[];VertexData.ComputeNormals(this.positions,this.indices,d.normals);d.applyToMesh(m);m.material=kit.lit;m.freezeWorldMatrix();return m;}
}
/** Ground stays below pavement. Offset landforms establish a high cut side and a valley side. */
export function terrainHeight(x:number,z:number){
 const {sample:p,distance:d}=nearestRoad({x,z});
 const side=(x-p.x)*Math.cos(p.heading)-(z-p.z)*Math.sin(p.heading);
 const rise=Math.min(1,Math.max(0,(d-35)/65));
 const hill=side<0?Math.min(100,d*.5): -Math.min(92,d*.4);
 const hills=(Math.sin(x/170)+Math.cos(z/210))*15;
 // Clearance is a function of the vertex position, never of its owning tile.
 // Keep coarse triangles below the road ribbon, then blend into the hills.
 const blend=Math.max(0,Math.min(1,(d-35)/35));
 const clearance=5.6*(1-blend*blend*(3-2*blend));
 const height=p.y-1.4-clearance+(hill+hills)*rise;
 // The terrain rectangle used to end at full mountain height beside the hub.
 // Ease the perimeter below the surrounding ground instead of exposing a cut edge.
 const edge=Math.max(0,Math.min(1,Math.min(x-250,3750-x,z+250,4750-z)/220));
 return -7+(height+7)*edge*edge*(3-2*edge);
}
export class MountainWorld implements GameSystem {
 readonly name='mountainWorld';
 private meshes:Mesh[]=[];
 private bodies:PhysicsBody[]=[];
 private shapes:PhysicsShapeMesh[]=[];
 readonly chunks;
 constructor(scene:Scene,kit:WorldKit,physics=true){
  this.chunks=MOUNTAIN_CHUNKS.map(c=>buildChunk(scene,c,kit,{physics,ground:false}));
  const create=(surface:Surface,name:string,collide=true)=>{
   const mesh=surface.mesh(scene,name,kit);this.meshes.push(mesh);
   if(physics&&collide){const shape=new PhysicsShapeMesh(mesh,scene);shape.material={friction:.9,restitution:0};shape.filterMembershipMask=CollisionGroup.STATIC;shape.filterCollideMask=0xffff;const body=new PhysicsBody(mesh,PhysicsMotionType.STATIC,false,scene);body.shape=shape;this.bodies.push(body);this.shapes.push(shape);}
  };
  for(let start=0;start<ROUTE_LENGTH;start+=220){
   const road=new Surface(),detail=new Surface();
   const end=Math.min(ROUTE_LENGTH,start+220);
   for(let s=start;s<end;s+=4){
    const next=Math.min(end,s+4),p=roadAt(s),q=roadAt(next);
    const edges=(width:number,drop=0)=>[roadAt(s,-width),roadAt(next,-width),roadAt(next,width),roadAt(s,width)].map(v=>({...v,y:v.y+drop}));
    // 6.2 m pavement, 40 cm gravel edges; no invisible racetrack-wide driving slab.
    road.quad([roadAt(s,-p.width/2),roadAt(next,-q.width/2),roadAt(next,q.width/2),roadAt(s,p.width/2)],Math.floor(s/90)%9===4?'#686a61':'#a4a394');
    for(const side of [-1,1]){
     const a=roadAt(s,side*p.width/2),b=roadAt(next,side*q.width/2),c=roadAt(next,side*(q.width/2+.55)),d=roadAt(s,side*(p.width/2+.55));
     c.y-=.12;d.y-=.12;road.quad(side===1?[a,b,c,d]:[d,c,b,a],'#827862');
     const e=roadAt(next,side*35),f=roadAt(s,side*35);e.y-=.65;f.y-=.65;
     road.quad(side===1?[d,c,e,f]:[f,e,c,d],side===-1?'#526537':'#59683c');
     // Close the ribbon against the coarse terrain, including its boundary blend.
     const bottomE={...e,y:Math.min(e.y-1,terrainHeight(e.x,e.z)-12)};
     const bottomF={...f,y:Math.min(f.y-1,terrainHeight(f.x,f.z)-12)};
     road.quad(side===1?[f,e,bottomE,bottomF]:[bottomF,bottomE,e,f],'#475e37');
    }
    // Seams every slab, with faded lines only on inhabited/open parts.
    if(Math.floor(s/5)!==Math.floor(next/5)) {
     const a=roadAt(next-.035,-p.width/2),b=roadAt(next+.035,-p.width/2),c=roadAt(next+.035,p.width/2),d=roadAt(next-.035,p.width/2);
     detail.quad([a,b,c,d].map(v=>({...v,y:v.y+.008})),'#777b6d');
    }
    const sector=sectorAt(s).id;
    if((sector==='alimodian'||sector==='ridge'||sector==='maasin')&&Math.floor(s/4)%3===0)detail.quad(edges(.045,.012),'#bfb794');
    if(Math.floor(s/4)%47===13){const a=roadAt(s,1),b=roadAt(next,1),c=roadAt(next,2.6),d=roadAt(s,2.6);detail.quad([a,b,c,d].map(v=>({...v,y:v.y+.014})),'#7e8077');}
   }
   create(road,`upland-road-${start}`);create(detail,`upland-seams-${start}`,false);
  }
  // Broad terrain tiles, separate from the exact drivable ribbon. Coarse distant silhouettes.
  const heights=new Map<string,number>();
  const groundPoint=(x:number,z:number)=>{
   const key=`${x},${z}`;
   let y=heights.get(key);
   if(y===undefined){y=terrainHeight(x,z);heights.set(key,y);}
   return {x,y,z};
  };
  for(let x=250;x<3750;x+=250)for(let z=-250;z<4750;z+=250){
   const land=new Surface();
   for(let dx=0;dx<250;dx+=25)for(let dz=0;dz<250;dz+=25){
    const points=[[x+dx,z+dz],[x+dx,z+dz+25],[x+dx+25,z+dz+25],[x+dx+25,z+dz]].map(([px,pz])=>groundPoint(px,pz));
    land.quad(points,Math.floor((x+dx)/75+(z+dz)/110)%3===0?'#5a6f40':'#475e37');
   }
   create(land,`upland-terrain-${x}-${z}`);
  }
  // Stopover apron is connected by a broad level gravel driveway, clear of the live lane.
  const apron=new Surface();const p=OVERLOOK;
  apron.quad([[-13,-23],[-13,23],[13,23],[13,-23]].map(([x,z])=>({
   x:p.x+Math.cos(p.heading)*x+Math.sin(p.heading)*z,
   y:p.y,z:p.z-Math.sin(p.heading)*x+Math.cos(p.heading)*z,
  })),'#938b76');
  const entry=roadAt(OVERLOOK_S-10,3.1),exit=roadAt(OVERLOOK_S+10,3.1);
  const inner=(along:number)=>({x:p.x-11*Math.cos(p.heading)+along*Math.sin(p.heading),y:p.y,z:p.z+11*Math.sin(p.heading)+along*Math.cos(p.heading)});
  apron.quad([entry,exit,inner(10),inner(-10)],'#938b76');
  create(apron,'pahuway-apron');
 }
 dispose(){this.bodies.forEach(b=>b.dispose());this.shapes.forEach(s=>s.dispose());this.meshes.forEach(m=>m.dispose());this.chunks.forEach(c=>c.dispose());}
}
