import { raceValidation } from './raceValidation';
import { createRoot } from 'react-dom/client';
import { GameBridge } from '@/game/bridge/GameBridge';
import { InputManager } from '@/game/input/InputManager';
import { DialogueController } from '@/game/social/DialogueController';
import { SocialOpportunityService } from '@/game/social/SocialOpportunityService';
import { loadSocialSession, SOCIAL_SESSION_KEY } from '@/game/social/socialStorage';
import { loadVehicleSession } from '@/game/maintenance/sessionStorage';
import { loadInventorySession, loadMarketplaceSession, MARKET_SESSION_KEY } from '@/game/marketplace/marketStorage';
import { MarketplaceService } from '@/game/marketplace/MarketplaceService';
import { MaintenanceSystem } from '@/game/maintenance/MaintenanceSystem';
import { generateListing } from '@/game-core/marketplace/listings';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindMarketStore } from '@/state/marketStore';
import { bindMaintenanceStore } from '@/state/maintenanceStore';
import { bindSocialStore } from '@/state/socialStore';
import { MarketplaceApp } from '@/components/hud/MarketplaceApp';
import { RepairPanel } from '@/components/hud/RepairPanel';
import { SocialFeedback } from '@/components/hud/SocialFeedback';
import { RecognitionBadge } from '@/components/hud/RecognitionBadge';
import { DialogueBox } from '@/components/hud/DialogueBox';

const bridge = new GameBridge();
const input = new InputManager(window, undefined, () => []);
const dialogue = new DialogueController(bridge.runtime, input, sessionStorage);
const opportunities = new SocialOpportunityService(bridge.runtime, sessionStorage);
const wallet = loadVehicleSession(sessionStorage);
wallet.useSocialAccess(opportunities.access);
const inventory = loadInventorySession(sessionStorage);
if (!sessionStorage.getItem(MARKET_SESSION_KEY)) {
 const listing = { ...generateListing(5, 'browser-suki', Date.now()), askingPricePhp: 1000, sellerId: 'jun_surplus' };
 sessionStorage.setItem(MARKET_SESSION_KEY, JSON.stringify({ version: 1, seed: 42, serial: 10, listings: [listing] }));
}
const market = loadMarketplaceSession(wallet, inventory, sessionStorage);
market.useSocialAccess(opportunities.access);
const phone = new MarketplaceService(bridge.runtime, market);
phone.useWorkshop({ rejection: () => null });
bindGameUiStore(bridge.ui); bindMarketStore(bridge.ui.events); bindMaintenanceStore(bridge.ui.events); bindSocialStore(bridge.ui.events, sessionStorage);
new MaintenanceSystem(bridge.runtime, wallet, {
 definition: { spec: car }, impactSerial: 0, impactStrength: 0,
 maintenanceSample: () => ({ speedMps: 0, throttle: 0, brake: 0, slip: 0, handbrake: 0, grounded: true, racing: false }),
 setCondition: () => {},
}, () => false, () => false, { rejection: () => null, interactions: { handle: () => () => {} } });
const notices: string[] = [];
bridge.ui.events.on('socialOpportunityDiscovered', notice => notices.push(notice.id));
createRoot(document.getElementById('root')!).render(<><RecognitionBadge showNotices={false} /><SocialFeedback /><MarketplaceApp /><RepairPanel /><DialogueBox /></>);

Object.assign(window, { socialUnlockTest: {
 seed: () => {
  const session = loadSocialSession(sessionStorage);
  session.applyEvent({ type: 'dialogue', eventId: 'intro-casey', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  for (let i = 0; i < 2; i++) session.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: `race:${i}`, sourceId: `race:${i}`, attemptId: `race:${i}`, npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 120000 });
  session.chooseConversation('casey_intro', 'casey_post_race', 'congratulate_casey');
  for (const [npcId, dialogueId] of [['mang_boy', 'talyer_mang_boy'], ['jun_surplus', 'seller_jun_surplus']]) session.applyEvent({ type: 'dialogue', eventId: `dialogue:${npcId}:${dialogueId}`, sourceId: dialogueId, npcId, dialogueId });
  const state = session.snapshot();
  state.npcs.jun_surplus.trust = 52;
  state.npcs.mang_boy.trust = 58;
  state.favors.mang_boy_parts_help = { favorId: 'mang_boy_parts_help', npcId: 'mang_boy', status: 'completed', runId: 'talyer_oil_errand#1' };
  sessionStorage.setItem(SOCIAL_SESSION_KEY, JSON.stringify(state));
 },
 sukiTitle: () => market.view().listings.find(listing => listing.id === 'browser-suki')?.title,
 tick: () => opportunities.update(1), notices: () => notices,
 raceAccess: () => opportunities.raceRejection('the_wall'),
 crewRaceAccess: () => opportunities.raceRejection('midnight_run'),
 chooseCrew: (id: string) => dialogue.choose(id),
 lose: () => {
  const state = loadSocialSession(sessionStorage).snapshot();
  state.npcs.jun_surplus.trust = 0; state.npcs.mang_boy.trust = 0; state.npcs.casey.trust = 0; state.reputation.iloilo_scene.points = 0;
  sessionStorage.setItem(SOCIAL_SESSION_KEY, JSON.stringify(state));
 },
 openMarket: () => bridge.ui.commands.openMarketplace(), closeMarket: () => bridge.ui.commands.closeMarketplace(),
 openRepair: () => bridge.ui.commands.inspectVehicle(), closeRepair: () => bridge.ui.commands.dismissRepair(),
 openCrew: () => dialogue.open('casey_intro'), closeCrew: () => dialogue.close(),
 wallet: () => wallet.snapshot(), inventory: () => inventory.snapshot(), social: () => loadSocialSession(sessionStorage).snapshot(),
} });
