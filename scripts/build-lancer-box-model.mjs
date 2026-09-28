// Derives a distinct retro sedan from the project's fitted modular sedan panels.
// Source assets are read-only; all output is written beneath public/model/lancer.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MeshBuilder, readGlb, setPart, worldPosition, writeGlb } from './lib/vehicle-asset.mjs';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'public/model/lancer');
mkdirSync(output,{recursive:true});
const source=resolve(root,'public/model/banwa_dalagan_1996_modular.glb');
const asset=readGlb(source),j=asset.json;
const materials=Object.fromEntries(j.materials.map((m,i)=>[m.name,i]));
const {paint,trim,glass,chrome,headlight,amber,taillight,reverse,plate,engine_metal:metal,engine_dark:dark}=materials;
j.materials[paint].pbrMetallicRoughness={baseColorFactor:[.82,.84,.81,1],metallicFactor:.12,roughnessFactor:.58};
j.materials[glass].pbrMetallicRoughness={baseColorFactor:[.009,.016,.022,1],metallicFactor:0,roughnessFactor:.8};
j.materials[trim].pbrMetallicRoughness={baseColorFactor:[.024,.027,.031,1],metallicFactor:0,roughnessFactor:.7};
j.materials[plate].pbrMetallicRoughness={baseColorFactor:[.025,.028,.032,1],metallicFactor:0,roughnessFactor:.7};
j.nodes.find(n=>n.name==='vehicle_root').extras={units:'metres',up:'+Y',forward:'+Z',left:'+X',vehicleId:'banwa_silak_1983',drivetrain:'RWD',mountingContract:'silak83-v1'};

// Extend the rear roof slightly and reduce cabin side taper, keeping every shared edge aligned.
const reshape=p=>{const t=Math.max(0,Math.min(1,(p[1]-.88)/.515)),rear=Math.max(0,Math.min(1,(-p[2]-.1)/.45));return [p[0]*(1+.035*t),p[1],p[2]-.105*t*rear];};
for(let ni=0;ni<j.nodes.length;ni++){
  const node=j.nodes[ni];if(node.mesh===undefined)continue;
  const origin=worldPosition(j,ni);
  if(!['shell_base','windshield','rear_glass','pillar_trim'].includes(node.name)&&!node.name.startsWith('window_'))continue;
  for(const p of asset.meshes[node.mesh].primitives){
    for(let i=0;i<p.positions.length;i+=3){const v=reshape(p.positions.slice(i,i+3).map((v,k)=>v+origin[k]));for(let k=0;k<3;k++)p.positions[i+k]=v[k]-origin[k];}
    // Preserve flat face normals after the affine-by-height silhouette adjustment.
    for(let i=0;i<p.indices.length;i+=3){const ids=p.indices.slice(i,i+3),vs=ids.map(id=>p.positions.slice(id*3,id*3+3));
      const a=vs[1].map((v,k)=>v-vs[0][k]),b=vs[2].map((v,k)=>v-vs[0][k]);const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],l=Math.hypot(...n);
      for(const id of ids)for(let k=0;k<3;k++)p.normals[id*3+k]=n[k]/l;
    }
  }
}

