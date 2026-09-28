import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir=resolve(import.meta.dirname,'../public/model/lancer'),preview=resolve(dir,'previews');mkdirSync(preview,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),args:['--allow-file-access-from-files']});
const page=await browser.newPage({viewport:{width:1530,height:800},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(pathToFileURL(resolve(dir,'lancer_box_1983_viewer.html')).href);
  await page.waitForFunction(()=>window.viewerDebug?.model,{timeout:30000});
  await page.evaluate(()=>{const d=window.viewerDebug;d.scene.background.set('#aeb6b5');d.scene.children.filter(x=>x.type==='GridHelper').forEach(x=>x.visible=false);document.querySelector('#hud').style.display='none';document.querySelector('#help').style.display='none';});
  const shots=[
    ['01_front_left',[4.7,2.5,5.5],[]],['02_rear_left',[4.7,2.5,-5.5],[]],['03_left_side',[6,.95,0],[]],
    ['04_front',[0,1,6],[]],['05_rear',[0,1,-6],[]],
    ['06_hood_removed',[3.7,3.7,4.8],['hood_stock']],
    ['07_fenders_removed',[4.7,2.3,5.5],['fender_fl_stock','fender_fr_stock']],
    ['08_front_bumper_removed',[4.7,2.3,5.5],['bumper_front_stock','chin_front_stock','lip_front_stock']],
    ['09_rear_bumper_removed',[4.7,2.3,-5.5],['bumper_rear_stock']],
    ['10_skirts_removed',[5.5,1.8,4],['sideskirt_l_stock','sideskirt_r_stock']],
    ['11_spoiler_removed',[4.7,2.5,-5.5],['spoiler_rear_stock']],
    ['12_trunk_removed',[4.7,3.2,-5.5],['trunk_stock','spoiler_rear_stock']],
    ['13_underside',[4,-3,3],[]],['14_exploded',[6,3.4,6],[],true],
  ];
  const evidence=[];
  for(const [name,camera,hidden,explode] of shots){
    const result=await page.evaluate(({camera,hidden,explode})=>{
      const d=window.viewerDebug;document.querySelector('#all').click();
      const slider=document.querySelector('#explode');slider.value=explode?'65':'0';slider.dispatchEvent(new Event('input',{bubbles:true}));
      d.model.traverse(n=>{n.visible=true;});
      for(const name of hidden){const node=d.model.getObjectByName(name);if(!node)throw new Error('Missing removal node '+name);node.visible=false;}
      d.camera.position.set(...camera);d.controls.target.set(0,.72,0);d.controls.update();d.camera.lookAt(d.controls.target);
      return hidden.map(name=>({name,hidden:!d.model.getObjectByName(name).visible}));
    },{camera,hidden,explode:!!explode});
    await page.waitForTimeout(140);await page.locator('canvas').first().screenshot({path:resolve(preview,`${name}.png`)});evidence.push({view:name,hidden:result});
  }
  // A compact review sheet made from the actual exported-GLB screenshots.
  await page.setViewportSize({width:1600,height:Math.ceil(shots.length/4)*290});
  await page.setContent(`<html><style>body{margin:0;background:#aeb6b5;font:14px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr)}figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;top:8px;left:10px;color:#253331;font-size:11px}</style><main>${shots.map(([n])=>`<figure><img src="${pathToFileURL(resolve(preview,n+'.png')).href}"><figcaption>${n.replaceAll('_',' ').toUpperCase()}</figcaption></figure>`).join('')}</main></html>`);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:resolve(preview,'contact_sheet.png'),fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  writeFileSync(resolve(dir,'preview-validation.json'),JSON.stringify({renderer:'Three.js in headless Chrome through the bundled workshop viewer',source:'lancer_box_1983_modular.glb',pageErrors:errors,views:evidence},null,2)+'\n');
  console.log(`Rendered ${shots.length} exported-model views and contact sheet`);
}finally{await browser.close();}
