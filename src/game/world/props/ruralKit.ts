import type { PropDefinition, PropPart, Vec3Tuple } from './PropDefinition';
const box=(size:Vec3Tuple,at:Vec3Tuple,color:string):PropPart=>({shape:'box',size,at,color});
const ball=(size:Vec3Tuple,at:Vec3Tuple,color:string):PropPart=>({shape:'sphere',size,at,color,tessellation:5});
const stem=(x:number,z:number,h:number):PropPart=>({shape:'cylinder',size:[.13,h,.13],at:[x,h/2,z],color:'#747945',tessellation:5});
function house(wood=false):PropDefinition {
 const parts:PropPart[]=[box([6,3,5],[0,1.5,0],wood?'#776048':'#a19d8e'),box([6.8,.16,5.8],[0,3.25,0],'#777e7b'),box([1,2,.1],[0,1,2.55],'#463d32')];
 for(const x of [-1.9,1.9])parts.push(box([1.1,.9,.08],[x,1.8,2.56],'#574e36'),{...box([.9,.7,.09],[x,1.8,2.57],'#beab69'),layer:'glow'});
 for(let x=-3.3;x<3.5;x+=.32)parts.push(box([.04,.06,5.8],[x,3.36,0],'#9a9e94'));
 if(!wood)for(let y=.4;y<3;y+=.45)parts.push(box([6,.025,.02],[0,y,2.51],'#78796c'));
 return {category:'clutter',description:wood?'Sawali/timber roadside home, GI roof':'Unfinished concrete rural home with corrugated GI roof',parts,collider:{size:[6,3,5],at:[0,1.5,0]}};
}
export const RURAL_KIT = {
 rural_house:house(), timber_house:house(true),
 bamboo_cluster:{category:'vegetation',description:'Kawayan tinik clump; slender stems and airy crown',parts:[...Array.from({length:7},(_,i)=>stem(Math.sin(i*2)*.7,Math.cos(i*2)*.7,6+i%3)),ball([4,5,4],[0,6,0],'#566f39'),ball([3,3,3],[1,8,0],'#658445')]},
 roadside_grass:{category:'vegetation',description:'Tufts of narrow uneven roadside grass blades',parts:Array.from({length:9},(_,i)=>({...box([.045,.35+(i%5)*.09,.035],[Math.sin(i*2.4)*.3,(.35+(i%5)*.09)/2,Math.cos(i*2.4)*.22],i%3?'#647941':'#8b9153'),rotDeg:[0,i*41,i*5-20] as Vec3Tuple}))},
 guardrail:{category:'barrier',description:'Short galvanized beam with concrete posts',parts:[box([.16,.35,5],[0,.8,0],'#a4a79a'),box([.18,.8,.18],[0,.4,-2],'#85857a'),box([.18,.8,.18],[0,.4,2],'#85857a')],collider:{size:[.2,1,5],at:[0,.5,0]}},
 retaining_wall:{category:'wall',description:'Weathered stone/concrete slope protection module',parts:[box([.6,3,5],[0,1.5,0],'#77786d'),...Array.from({length:5},(_,i)=>box([.62,.04,5],[0,.3+i*.55,0],'#555f56'))],collider:{size:[.6,3,5],at:[0,1.5,0]}},
 sari_store:{category:'clutter',description:'Small open-front sari-sari store, rusted GI roof and counter',parts:[box([6,2.8,3],[0,1.4,-1],'#8b997b'),box([6.8,.15,6],[0,3,0],'#8c6048'),box([5,1,1],[0,.5,1.5],'#716349'),box([.12,3,.12],[-3,1.5,2.5],'#65503b'),box([.12,3,.12],[3,1.5,2.5],'#65503b'),{...box([4,.12,.12],[0,2.65,1.8],'#fff1b5'),layer:'glow'}],collider:{size:[6,2.8,3],at:[0,1.4,-1]}},
 water_tank:{category:'clutter',description:'Blue household water drum on block stand',parts:[box([1.3,1,1.3],[0,.5,0],'#8a8980'),{shape:'cylinder',size:[1.2,1.5,1.2],at:[0,1.75,0],color:'#446987',tessellation:10}]},
 cat_roadside:{category:'clutter',description:'Small pale cat, readable tail and ears',parts:[ball([.25,.3,.55],[0,.3,0],'#c7b9a0'),ball([.25,.25,.25],[0,.48,.26],'#d3c5ac'),box([.06,.5,.06],[0,.5,-.32],'#b9a98f'),box([.07,.15,.08],[-.08,.64,.26],'#9e8973'),box([.07,.15,.08],[.08,.64,.26],'#9e8973')]},
} satisfies Record<string,PropDefinition>;
