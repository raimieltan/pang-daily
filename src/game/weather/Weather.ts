export const WEATHER_TYPES=['clear','rain','fog'] as const;
export type WeatherType=typeof WEATHER_TYPES[number];
export function weatherAt(weather:WeatherType,elevation:number){
 const cloud=Math.max(0,Math.min(1,(elevation-100)/145));
 return {density:weather==='fog'?.0014+cloud*.010:weather==='rain'?.0035+cloud*.002:.00065,
 grip:weather==='rain'?.76:1,wetness:weather==='rain'?1:0};
}
