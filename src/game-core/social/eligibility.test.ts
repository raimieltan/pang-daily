import { describe, expect, it } from 'vitest';
import { SOCIAL_CONTENT } from './catalog';
import { createSocialState, SocialSession } from './SocialSession';
import { discountedPrice, evaluateEligibility } from './eligibility';
import { opportunity } from './opportunities';
import { VehicleSession } from '../maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car } from '../vehicles';
import { MarketplaceSession } from '../marketplace/MarketplaceSession';
import { generateListing } from '../marketplace/listings';
import { InventorySession } from '../inventory/InventorySession';
import { JobSession } from '../jobs/JobSession';
import { HUB_JOBS } from '@/game/jobs/hubJobs';

function standing() {
 const state = createSocialState(SOCIAL_CONTENT);
 state.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: 12 };
 state.npcs.casey.introduced = true;
 state.npcs.casey.eventIds.push('met_casey_at_kyo');
 state.npcs.casey.respect = 55;
 state.npcs.casey.relationshipFlags.push('trusted_friend');
 state.npcs.jun_surplus.trust = 52;
 state.npcs.mang_boy.trust = 58;
 state.favors.mang_boy_parts_help = { favorId: 'mang_boy_parts_help', npcId: 'mang_boy', status: 'completed', runId: 'talyer_oil_errand#1' };
 return state;
}
describe('social opportunities', () => {
 it('combines thresholds, relationship flags, crew standing, and event history with readable reasons', () => {
  const state = standing();
  expect(evaluateEligibility(opportunity('kyo_crew_invitation'), state).eligible).toBe(true);
  state.npcs.casey.respect = 54;
  state.reputation.iloilo_scene.points = 11;
  state.crews.kyo_regulars = { crewId: 'kyo_regulars', points: -1, membership: 'none', invitation: 'none', introduced: true, joins: 0 };
  expect(evaluateEligibility(opportunity('kyo_crew_invitation'), state).unmetRequirements).toHaveLength(3);
  state.npcs.casey.eventIds = [];
  expect(evaluateEligibility(opportunity('casey_wall_invitation'), state).unmetRequirements).toContain('Meet Casey at Kyo');
 });
 it.each([['jun_suki_offer', 'jun_surplus', 52], ['mang_boy_service', 'mang_boy', 58]] as const)('%s is inclusive at trust threshold', (id, npcId, minimum) => {
  const state = standing();
  state.npcs[npcId].trust = minimum - 1;
  expect(evaluateEligibility(opportunity(id), state).eligible).toBe(false);
  state.npcs[npcId].trust = minimum;
  expect(evaluateEligibility(opportunity(id), state).eligible).toBe(true);
 });
 it('evaluates purely and discovers only once, including after reload and standing loss', () => {
  const state = standing(); const before = structuredClone(state);
  for (let i = 0; i < 5; i++) evaluateEligibility(opportunity('casey_wall_invitation'), state);
  expect(state).toEqual(before);
  const social = new SocialSession(SOCIAL_CONTENT, state);
  expect(social.discoverOpportunities()).toHaveLength(4);
  expect(social.discoverOpportunities()).toEqual([]);
  const saved = social.snapshot();
  saved.reputation.iloilo_scene.points = 0;
  saved.npcs.casey.trust = 0;
  saved.npcs.jun_surplus.trust = 0;
  const restored = new SocialSession(SOCIAL_CONTENT, saved);
  expect(restored.discoverOpportunities()).toEqual([]);
  expect(evaluateEligibility(opportunity('casey_wall_invitation'), restored.snapshot())).toMatchObject({ discovered: true, eligible: true });
  expect(evaluateEligibility(opportunity('jun_suki_offer'), restored.snapshot())).toMatchObject({ discovered: true, eligible: false });
 });
 it('rechecks crew acceptance and commits membership through the conversation path', () => {
  const social = new SocialSession(SOCIAL_CONTENT, standing()); social.discoverOpportunities();
  social.chooseConversation('casey_intro', 'kyo_crew', 'crew_invite');
  const poor = social.snapshot(); poor.npcs.casey.trust = 49;
  const lost = new SocialSession(SOCIAL_CONTENT, poor);
  expect(() => lost.chooseConversation('casey_intro', 'kyo_crew', 'crew_accept')).toThrow('unavailable');
  expect(lost.snapshot().crews.kyo_regulars.invitation).toBe('invited');
  social.chooseConversation('casey_intro', 'kyo_crew', 'crew_accept');
  expect(social.snapshot().crews.kyo_regulars.membership).toBe('member');
 });
 it('clamps discounts and never compounds or creates negative prices', () => {
  expect(discountedPrice(150, 10)).toBe(135);
  expect(discountedPrice(150, 200)).toBe(0);
  expect(discountedPrice(150, -10)).toBe(150);
  expect(() => discountedPrice(150, NaN)).toThrow();
 });
});