const interfaces=JSON.parse(readFileSync(resolve(root,'public/model/mounting_interfaces.json')));
interfaces.contract='silak83-v1';interfaces.vehicle='banwa_silak_1983';
interfaces.source={file:'../banwa_dalagan_1996_modular.glb',sha256:createHash('sha256').update(readFileSync(source)).digest('hex')};
const build=(name,fn,parent)=>{const b=new MeshBuilder();fn(b);setPart(asset,name,b,parent);return b;};
const clear=name=>{const node=j.nodes.find(n=>n.name===name);if(node)delete node.mesh;};
const boundary=(name,loop)=>{interfaces.panel_boundary_loops_world[name]={outer:loop};};
const mount=(name,position,children=[])=>{
  const index=j.nodes.length;j.nodes.push({name,translation:position,children:[],extras:{contract:'silak83-v1'}});j.nodes.find(n=>n.name==='vehicle_root').children.push(index);
  for(const child of children){const ci=j.nodes.findIndex(n=>n.name===child),old=worldPosition(j,ci);for(const node of j.nodes)if(node.children)node.children=node.children.filter(x=>x!==ci);j.nodes[index].children.push(ci);j.nodes[ci].translation=old.map((v,k)=>v-position[k]);}
  interfaces.slots[name.replace(/^attach_/,'')]=position;return index;
};
const reparent=(child,parent)=>{
  const ci=j.nodes.findIndex(n=>n.name===child),pi=j.nodes.findIndex(n=>n.name===parent);
  const p=worldPosition(j,ci),q=worldPosition(j,pi);
  for(const n of j.nodes)if(n.children)n.children=n.children.filter(i=>i!==ci);
  (j.nodes[pi].children??=[]).push(ci);j.nodes[ci].translation=p.map((v,k)=>v-q[k]);
};
const ring=(x,y,z0,z1,bevel)=>[[-x+bevel,y,z0],[-x,y,z0+bevel],[-x,y,z1-bevel],[-x+bevel,y,z1],[x-bevel,y,z1],[x,y,z1-bevel],[x,y,z0+bevel],[x-bevel,y,z0]];

// Slim black bumper bands over faceted painted valances. Upper interfaces stay on the stock shell.
build('bumper_front_stock',b=>{
  b.loft(paint,ring(.78,.23,1.84,2.075,.085),ring(.835,.535,1.827,2.13,.065));
  boundary('bumper_front_stock',b.bumper(trim,.855,.535,.655,1.827,2.16,.065));
  b.box(chrome,[0,.637,2.165],[1.53,.012,.011]);
  b.box(trim,[0,.37,2.134],[.80,.14,.012]);
  for(let x=-.35;x<=.36;x+=.07)b.box(dark,[x,.37,2.145],[.012,.12,.008]);
  b.box(plate,[0,.50,2.178],[.34,.12,.018]);
});
build('bumper_rear_stock',b=>{
  b.loft(paint,ring(.78,.24,-2.075,-1.84,.085),ring(.835,.53,-2.135,-1.827,.06));
  boundary('bumper_rear_stock',b.bumper(trim,.856,.525,.651,-2.17,-1.827,.06));
  b.box(chrome,[0,.632,-2.174],[1.54,.011,.009]);
  for(const s of [-1,1]){b.box(trim,[s*.58,.365,-2.14],[.17,.085,.014]);b.box(s<0?taillight:reverse,[s*.58,.365,-2.15],[.135,.052,.009]);}
});
build('chin_front_stock',b=>{boundary('chin_front_stock',b.bumper(paint,.79,.20,.25,1.95,2.13,.035));});
build('lip_front_stock',b=>{boundary('lip_front_stock',b.bumper(trim,.795,.188,.205,1.94,2.14,.035));});

// A single rectangular lamp/grille face, with restrained era-correct metal slats.
build('nose_carrier',b=>{
  b.box(trim,[0,.721,1.944],[1.48,.146,.10]);
  for(const s of [-1,1]){
    const lo=[[s*.72,.65,1.82],[s*.72,.65,2.025],[s*.84,.65,2.025],[s*.84,.65,1.82]];
    const hi=lo.map(p=>[p[0],p[2]<1.9?.86:.798,p[2]]);
    if(s<0){lo.reverse();hi.reverse();}b.loft(paint,lo,hi);
  }
});
build('nose_top',b=>{b.box(paint,[0,.799,1.937],[1.48,.028,.145]);});
build('grille',b=>{b.box(trim,[0,.724,2.006],[.665,.144,.022]);});
build('grille_slats',b=>{
  for(const y of [.673,.706,.739,.772])b.box(chrome,[0,y,2.024],[.64,.009,.012]);
  b.box(chrome,[0,.724,2.027],[.014,.115,.012]);
});
clear('headlight_ridges');
for(const [side,s] of [['l',1],['r',-1]]){
  build(`headlight_${side}`,b=>{
    b.box(trim,[s*.526,.727,2.003],[.365,.15,.05]);b.box(chrome,[s*.526,.727,2.033],[.345,.133,.012]);
    b.box(headlight,[s*.526,.727,2.043],[.326,.112,.01]);
    for(let k=-3;k<=3;k++)b.box(reverse,[s*.526+k*.04,.727,2.05],[.003,.105,.003]);
  });
  build(`indicator_${s}`,b=>{b.box(trim,[s*.754,.723,1.966],[.081,.148,.13]);b.box(amber,[s*.756,.723,2.038],[.065,.116,.015]);});
}

