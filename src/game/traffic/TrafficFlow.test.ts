import { describe, expect, it } from 'vitest';
import { TrafficFlow } from './TrafficFlow';

const player = { x: 0, y: 0, z: 0, speed: 0, heading: 0 };
const lane = [0, 500, 1000, 1500].map(x => ({ x, y: 0, z: 0, speed: 10 }));

describe('traffic lifecycle', () => {
  it('removes a distant arrival even when its respawn point is occupied by the player', () => {
    const flow = new TrafficFlow([lane, lane], player, 1);
    const actor = flow.actors[0];
    actor.active = true;
    actor.follower.position = { ...lane[3] };
    actor.follower.segment = lane.length;
    flow.update(.1, player);
    expect(actor.active).toBe(false);
    expect(actor.follower.position.x).toBe(1500);
  });

  it('does not teleport an arrival still inside the rendering distance', () => {
    const observer = { ...player, x: 1000 };
    const flow = new TrafficFlow([lane, lane], observer, 1);
    const actor = flow.actors[0];
    actor.active = true;
    actor.follower.position = { ...lane[3] };
    actor.follower.segment = lane.length;
    flow.update(.1, observer);
    expect(actor.active).toBe(true);
    expect(actor.follower.position.x).toBe(1500);
  });

  it('keeps driving around a closed town route while the player watches', () => {
    const loop = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]
      .map(([x, z]) => ({ x, y: 0, z, speed: 10 }));
    const observer = { ...player, x: 50, z: 50 };
    const flow = new TrafficFlow([loop, loop], observer, 1);
    const actor = flow.actors[0];
    actor.active = true;
    actor.follower.position = { ...loop[0] };
    actor.follower.segment = loop.length;
    actor.follower.speed = 10;
    flow.update(.1, observer);
    expect(actor.follower.departed).toBe(false);
    expect(actor.follower.position.x).toBeGreaterThan(0);
    expect(actor.follower.speed).toBeGreaterThan(9);
  });

  it('populates the local routes at scene creation without spawning on the player', () => {
    const local = [0, 50, 100, 150, 200].map(x => ({ x, y: 0, z: 50, speed: 8 }));
    const flow = new TrafficFlow([lane, lane, local, local], player, 12);
    const locals = flow.actors.filter(a => a.follower.points[0].z === 50);
    expect(locals).toHaveLength(6);
    expect(locals.every(a => a.active)).toBe(true);
    expect(flow.actors.filter(a => a.active).every(a => Math.hypot(a.follower.position.x, a.follower.position.z) > 20)).toBe(true);
  });
});

 it('does not recycle a stalled loop into the player view', () => {
   const loop = [...lane, lane[0]];
   const flow = new TrafficFlow([loop], player, 1);
   const actor = flow.actors[0];
   actor.active = false;
   actor.follower.position = { ...lane[3] };
   actor.follower.segment = loop.length;
   flow.update(.1, player);
   expect(actor.active).toBe(false);
   expect(actor.follower.position.x).toBe(1500);
 });