function marketSetup() {
 let state = standing(); let time = 1000;
 const wallet = new VehicleSession(); const inventory = new InventorySession();
 const listing = { ...generateListing(5, 'suki-part', time), sellerId: 'jun_surplus', askingPricePhp: 1000 };
 const saved = { version: 1, seed: 42, serial: 10, listings: [listing] };
 const market = new MarketplaceSession(wallet, inventory, saved, undefined, () => time);
 const access = (id: string) => evaluateEligibility(opportunity(id), state);
 market.useSocialAccess(access);
 return { market, wallet, inventory, listing, access, lose: () => { state = createSocialState(SOCIAL_CONTENT); }, expire: () => { time = listing.expiresAt; } };
}
describe('authoritative social prices and execution', () => {
 it('quotes an offer without exposing hidden condition and charges/delivers the discounted price once', () => {
  const { market, wallet, inventory, listing } = marketSetup();
  const view = market.view().listings.find(l => l.id === listing.id)!;
  expect(view).toMatchObject({ offerId: 'jun_suki_offer', offerPricePhp: 900, askingPricePhp: 1000 });
  expect(JSON.stringify(view)).not.toContain('actualCondition');
  expect(market.buy(listing.id, view.offerId)).toMatchObject({ pricePhp: 900, part: { paidPhp: 900, actual: null } });
  expect(wallet.snapshot().walletPhp).toBe(4100);
  expect(inventory.items()).toHaveLength(1);
  expect(market.buy(listing.id, view.offerId)).toHaveProperty('rejected');
  expect(wallet.snapshot().transactions.filter(tx => tx.kind === 'parts_purchase')).toHaveLength(1);
 });
 it.each(['lost', 'expired', 'broke'] as const)('rejects %s offers without payment or delivery', scenario => {
  const { market, wallet, inventory, listing, lose, expire } = marketSetup();
  if (scenario === 'lost') lose();
  if (scenario === 'expired') expire();
  if (scenario === 'broke') wallet.spend(4999, { kind: 'test', source: 'test', description: 'Spend cash' });
  const before = wallet.snapshot();
  const result = market.buy(listing.id, 'jun_suki_offer');
  expect(result).toHaveProperty('rejected');
  expect(wallet.snapshot()).toEqual(before);
  expect(inventory.items()).toEqual([]);
 });
 it('rejects unknown offers and offers for another seller before payment', () => {
  const { market, wallet, inventory, listing } = marketSetup();
  const before = wallet.snapshot();
  expect(market.buy(listing.id, 'invented-offer')).toMatchObject({ rejected: 'Unknown seller offer.' });
  const other = market.view().listings.find(item => item.seller.id !== 'jun_surplus')!;
  expect(market.buy(other.id, 'jun_suki_offer')).toMatchObject({ rejected: 'This seller offer does not apply to that listing.' });
  expect(wallet.snapshot()).toEqual(before);
  expect(inventory.items()).toEqual([]);
 });
 it('keeps offer prices consistent across reopening/reload and ledger recovery preserves the price paid', () => {
  const { market, wallet, inventory, listing, access } = marketSetup();
  const saved = market.snapshot();
  const reload = new MarketplaceSession(wallet, inventory, saved, undefined, () => 1000); reload.useSocialAccess(access);
  expect(reload.view().listings.find(l => l.id === listing.id)?.offerPricePhp).toBe(900);
  reload.buy(listing.id, 'jun_suki_offer');
  const recoveredInventory = new InventorySession();
  const recovered = new MarketplaceSession(new VehicleSession(wallet.snapshot()), recoveredInventory, saved, undefined, () => 1000);
  expect(recovered.view().parts[0]).toMatchObject({ paidPhp: 900, actual: null });
  expect(recoveredInventory.items()).toHaveLength(1);
 });
 it('repair quote and receipt agree, reject lost benefit, and preserve ordinary repair access', () => {
  let state = standing(); const wallet = new VehicleSession();
  wallet.useSocialAccess(id => evaluateEligibility(opportunity(id), state));
  const first = wallet.quote(car); const second = wallet.quote(car);
  expect(second.lines).toEqual(first.lines);
  const reloaded = new VehicleSession(wallet.snapshot()); reloaded.useSocialAccess(id => evaluateEligibility(opportunity(id), state));
  expect(reloaded.quote(car).lines).toEqual(first.lines);
  state.npcs.mang_boy.trust = 0;
  const before = wallet.snapshot();
  expect(wallet.repair(car, first, ['brakes'])).toHaveProperty('rejected');
  expect(wallet.snapshot()).toEqual(before);
  const basic = wallet.quote(car); expect(basic.benefitId).toBeUndefined();
  expect(wallet.repair(car, basic, ['brakes'])).not.toHaveProperty('rejected');
  state = standing();
  const discounted = wallet.quote(car);
  expect(wallet.repair(car, discounted, ['tires'])).toMatchObject({ costPhp: discounted.lines.find(line => line.component === 'tires')!.costPhp });
 });
 it('does not gate repeatable income on social standing', () => {
  const wallet = new VehicleSession();
  wallet.useSocialAccess(id => evaluateEligibility(opportunity(id), createSocialState(SOCIAL_CONTENT)));
  const jobs = new JobSession(wallet, HUB_JOBS);
  const context = { mode: 'driving' as const, hasVehicle: true, fuelLiters: 20, speedKmh: 0, racing: false };
  for (let run = 0; run < 2; run++) {
   expect(jobs.accept('kyo_ice_run')).not.toHaveProperty('rejected');
   expect(jobs.begin(context)).not.toHaveProperty('rejected');
   jobs.completeObjective('pickup');
   expect(jobs.completeObjective('dropoff')).toMatchObject({ ended: { status: 'completed', payoutPhp: 450 } });
  }
  expect(wallet.snapshot().walletPhp).toBe(5900);
 });
});
