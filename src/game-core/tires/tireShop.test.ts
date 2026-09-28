import { describe, expect, it } from 'vitest';
import { TIRE_PRICES, TireSession, applyTireService, performStep, puncture, tireServiceLines } from '.';

const pay = () => undefined;
const lineIds = (tires: TireSession) => tireServiceLines(tires, 'car').map(l => l.id);

describe('talyer tire service', () => {
  it('offers nothing for a healthy car', () => {
    const tires = new TireSession();
    expect(tireServiceLines(tires, 'car')).toEqual([]);
  });

  it('plugs a young leak, but a worn leaking tire needs new rubber', () => {
    const tires = new TireSession();
    const car = tires.vehicle('car');
    const fl = tires.assembly(car.corners.FL)!, fr = tires.assembly(car.corners.FR)!;
    puncture(fl, 'SLOW_LEAK'); fl.pressureKpa = 150;
    puncture(fr, 'RAPID_LEAK'); fr.health = .4;
    expect(lineIds(tires)).toEqual(expect.arrayContaining([`patch:${fl.id}`, `tire:${fl.id}`, `tire:${fr.id}`]));
    expect(lineIds(tires)).not.toContain(`patch:${fr.id}`);
    expect(applyTireService(tires, 'car', `patch:${fl.id}`, pay)).toMatchObject({ line: { costPhp: TIRE_PRICES.patch } });
    expect(tires.mounted('car', 'FL')).toMatchObject({ failure: 'HEALTHY', pressureKpa: 220, leakKpaPerMin: 0 });
  });

  it('new rubber keeps the rim damage; the rim is its own job', () => {
    const tires = new TireSession();
    const tire = tires.mounted('car', 'RL')!;
    Object.assign(tire, { failure: 'DESTROYED', health: 0, pressureKpa: 0, rimDamage: .7 });
    applyTireService(tires, 'car', `tire:${tire.id}`, pay);
    expect(tires.mounted('car', 'RL')).toMatchObject({ failure: 'HEALTHY', health: 1, rimDamage: .7 });
    const rim = tireServiceLines(tires, 'car').find(l => l.kind === 'rim')!;
    expect(rim).toMatchObject({ label: expect.stringMatching(/^Replace rim/), costPhp: TIRE_PRICES.rimReplace });
    applyTireService(tires, 'car', rim.id, pay);
    expect(tires.mounted('car', 'RL')!.rimDamage).toBe(0);
  });

  it('fits a road tire over a donut and puts the donut back in the well', () => {
    const tires = new TireSession();
    const car = tires.vehicle('car');
    const flat = car.corners.FR!, donut = car.spare!;
    puncture(tires.assembly(flat)!, 'BLOWOUT');
    for (const step of ['loosen', 'raise', 'remove', 'stow', 'take_spare', 'install', 'lower', 'tighten'] as const)
      expect(performStep(tires, 'car', step, step === 'stow' || step === 'take_spare' || step === 'lower' ? null : 'FR', { speedKmh: 0 })).toBeUndefined();
    expect(tires.vehicle('car').corners.FR).toBe(donut);
    applyTireService(tires, 'car', 'fit:FR', pay);
    const after = tires.vehicle('car');
    expect(after.corners.FR).not.toBe(donut);
    expect(tires.mounted('car', 'FR')!.spec).toBe('standard');
    expect(after.spare).toBe(donut);
    expect(after.trunk).toEqual([flat]);
  });

  it('sells a spare and tools when missing, and a refused payment changes nothing', () => {
    const tires = new TireSession();
    tires.mutate('car', c => { c.spare = null; c.jack = false; c.wrench = false; });
    expect(lineIds(tires)).toEqual(['spare', 'jack', 'wrench']);
    const before = tires.snapshot();
    expect(applyTireService(tires, 'car', 'jack', () => ({ rejected: 'Not enough money.' }))).toEqual({ rejected: 'Not enough money.' });
    expect(tires.snapshot()).toEqual(before);
    let charged = 0;
    for (const id of ['spare', 'jack', 'wrench']) applyTireService(tires, 'car', id, line => { charged += line.costPhp; });
    expect(charged).toBe(TIRE_PRICES.donut + TIRE_PRICES.jack + TIRE_PRICES.wrench);
    expect(tires.vehicle('car')).toMatchObject({ jack: true, wrench: true });
    expect(tires.assembly(tires.vehicle('car').spare)!.spec).toBe('donut');
    expect(lineIds(tires)).toEqual([]);
  });

  it('refuses work mid wheel change and stale lines', () => {
    const tires = new TireSession();
    puncture(tires.mounted('car', 'FL')!, 'BLOWOUT');
    performStep(tires, 'car', 'loosen', 'FL', { speedKmh: 0 });
    const id = `tire:${tires.vehicle('car').corners.FL}`;
    expect(applyTireService(tires, 'car', id, pay)).toEqual({ rejected: 'Finish the roadside wheel change first' });
    expect(applyTireService(tires, 'car', 'air:nope', pay)).toEqual({ rejected: 'That service is no longer needed' });
  });
});