// Lancer EX-like rear: inset black panel, rectangular segmented lamps and low ducktail.
build('rear_panel',b=>{
  b.box(trim,[0,.74,-1.982],[1.57,.178,.10]);b.box(chrome,[0,.833,-2.037],[1.52,.010,.010]);
  for(const s of [-1,1])b.box(paint,[s*.797,.743,-1.947],[.082,.186,.165]);
});
for(const [side,s] of [['l',1],['r',-1]]){
  build(`taillight_${side}`,b=>{
    b.box(trim,[s*.562,.737,-2.04],[.407,.185,.045]);
    b.box(taillight,[s*.562,.738,-2.066],[.38,.153,.01]);
    b.box(trim,[s*.562,.738,-2.073],[.383,.009,.006]);
    for(const dx of [-.06,.06])b.box(trim,[s*.562+dx,.738,-2.073],[.006,.154,.006]);
    b.box(reverse,[s*.435,.689,-2.075],[.112,.032,.005]);
  });
}
build('rear_plate_recess',b=>{b.box(dark,[0,.738,-2.047],[.42,.16,.014]);});
build('rear_plate',b=>{b.box(plate,[0,.738,-2.063],[.34,.114,.016]);});
build('spoiler_rear_stock',b=>{
  const lo=[[-.69,.853,-1.96],[-.69,.89,-1.73],[.69,.89,-1.73],[.69,.853,-1.96]];
  const hi=[[-.72,.946,-2.035],[-.72,.916,-1.78],[.72,.916,-1.78],[.72,.946,-2.035]];
  b.loft(trim,lo,hi);boundary('spoiler_rear_stock',lo);
});

// Thin bright window reveals and period rub strips follow the fitted panels.
build('body_moulding',b=>{
  for(const s of [-1,1]){
    b.box(trim,[s*.847,.476,0],[.018,.038,1.26]);b.box(chrome,[s*.858,.49,0],[.008,.006,1.25]);
    b.box(trim,[s*.833,.476,-1.775],[.018,.038,.25]);
  }
});
build('fuel_flap',b=>{
  b.box(trim,[.840,.686,-1.66],[.008,.153,.171]);b.box(paint,[.846,.686,-1.66],[.006,.141,.159]);
});

