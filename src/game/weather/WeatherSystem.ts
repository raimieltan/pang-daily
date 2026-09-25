import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { GameSystem } from '../engine/types';
import type { RuntimePort } from '../bridge';
import type { PlayerVehicle } from '../vehicles/PlayerVehicle';
import type { WorldKit } from '../world/WorldChunk';
import type { SceneLighting } from '../rendering/SceneLighting';
import { WEATHER_TYPES,weatherAt,type WeatherType } from './Weather';
/** Weather follows altitude, with local rain streaks and a wet tire multiplier independent of presets. */
export class WeatherSystem implements GameSystem {
 readonly name='weather';private release:()=>void;private rain;private elapsed=0;
 constructor(private scene:Scene,private kit:WorldKit,private lighting:SceneLighting,private player:PlayerVehicle,bridge:RuntimePort,private weather:WeatherType){
  this.release=bridge.handle('setWeather',({weather})=>{if(!WEATHER_TYPES.includes(weather))return {rejected:'Unknown weather'};this.weather=weather;bridge.emit('weatherChanged',{weather});});
  const lines=Array.from({length:180},(_,i)=>{const x=Math.sin(i*23)*22,z=Math.cos(i*37)*22,y=(i%17)*1.4;return [new Vector3(x,y,z),new Vector3(x-.15,y-.85,z+.12)];});
  this.rain=MeshBuilder.CreateLineSystem('rain-streaks',{lines},scene);this.rain.color=new Color3(.65,.72,.75);this.rain.alpha=.35;this.rain.isPickable=false;
  this.update(0);
  bridge.emit('weatherChanged',{weather});
 }
 update(dt:number){
  const p=this.player.position,w=weatherAt(this.weather,p.y);
  // Existing time-of-day controls still own colour and light mood.
  this.scene.fogDensity=w.density;
  this.kit.lit.diffuseColor.setAll(w.wetness?.68:1);
  this.kit.lit.specularColor.setAll(w.wetness?.28:0);this.kit.lit.specularPower=72;
  this.lighting.key.specular.setAll(w.wetness?.6:0);
  this.player.controller.model.surfaceGrip=w.grip;
  this.rain.setEnabled(this.weather==='rain');this.elapsed+=dt;
  this.rain.position.set(p.x,p.y+4-(this.elapsed*14)%12,p.z);
 }
 dispose(){this.release();this.rain.dispose();this.player.controller.model.surfaceGrip=1;}
}
