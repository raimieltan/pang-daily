import { describe,it,expect } from 'vitest';
import { ROAD,ROUTE_LENGTH,MOUNTAIN_ROAD_WIDTH,MOUNTAIN_RACES,laneWaypoints,roadAt,nearestRoad } from './route';
import { CheckpointProgress } from '../../races/Race';
import { TrafficFollower } from '../../traffic/TrafficFlow';
import { MOUNTAIN_CHUNKS } from './environment';
describe('Alimodian–Maasin road',()=>{
 it('is continuous, four lanes wide and graded without abrupt steps',()=>{
  expect(ROUTE_LENGTH).toBeGreaterThan(6000);expect(ROUTE_LENGTH).toBeLessThan(9000);
  for(let i=1;i<ROAD.length;i++){
   const a=ROAD[i-1],b=ROAD[i],d=Math.hypot(b.x-a.x,b.z-a.z);
   expect(d).toBeLessThanOrEqual(5.01);expect(Math.abs(b.y-a.y)/d).toBeLessThan(.15);
   expect(b.width).toBe(MOUNTAIN_ROAD_WIDTH);
  }
 });
 it('keeps utility poles outside every traffic lane',()=>{
  const poles=MOUNTAIN_CHUNKS.flatMap(chunk=>chunk.props).filter(prop=>prop.prop==='utility_pole'||prop.prop==='utility_pole_transformer');
  expect(poles.length).toBeGreaterThan(10);
  for(const pole of poles){
   const nearest=nearestRoad({x:pole.at[0],z:pole.at[1]});
   expect(nearest.distance).toBeGreaterThan(MOUNTAIN_ROAD_WIDTH/2+1);
  }
 });
 for(const route of MOUNTAIN_RACES)it(`road samples cross ordered gates in ${route.id}`,()=>{
  const progress=new CheckpointProgress(route);
  for(let i=1;i<route.waypoints.length;i++)progress.advance(route.waypoints[i-1],route.waypoints[i]);
  expect(progress.finished).toBe(true);
 });
 it('both traffic lanes traverse the road without crossing the centreline',()=>{
  for(const direction of [1,-1] as const){
   const points=laneWaypoints(direction);const follower=new TrafficFollower(points);
   for(const p of points){const c=roadAt(p.s);expect(Math.hypot(p.x-c.x,p.z-c.z)).toBeCloseTo(1.5,3);}
   for(let t=0;t<600&&!follower.departed;t+=.1)follower.update(.1);
   expect(follower.departed).toBe(true);
  }
 });
 it('contains reusable settlement, utility and overlook assets',()=>{
  const props=MOUNTAIN_CHUNKS.flatMap(c=>c.props);
  for(const prop of ['bamboo_cluster','rural_house','sari_store','utility_pole','plastic_chair','motorcycle_parked'])expect(props.some(p=>p.prop===prop)).toBe(true);
  // Slope protection is built from pitched blocks following the road grade.
  const wall=roadAt(ROUTE_LENGTH*.4,-4.5);
  expect(MOUNTAIN_CHUNKS.flatMap(c=>c.blocks).some(b=>b.collide&&b.size[1]>=2.5&&Math.hypot(b.center[0]-wall.x,b.center[2]-wall.z)<5)).toBe(true);
  expect(MOUNTAIN_CHUNKS.flatMap(c=>c.zones).some(z=>z.id==='pahuway-meet')).toBe(true);
 });
});