// Longitudinal engine, gearbox, prop shaft and driven rear axle; hood clearance is retained.
build('engine_stock',b=>{
  b.box(dark,[0,.43,1.25],[.39,.29,.57]);b.box(metal,[0,.59,1.25],[.36,.075,.56]);
  b.box(trim,[0,.642,1.25],[.29,.035,.49]);
  for(const x of [-.095,0,.095])b.box(metal,[x,.663,1.25],[.015,.012,.43]);
  for(const z of [1.08,1.19,1.30,1.41])b.cylinder(metal,[-.18,.53,z],[-.34,.46,z],.035,8);
  b.cylinder(dark,[.22,.45,1.04],[.22,.45,1.16],.10,12);
  b.cylinder(metal,[.19,.51,1.08],[.39,.61,1.08],.035,8);
});
build('rwd_gearbox',b=>{b.box(metal,[0,.30,.77],[.24,.21,.35]);});
build('rwd_prop_shaft',b=>{b.cylinder(metal,[0,.225,.60],[0,.225,-1.22],.032,10);});
build('rwd_rear_axle',b=>{
  b.cylinder(dark,[-.728,.30,-1.22],[.728,.30,-1.22],.043,12);
  b.box(dark,[0,.275,-1.22],[.20,.18,.23]);b.cylinder(metal,[-.11,.275,-1.22],[.11,.275,-1.22],.10,12);
  for(const s of [-1,1])b.box(dark,[s*.52,.23,-1.22],[.045,.027,.68]);
});
build('exhaust',b=>{b.cylinder(dark,[.44,.195,-1.45],[.44,.195,-2.12],.032,12);b.box(metal,[.44,.195,-1.68],[.18,.13,.31]);});
build('exhaust_tip',b=>{
  // Two open annular rings and connecting wall; dark inset makes the outlet legible.
  const n=12,ring=(r,z)=>Array.from({length:n},(_,i)=>[.44+r*Math.cos(i*2*Math.PI/n),.195+r*Math.sin(i*2*Math.PI/n),z]);
  const a=ring(.047,-2.11),c=ring(.047,-2.21),d=ring(.034,-2.21),e=ring(.034,-2.12);
  for(let i=0;i<n;i++){const k=(i+1)%n;b.quad(chrome,a[i],a[k],c[k],c[i]);b.quad(chrome,c[i],c[k],d[k],d[i]);b.quad(dark,d[i],d[k],e[k],e[i]);}
});

// Complete attachment set for runtime swaps, keeping wheel pivots at axle centers.
for(const [name,pos] of [['wheel_fl',[.728,.3,1.28]],['wheel_fr',[-.728,.3,1.28]],['wheel_rl',[.728,.3,-1.22]],['wheel_rr',[-.728,.3,-1.22]]])mount(`attach_${name}`,pos,[name]);
for(const [name,pos] of [['headlight_l',[.526,.727,2.006]],['headlight_r',[-.526,.727,2.006]],['taillight_l',[.562,.738,-2.04]],['taillight_r',[-.562,.738,-2.04]],['grille',[0,.724,2.006]]])mount(`attach_${name}`,pos,[name]);
mount('attach_exhaust',[.44,.195,-1.45],['exhaust','exhaust_tip']);
mount('attach_lip_rear',[0,.24,-2.135]);mount('attach_overfender_rl',[.84,.3,-1.22]);mount('attach_overfender_rr',[-.84,.3,-1.22]);
reparent('grille_slats','grille');
reparent('indicator_1','fender_fl_stock');reparent('indicator_-1','fender_fr_stock');
interfaces.notes='World-space ordered mounting boundaries. Subtract the mount translation for slot-local positions. Unchanged hood, fender, trunk and skirt seams derive from the Dalagan source; bumpers, ducktail and front lip have distinct silak83-v1 geometry. Wheels rotate around local X. No physics rig is embedded.';
writeGlb(asset,resolve(output,'lancer_box_1983_modular.glb'));
writeFileSync(resolve(output,'mounting_interfaces.json'),JSON.stringify(interfaces,null,2)+'\n');

// Reuse the existing self-contained workshop UI, including its bundled Three.js license.
let html=readFileSync(resolve(root,'banwa_dalagan_viewer.html'),'utf8');
const encoded=readFileSync(resolve(output,'lancer_box_1983_modular.glb')).toString('base64');
html=html.replace(/(<script id="model-data"[^>]*>)[\s\S]*?(<\/script>)/,`$1${encoded}$2`)
  .replaceAll('banwa_dalagan_1996_modular.glb','lancer_box_1983_modular.glb').replaceAll('Banwa Dalagan','Banwa Silak').replaceAll('Dalagan 1996','Silak 1983').replaceAll('BANWA / GARAGE 01','BANWA / RWD 1983').replaceAll('19,732 triangles','Modular rear wheel drive sedan');
writeFileSync(resolve(output,'lancer_box_1983_viewer.html'),html);
console.log(`Built ${output}/lancer_box_1983_modular.glb`);
