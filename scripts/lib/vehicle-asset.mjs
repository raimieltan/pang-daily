// Mesh assembly and GLB I/O for modular vehicles. Coordinates are metres, Y up, Z forward.
import { readFileSync, writeFileSync } from 'node:fs';

const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = v => { const l=Math.hypot(...v); return v.map(x=>x/l); };

export function readGlb(path) {
  const bytes=readFileSync(path), size=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+size)), bin=bytes.subarray(28+size);
  const readAccessor=index=>{
    const a=json.accessors[index],v=json.bufferViews[a.bufferView];
    const [size,read]=({5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']})[a.componentType];
    const width=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4})[a.type],stride=v.byteStride??size*width;
    return Array.from({length:a.count*width},(_,i)=>bin[read]((v.byteOffset??0)+(a.byteOffset??0)+Math.floor(i/width)*stride+(i%width)*size));
  };
  const meshes=json.meshes.map(m=>({name:m.name,primitives:m.primitives.map(p=>({
    material:p.material,positions:readAccessor(p.attributes.POSITION),normals:readAccessor(p.attributes.NORMAL),indices:readAccessor(p.indices),
  }))}));
  return {json,meshes};
}

export function worldPosition(json,index) {
  const node=json.nodes[index];
  if(node.matrix || node.rotation?.some((v,i)=>v!==(i===3?1:0)) || node.scale?.some(v=>v!==1)) throw new Error(`Non-translation transform: ${node.name}`);
  const parent=json.nodes.findIndex(n=>n.children?.includes(index));
  return add(parent<0?[0,0,0]:worldPosition(json,parent),node.translation??[0,0,0]);
}

export class MeshBuilder {
  constructor(){this.parts=new Map();this.loops=[];}
  tri(material,a,b,c){
    const n=cross(sub(b,a),sub(c,a)); if(Math.hypot(...n)<1e-10)return;
    if(!this.parts.has(material))this.parts.set(material,{material,positions:[],normals:[],indices:[]});
    const p=this.parts.get(material),i=p.positions.length/3,normal=norm(n);
    p.positions.push(...a,...b,...c);p.normals.push(...normal,...normal,...normal);p.indices.push(i,i+1,i+2);
  }
  quad(material,a,b,c,d){this.tri(material,a,b,c);this.tri(material,a,c,d);}
  // Convex rings, viewed counter-clockwise from above; close all component surfaces.
  loft(material,lower,upper){
    const center=r=>r.reduce((a,p)=>add(a,p),[0,0,0]).map(v=>v/r.length);
    const lo=center(lower),hi=center(upper);
    for(let i=0;i<lower.length;i++){const k=(i+1)%lower.length;
      this.tri(material,lo,lower[k],lower[i]);this.tri(material,hi,upper[i],upper[k]);
      this.quad(material,lower[i],lower[k],upper[k],upper[i]);
    }
  }
  box(material,center,size){
    const [x,y,z]=center,[w,h,d]=size.map(v=>v/2);
    const lo=[[x-w,y-h,z-d],[x-w,y-h,z+d],[x+w,y-h,z+d],[x+w,y-h,z-d]];
    this.loft(material,lo,lo.map(p=>[p[0],y+h,p[2]]));
  }
  bumper(material,x,y0,y1,z0,z1,bevel=.08){
    const ring=y=>[[-x+bevel,y,z0],[-x,y,z0+bevel],[-x,y,z1-bevel],[-x+bevel,y,z1],[x-bevel,y,z1],[x,y,z1-bevel],[x,y,z0+bevel],[x-bevel,y,z0]];
    this.loft(material,ring(y0),ring(y1));return ring(y1);
  }
  cylinder(material,a,b,radius,segments=12){
    const axis=norm(sub(b,a)),u=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u);
    const ring=p=>Array.from({length:segments},(_,i)=>add(p,u.map((x,j)=>radius*(x*Math.cos(i*2*Math.PI/segments)+v[j]*Math.sin(i*2*Math.PI/segments)))));
    const l=ring(a),r=ring(b);
    for(let i=0;i<segments;i++){const j=(i+1)%segments;
      this.tri(material,a,l[j],l[i]);this.tri(material,b,r[i],r[j]);this.quad(material,l[i],l[j],r[j],r[i]);
    }
  }
  finish(origin=[0,0,0]) {return [...this.parts.values()].map(p=>({...p,positions:p.positions.map((v,i)=>v-origin[i%3])}));}
}

export function setPart(asset,name,builder,parentName='vehicle_root',origin=null){
  const {json,meshes}=asset;let index=json.nodes.findIndex(n=>n.name===name);
  if(index<0){index=json.nodes.length;json.nodes.push({name});const parent=json.nodes.find(n=>n.name===parentName);if(!parent)throw new Error(`Missing parent ${parentName}`);(parent.children??=[]).push(index);}
  if(origin)json.nodes[index].translation=origin;
  meshes.push({name,primitives:builder.finish(worldPosition(json,index))});json.nodes[index].mesh=meshes.length-1;
  return index;
}

export function writeGlb(asset,path){
  const j=structuredClone(asset.json),chunks=[],views=[],accessors=[];let offset=0;
  const push=(values,type,componentType,target)=>{
    const a=componentType===5126?new Float32Array(values):new Uint32Array(values),b=Buffer.from(a.buffer),width=type==='VEC3'?3:1;
    const view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:b.length,target});chunks.push(b);offset+=b.length;
    const accessor={bufferView:view,componentType,count:values.length/width,type};
    if(type==='VEC3'){accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){const k=i%3;accessor.min[k]=Math.min(accessor.min[k],values[i]);accessor.max[k]=Math.max(accessor.max[k],values[i]);}}
    accessors.push(accessor);return accessors.length-1;
  };
  const used=new Map();j.meshes=[];
  for(const node of j.nodes){if(node.mesh===undefined)continue;const source=node.mesh;
    if(!used.has(source)){const m=asset.meshes[source];used.set(source,j.meshes.length);j.meshes.push({name:m.name,primitives:m.primitives.map(p=>({attributes:{POSITION:push(p.positions,'VEC3',5126,34962),NORMAL:push(p.normals,'VEC3',5126,34962)},indices:push(p.indices,'SCALAR',5125,34963),material:p.material}))});}
    node.mesh=used.get(source);
  }
  j.asset={version:'2.0',generator:'Pang Daily modular Lancer builder'};j.accessors=accessors;j.bufferViews=views;j.buffers=[{byteLength:offset}];
  const binary=Buffer.concat(chunks);let text=Buffer.from(JSON.stringify(j));text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
  const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+binary.length,8);jh.writeUInt32LE(text.length);jh.write('JSON',4);bh.writeUInt32LE(binary.length);bh.write('BIN\0',4);
  writeFileSync(path,Buffer.concat([header,jh,text,bh,binary]));
}
