import { afterEach, expect, it } from 'vitest';
import { GameBridge } from '../bridge';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import type { PersistencePort } from '../../game-core/persistence/PersistencePort';
import { CarDealerSystem, carDealerRejection, type CarDealerQuote, type CarDealerView } from './CarDealerSystem';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { interactablesFromZones } from '../interaction/Interaction';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { PlayerMode } from '../player/PlayerMode';

const release: (() => void)[] = [];
afterEach(() => release.splice(0).reverse().forEach(off => off()));
const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap(c => c.zones));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setup({ persistent = true, owned = ['banwa_dalagan_1996'] as string[] } = {}) {
  const bridge = new GameBridge(), wallet = new VehicleSession();
  const sent: Record<string, unknown>[] = [];
  if (persistent) wallet.usePersistence({ execute: async (action: Record<string, unknown>) => {
    sent.push(action);
    return { resourceId: 'vehicle-uuid', sequence: 7, details: {} };
  } } as unknown as PersistencePort);
  const focus = { position: new Vector3(79, 0, 156), mode: 'walking' as PlayerMode, racing: false };
  const interactions = new InteractionSystem(bridge.runtime, focus, [() => zones]);
  const dealer = new CarDealerSystem(bridge.runtime, wallet, owned, interactions, () => carDealerRejection(focus, zones));
  const result: { view: CarDealerView | null; quote: CarDealerQuote | null; bought: string[]; errors: string[] } = { view: null, quote: null, bought: [], errors: [] };
  bridge.ui.events.on('carDealer', view => { result.view = view; });
  bridge.ui.events.on('carDealerQuote', quote => { result.quote = quote; });
  bridge.ui.events.on('carPurchased', car => result.bought.push(car.definitionId));
  bridge.ui.events.on('commandRejected', e => result.errors.push(e.reason));
  release.push(() => bridge.dispose(), () => interactions.dispose(), () => dealer.dispose());
  return { commands: bridge.ui.commands, focus, dealer, result, sent };
}

it('lists the catalogue at the hub lot and buys an unowned car through the server', async () => {
  const s = setup();
  s.commands.interact();
  expect(s.result.view?.listings.map(l => [l.definitionId, l.owned])).toEqual([
    ['banwa_dalagan_1996', true], ['hiraya_kidlat_1997', false], ['banwa_silak_1983', false], ['hiraya_kidlat_fd_2007', false]]);
  expect(s.result.view?.listings.find(l => l.definitionId === 'banwa_silak_1983')?.pricePhp).toBe(165000);
  s.commands.quoteCar('banwa_dalagan_1996');
  expect(s.result.errors.at(-1)).toMatch(/already own/);
  s.commands.quoteCar('hiraya_kidlat_1997');
  s.commands.buyCar(s.result.quote!.id);
  await flush();
  expect(s.sent).toEqual([{ type: 'vehicle_purchase', operationTag: expect.stringMatching(/^dealer:/), definitionId: 'hiraya_kidlat_1997' }]);
  expect(s.result.bought).toEqual(['hiraya_kidlat_1997']);
  expect(s.result.quote).toBeNull();
  expect(s.result.view?.listings.find(l => l.definitionId === 'hiraya_kidlat_1997')?.owned).toBe(true);
});

it('quotes and purchases the FD, then refuses a duplicate purchase', async () => {
  const s = setup();
  s.commands.openCarDealer();
  s.commands.quoteCar('hiraya_kidlat_fd_2007');
  expect(s.result.quote?.listing).toMatchObject({ definitionId: 'hiraya_kidlat_fd_2007', pricePhp: 325000, owned: false });
  s.commands.buyCar(s.result.quote!.id);
  await flush();
  expect(s.result.bought).toEqual(['hiraya_kidlat_fd_2007']);
  expect(s.sent[0]).toMatchObject({ type: 'vehicle_purchase', definitionId: 'hiraya_kidlat_fd_2007' });
  expect(s.result.view?.listings.find(l => l.definitionId === 'hiraya_kidlat_fd_2007')?.owned).toBe(true);
  s.commands.quoteCar('hiraya_kidlat_fd_2007');
  expect(s.result.errors.at(-1)).toMatch(/already own/);
});

it('refuses away from the lot, while driving or racing, and without an account', () => {
  const s = setup();
  s.focus.position.x = 58;
  s.commands.openCarDealer();
  expect(s.result.view).toBeNull();
  s.focus.position.x = 79; s.focus.mode = 'driving';
  s.commands.openCarDealer();
  expect(s.result.errors.at(-1)).toMatch(/walk/);
  s.focus.mode = 'walking';
  s.commands.openCarDealer();
  s.focus.racing = true; s.dealer.update();
  expect(s.result.view).toBeNull();
  const local = setup({ persistent: false });
  local.commands.openCarDealer();
  expect(local.result.view).toBeNull();
  expect(local.result.errors.at(-1)).toMatch(/Sign in/);
});
