import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readGlb, worldPosition } from './lib/vehicle-asset.mjs';

const dir=resolve(import.meta.dirname,'../public/model/lancer');
const {json:j,meshes}=readGlb(resolve(dir,'lancer_box_1983_modular.glb'));
const interfaces=JSON.parse(readFileSync(resolve(dir,'mounting_interfaces.json')));
const required=['shell_base','hood_stock','trunk_stock','fender_fl_stock','fender_fr_stock','bumper_front_stock','bumper_rear_stock','sideskirt_l_stock','sideskirt_r_stock','chin_front_stock','lip_front_stock','spoiler_rear_stock','engine_stock','rwd_gearbox','rwd_prop_shaft','rwd_rear_axle','wheel_fl','wheel_fr','wheel_rl','wheel_rr'];
const names=j.nodes.map(n=>n.name);for(const name of required)assert(names.includes(name),`Missing ${name}`);
let triangles=0,drawCalls=0,zeroArea=0,invalidNormals=0;
const bounds=new Map(),overall=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
for(let ni=0;ni<j.nodes.length;ni++){
  const node=j.nodes[ni];if(node.mesh===undefined)continue;const o=worldPosition(j,ni),b=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for(const p of meshes[node.mesh].primitives){triangles+=p.indices.length/3;drawCalls++;
    assert(p.positions.every(Number.isFinite),`${node.name}: nonfinite vertex`);
    assert(p.indices.every(i=>i>=0&&i<p.positions.length/3),`${node.name}: bad index`);
    for(let i=0;i<p.positions.length;i++){const k=i%3,v=p.positions[i]+o[k];b[0][k]=Math.min(b[0][k],v);b[1][k]=Math.max(b[1][k],v);overall[0][k]=Math.min(overall[0][k],v);overall[1][k]=Math.max(overall[1][k],v);}
    for(let i=0;i<p.normals.length;i+=3)if(!Number.isFinite(Math.hypot(...p.normals.slice(i,i+3)))||Math.abs(Math.hypot(...p.normals.slice(i,i+3))-1)>.01)invalidNormals++;
    for(let i=0;i<p.indices.length;i+=3){const [a,b,c]=p.indices.slice(i,i+3).map(id=>p.positions.slice(id*3,id*3+3)),u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10)zeroArea++;}
  }bounds.set(node.name,b);
}
assert.equal(zeroArea,0);assert.equal(invalidNormals,0);assert(triangles<30000);assert(drawCalls<=100);assert(j.materials.length<=16);
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
for(const [name,p] of Object.entries(interfaces.slots)){
  const ni=j.nodes.findIndex(n=>n.name===`attach_${name}`);assert(ni>=0,`Missing mount ${name}`);
  worldPosition(j,ni).forEach((v,k)=>near(v,p[k]));
}
for(const [id,x,z] of [['fl',.728,1.28],['fr',-.728,1.28],['rl',.728,-1.22],['rr',-.728,-1.22]]){
  const ni=j.nodes.findIndex(n=>n.name===`wheel_${id}`),p=worldPosition(j,ni);[x,.3,z].forEach((v,k)=>near(v,p[k]));
  const b=bounds.get(`wheel_${id}`);near(b[0][1],0);near(b[1][1],.6);
}
const clearance=bounds.get('hood_stock')[0][1]-bounds.get('engine_stock')[1][1];assert(clearance>.08,'Engine clips hood');
const children=(name)=>j.nodes[names.indexOf(name)].children?.map(i=>names[i])??[];
assert(children('fender_fl_stock').includes('indicator_1'));assert(children('fender_fr_stock').includes('indicator_-1'));assert(children('grille').includes('grille_slats'));
for(const [name,loops] of Object.entries(interfaces.panel_boundary_loops_world)){
  assert(names.includes(name));for(const loop of Object.values(loops)){assert(loop.length>=3);assert(loop.flat().every(Number.isFinite));}
}
const report={vehicle:'banwa_silak_1983',contract:'silak83-v1',triangles,drawCalls,materials:j.materials.length,bounds_min:overall[0],bounds_max:overall[1],dimensions_xyz:overall[1].map((v,i)=>v-overall[0][i]),wheelbase:2.5,track:1.456,wheel_radius:.3,ground_contact_y:0,axes:interfaces.axes,mesh_nodes:bounds.size,attachment_nodes:names.filter(n=>n.startsWith('attach_')),required_nodes_present:true,export_reimport_checks:true,zero_area_triangles:zeroArea,invalid_normals:invalidNormals,engine_clearance_conservative:clearance,drivetrain_geometry:['engine_stock','rwd_gearbox','rwd_prop_shaft','rwd_rear_axle'],source:interfaces.source,issues:[],limitations:['Assembled closed components are not globally boolean-unioned.','Open exhaust outlet is intentional.','No collision mesh, suspension rig, LODs or texture atlas is embedded; runtime supplies collision and handling.']};
writeFileSync(resolve(dir,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({triangles,drawCalls,clearance,issues:report.issues}));
