import { describe,it,expect } from 'vitest';
import { ROAD,ROUTE_LENGTH,MOUNTAIN_RACES,laneWaypoints,roadAt } from './route';
import { Race, WaypointRival } from '../../races/Race';
import { MOUNTAIN_CHUNKS } from './environment';
describe('Alimodian–Maasin road',()=>{
 it('is continuous, narrow and graded without abrupt steps',()=>{
  expect(ROUTE_LENGTH).toBeGreaterThan(6000);expect(ROUTE_LENGTH).toBeLessThan(9000);
  for(let i=1;i<ROAD.length;i++){
   const a=ROAD[i-1],b=ROAD[i],d=Math.hypot(b.x-a.x,b.z-a.z);
   expect(d).toBeLessThanOrEqual(5.01);expect(Math.abs(b.y-a.y)/d).toBeLessThan(.15);
   if(b.s>160)expect(b.width).toBe(6.2);
  }
 });
 for(const route of MOUNTAIN_RACES)it(`rival completes ordered gates in ${route.id}`,()=>{
  const race=new Race(route);race.start();race.update(3,route.start);
  for(let t=0;t<600&&!race.opponent.finished;t+=1/30)race.update(1/30,route.start);
  expect(race.opponent.finished).toBe(true);expect(race.opponentTime).toBeGreaterThan(300);expect(race.opponentTime).toBeLessThan(480);
 });
 it('both traffic lanes traverse the road without crossing the centreline',()=>{
  for(const direction of [1,-1] as const){
   const points=laneWaypoints(direction);const follower=new WaypointRival(points);
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
