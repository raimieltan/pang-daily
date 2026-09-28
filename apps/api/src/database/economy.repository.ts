import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import { type PlayerCommand, type CommandReceipt, type TransactionHistory } from '@pang-daily/contracts';
import { getVehicleDefinition } from '@pang-daily/game-core/vehicles/catalog';
import type { VehicleCondition } from '@pang-daily/game-core/vehicles/VehicleDefinition';
import { partDefinition } from '@pang-daily/game-core/parts/parts';
import { InventorySession, type InventorySave } from '@pang-daily/game-core/inventory/InventorySession';
import { previewPerformanceInstall, TALYER_PERFORMANCE, installedPerformanceItems } from '@pang-daily/game-core/performance/installation';
import { checkPerformanceCompatibility } from '@pang-daily/game-core/performance/compatibility';
import { performancePart } from '@pang-daily/game-core/performance/catalog';
import { bodyPart, fitsVehicle, canRefinish } from '@pang-daily/game-core/exterior/index';
import { repairLines, SERVICE_COMPONENTS } from '@pang-daily/game-core/maintenance/condition';
import { AUTO_PARTS_STOCK, AUTO_PARTS_SHOP_ID } from '@pang-daily/game-core/shops/AutoPartsShop';
import { MECHANIC_INSPECTION_PHP, BOARD_SIZE } from '@pang-daily/game-core/marketplace/MarketplaceSession';
import { generateListing, listingView, type Listing } from '@pang-daily/game-core/marketplace/listings';
import { HUB_JOBS } from '@pang-daily/game-core/jobs/catalog';
import { completeObjective, jobPayout, type JobRun } from '@pang-daily/game-core/jobs/jobs';
import { FUEL_PRICE_PHP_PER_LITER } from '@pang-daily/game-core/economy/economy';
import { raceEconomy, raceOutcome } from '@pang-daily/game-core/economy/raceRules';
import { SOCIAL_REPEAT_LIMITS } from '@pang-daily/game-core/social/rules';
import { evaluateEligibility } from '@pang-daily/game-core/social/eligibility';
import { SOCIAL_OPPORTUNITIES, opportunity } from '@pang-daily/game-core/social/opportunities';
import type { Prisma } from '../generated/prisma/client';
import { DatabaseService } from './database.service';
import { loadSocialState } from './social-state';
import { progressSocial } from './social-progression';
import { CHAPTER_ONE, STARTER_ORIGINS } from '@pang-daily/game-core/progression/chapter';
import { advanceChapter } from './chapter-state';
import { runPlayerCommand } from './player-command';
import { resolvePlayer } from './player-context';
import { rejectCommand as refuse, ownedResourceMissing as missing } from '../integrity/errors';

type Tx = Prisma.TransactionClient;
const php = (amount: number) => { if (!Number.isSafeInteger(amount)) throw new Error('Catalog price must be whole PHP'); return BigInt(amount) * 100n; };
const condition = (row: Record<string, unknown>): VehicleCondition => Object.fromEntries(['engine','transmission','suspension','brakes','tires','body','electrical','clutch','cooling'].map(key => [key, Number(row[key])])) as VehicleCondition;
@Injectable()
export class EconomyRepository {
  private readonly logger = new Logger(EconomyRepository.name);
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  private async vehicle(tx: Tx, playerId: string, id: string) {
    const row = await tx.vehicle.findFirst({ where: { id, playerId, retiredAt: null }, include: { condition: true } });
    if (!row || !row.condition) missing();
    return row;
  }
  private async part(tx: Tx, playerId: string, id: string) {
    const row = await tx.ownedPart.findFirst({ where: { id, playerId, retiredAt: null }, include: { installation: true } });
    if (!row) missing(); return row;
  }
  private async eligible(tx: Tx, playerId: string, opportunityId: string) {
    const state = await loadSocialState(tx, playerId);
    return evaluateEligibility(opportunity(opportunityId), state).eligible;
  }
  private async inventory(tx: Tx, playerId: string) {
    const [parts, vehicles, installs] = await Promise.all([
      tx.ownedPart.findMany({ where: { playerId, retiredAt: null } }), tx.vehicle.findMany({ where: { playerId, retiredAt: null } }),
      tx.installedPart.findMany({ where: { playerId }, include: { slots: true } }),
    ]);
    const defs = new Map(vehicles.map(v => [v.id, v.definitionId]));
    const save: InventorySave = { version: 1, serial: parts.length, retiredKeys: [], items: parts.map(p => ({ id: p.id, partId: p.partDefinitionId,
      key: p.acquisitionKey, condition: p.condition === null ? null : Number(p.condition), revealedBy: p.revealedBy, finish: p.finish, acquiredAt: p.acquiredAt.getTime(), origin: { kind: 'grant', reason: 'server-owned' } })),
      installed: {}, appearance: Object.fromEntries(vehicles.map(v => [v.definitionId, { paint: v.paint, rideHeightM: Number(v.rideHeightM) }])) };
    for (const install of installs) { const def = defs.get(install.vehicleId); if (!def) continue; save.installed[def] ??= {}; for (const slot of install.slots) save.installed[def][slot.slotId as keyof typeof save.installed[string]] = install.ownedPartId; }
    return new InventorySession(save);
  }
  private async removeInstallation(tx: Tx, playerId: string, ownedPartId: string) {
    await tx.installedPartSlot.deleteMany({ where: { playerId, ownedPartId } });
    await tx.installedPart.deleteMany({ where: { playerId, ownedPartId } });
  }
  private async settledReceipt(tx: Tx, playerId: string, transactionId: string | null, receipt: CommandReceipt) {
    if (!transactionId) return receipt;
    const payout = await tx.transaction.findFirst({ where: { id: transactionId, playerId } });
    if (!payout) refuse('PLAYER_STATE_INCOMPLETE', 'The saved payout is missing. Progress has not been reset.');
    return { ...receipt, transactionId: payout.id, sequence: payout.sequence.toString(),
      amountCentavos: payout.amountCentavos.toString(), balanceCentavos: payout.balanceAfterCentavos.toString() };
  }
  async execute(userId: string, command: PlayerCommand, requestId: string): Promise<CommandReceipt> {
    const result = await runPlayerCommand(this.db, userId, command, requestId, async ({ tx, player, command }) => {
      const playerId = player.id;
      const wallet = await tx.wallet.findUnique({ where: { playerId } });
      if (!wallet) refuse('PLAYER_STATE_INCOMPLETE', 'The wallet is missing. Progress has not been reset.');
      let receipt: CommandReceipt = { resourceId: null, transactionId: null, sequence: null, amountCentavos: '0', balanceCentavos: wallet.balanceCentavos.toString(), details: {} };
      const pay = async (amount: bigint, kind: string, source: string, reference: string, description: string, vehicleId?: string) => {
        if (amount === 0n) return null;
        const balance = wallet.balanceCentavos + amount;
        if (balance < 0n) refuse('INSUFFICIENT_FUNDS', 'You do not have enough money for this action.');
        if (balance > 9_007_199_254_740_991n) refuse('WALLET_LIMIT', 'This balance exceeds the supported currency range.');
        const transaction = await tx.transaction.create({ data: { playerId, sequence: wallet.revision + 1n, amountCentavos: amount,
          balanceBeforeCentavos: wallet.balanceCentavos, balanceAfterCentavos: balance, kind, source, sourceReference: reference, description, requestId, vehicleId } });
        await tx.wallet.update({ where: { playerId }, data: { balanceCentavos: balance, revision: wallet.revision + 1n } });
        receipt = { ...receipt, transactionId: transaction.id, sequence: transaction.sequence.toString(), amountCentavos: amount.toString(), balanceCentavos: balance.toString() };
        wallet.balanceCentavos = balance; wallet.revision = transaction.sequence;
        return transaction;
      };
      const a = command.action;
      const chapter = await tx.chapterProgress.findUniqueOrThrow({ where: { playerId_chapterId: { playerId, chapterId: CHAPTER_ONE.id } }, include: { markers: true } });
    if (chapter.currentBeatId === 'choose_origin' && a.type !== 'starter_origin' && a.type !== 'chapter_continue' && a.type !== 'dev_grant') refuse('ORIGIN_REQUIRED', 'Choose how you got your daily first.');
      if (a.type === 'job_start' && a.definitionId === CHAPTER_ONE.firstJobId && !chapter.markers.some(m => m.markerId === 'meet_mang_boy')) refuse('JOB_LOCKED', 'Talk to Tito Jun at the talyer first.');
      if (a.type === 'race_start' && [CHAPTER_ONE.firstRaceId, 'pahuway_descent'].includes(a.definitionId) && !chapter.markers.some(m => m.markerId === 'meet_casey')) refuse('RACE_LOCKED', 'Help the talyer, meet the KYO regulars, and talk to Casey first.');
      if (a.type === 'social_introduce' && a.dialogueId === 'kyo_order' && !chapter.markers.some(m => m.markerId === 'complete_first_job')) refuse('SCENE_LOCKED', 'Help Tito Jun with the oil & coolant errand before joining the KYO scene.');
    switch (a.type) {
      case 'dev_grant': {
        if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') refuse('DEV_ONLY', 'Development grants are unavailable here.');
        await pay(php(50_000), 'DEV_GRANT', 'dev_button', command.key, 'Development cash grant');
        receipt.resourceId = command.key;
        break;
      }
        case 'starter_origin': {
          const existing = chapter.markers.find(m => m.markerId === 'choose_origin');
          if (existing) { if (existing.sourceReference !== a.originId) refuse('ORIGIN_ALREADY_CHOSEN', 'Your starter origin is already saved.'); break; }
          if (chapter.currentBeatId !== 'choose_origin') refuse('ORIGIN_ALREADY_CHOSEN', 'Your starter origin is already saved.');
          const origin = STARTER_ORIGINS.find(o => o.id === a.originId)!;
          const car = await tx.vehicle.findFirstOrThrow({ where: { playerId, acquisitionKey: 'starter_vehicle' } });
          await pay(php(origin.cashPhp) - wallet.balanceCentavos, 'STARTER_ORIGIN', 'starter_origin', origin.id, `Starter: ${origin.name}`, car.id);
          await tx.vehicleCondition.update({ where: { vehicleId: car.id }, data: { brakes: origin.brakes, revision: { increment: 1 } } });
          await tx.chapterMarker.create({ data: { playerId, chapterId: CHAPTER_ONE.id, markerId: 'choose_origin', sourceReference: origin.id } });
          receipt.resourceId = origin.id; break;
        }
        case 'social_introduce': case 'social_choice': break;
        case 'chapter_continue': {
          await advanceChapter(tx, playerId, command.key, a.beatId); receipt.resourceId = a.chapterId; break;
        }
        case 'part_purchase': {
          const product = AUTO_PARTS_STOCK.find(p => p.partId === a.definitionId);
          if (!product) throw new BadRequestException({ code: 'UNKNOWN_SHOP_PART', message: 'This part is not stocked at the shop.' });
          const paid = await pay(-php(product.pricePhp), 'PART_PURCHASE', AUTO_PARTS_SHOP_ID, command.key, `Brand new: ${product.name}`);
          const part = await tx.ownedPart.create({ data: { playerId, partDefinitionId: product.partId, acquisitionKey: `${AUTO_PARTS_SHOP_ID}:${paid!.sequence}`, condition: 1, revealedBy: 'known',
            origin: 'parts_shop', sourceReference: AUTO_PARTS_SHOP_ID, paidCentavos: php(product.pricePhp), transactionId: paid!.id } });
          receipt.resourceId = part.id; receipt.details = { name: product.name, pricePhp: product.pricePhp }; break;
        }
        case 'market_purchase': {
          const listing = await tx.marketplaceListing.findFirst({ where: { id: a.listingId, playerId } });
          if (!listing) missing();
          const existing = await tx.ownedPart.findUnique({ where: { playerId_acquisitionKey: { playerId, acquisitionKey: `marketplace:${listing.id}` } }, include: { transaction: true } });
          if (existing) { receipt = { resourceId: existing.id, transactionId: existing.transactionId, sequence: existing.transaction?.sequence.toString() ?? null, amountCentavos: (-(existing.paidCentavos ?? 0n)).toString(), balanceCentavos: wallet.balanceCentavos.toString(), details: { listingId: listing.id, sellerId: listing.sellerId, pricePhp: Number(existing.paidCentavos) / 100 } }; break; }
          if (listing.soldAt || listing.expiresAt <= new Date()) refuse('LISTING_UNAVAILABLE', 'This listing has sold or expired.');
          let cost = listing.askingCentavos;
          if (a.offerId) {
            const benefit = opportunity(a.offerId).benefit;
            if (benefit.kind !== 'seller' || benefit.sellerId !== listing.sellerId || !await this.eligible(tx, playerId, a.offerId)) refuse('BENEFIT_UNAVAILABLE', 'This seller offer is not available.');
            // Existing part provenance uses whole PHP; matches discounted whole catalog listing price.
            cost = (cost * BigInt(100 - benefit.discountPercent) + 50n) / 100n;
            cost = ((cost + 50n) / 100n) * 100n;
          }
          const paid = await pay(-cost, 'PART_PURCHASE', `marketplace:${listing.sellerId}`, listing.id, `Marketplace: ${partDefinition(listing.definitionId)!.name}`);
          const part = await tx.ownedPart.create({ data: { playerId, partDefinitionId: listing.definitionId, acquisitionKey: `marketplace:${listing.id}`,
            condition: listing.actualCondition, origin: 'marketplace', sourceReference: listing.id, sellerId: listing.sellerId, advertisedGrade: listing.advertisedGrade, paidCentavos: cost, transactionId: paid!.id } });
          await tx.marketplaceListing.update({ where: { id: listing.id }, data: { soldAt: new Date() } });
          receipt.resourceId = part.id; receipt.details = { listingId: listing.id, sellerId: listing.sellerId, pricePhp: Number(cost) / 100 }; break;
        }
        case 'part_inspect': {
          const part = await this.part(tx, playerId, a.partId);
          if (part.revealedBy) refuse('ALREADY_INSPECTED', 'This part is already inspected.');
          await pay(-php(MECHANIC_INSPECTION_PHP), 'PART_INSPECTION', 'talyer', command.key, `Inspection: ${partDefinition(part.partDefinitionId)!.name}`);
          await tx.ownedPart.update({ where: { id: part.id }, data: { revealedBy: 'mechanic' } }); receipt.resourceId = part.id; break;
        }
        case 'part_sell': {
          const part = await this.part(tx, playerId, a.partId);
          if (part.installation) refuse('PART_INSTALLED', 'Remove this part before selling it.');
          const definition = partDefinition(part.partDefinitionId)!;
          const basis = BigInt(Math.round((part.condition === null ? 1 : Number(part.condition)) * 100_000_000));
          const sale = php(definition.priceRange[0]) * basis / 100_000_000n / 2n;
          await pay(sale, 'PART_SALE', 'parts_buyback', part.id, `Sold: ${definition.name}`);
          await tx.ownedPart.update({ where: { id: part.id }, data: { retiredAt: new Date() } }); receipt.resourceId = part.id; break;
        }
        case 'vehicle_purchase': {
          let definition; try { definition = getVehicleDefinition(a.definitionId); } catch { throw new BadRequestException({ code: 'UNKNOWN_VEHICLE', message: 'Unknown vehicle definition.' }); }
          if (await tx.vehicle.findFirst({ where: { playerId, definitionId: definition.id, retiredAt: null } })) refuse('VEHICLE_ALREADY_OWNED', 'You already own this vehicle model.');
          const id = randomUUID();
          await tx.vehicle.create({ data: { id, playerId, definitionId: definition.id, acquisitionKey: `vehicle_purchase:${command.key}`, paint: definition.visual.defaultPaint,
            rideHeightM: definition.visual.rideHeight.defaultM, condition: { create: { ...definition.condition.typical, fuelLiters: 45 } } } });
          await pay(-php(definition.market.basePricePhp), 'VEHICLE_PURCHASE', 'vehicle_dealer', command.key, `Purchased ${definition.identity.make} ${definition.identity.model}`, id);
          receipt.resourceId = id; break;
        }
        case 'vehicle_sell': {
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId);
          if (vehicle.acquisitionKey === 'starter_vehicle' && chapter.currentBeatId !== null) refuse('CHAPTER_CAR_REQUIRED', 'Keep your starter daily through Chapter 1. You can sell it after recognition at KYO.');
          if (player.activeVehicleId === vehicle.id) refuse('ACTIVE_VEHICLE', 'Select another vehicle before selling this one.');
          if (await tx.installedPart.count({ where: { vehicleId: vehicle.id } })) refuse('PARTS_INSTALLED', 'Remove installed parts before selling this vehicle.');
          if (await tx.raceResult.count({ where: { vehicleId: vehicle.id, outcome: 'started' } })) refuse('RACE_ACTIVE', 'Finish this vehicle’s race before selling it.');
          const definition = getVehicleDefinition(vehicle.definitionId), values = Object.values(condition(vehicle.condition!));
          const basis = BigInt(Math.round(values.reduce((sum, v) => sum + v, 0) / values.length * 100_000_000));
          await pay(php(definition.market.basePricePhp) * basis / 100_000_000n / 2n, 'VEHICLE_SALE', 'vehicle_dealer', vehicle.id, `Sold ${definition.identity.model}`, vehicle.id);
          await tx.vehicle.update({ where: { id: vehicle.id }, data: { retiredAt: new Date() } }); receipt.resourceId = vehicle.id; break;
        }
        case 'vehicle_repair': {
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId), definition = getVehicleDefinition(vehicle.definitionId);
          const components = [...new Set(a.components)];
          if (components.some(c => !(SERVICE_COMPONENTS as readonly string[]).includes(c))) refuse('UNSUPPORTED_REPAIR', 'This component is not serviced at the current talyer.');
          let percent = 0;
          if (a.benefitId) { if (!await this.eligible(tx, playerId, a.benefitId)) refuse('BENEFIT_UNAVAILABLE', 'This repair benefit is not available.'); const benefit = opportunity(a.benefitId).benefit; if (benefit.kind === 'repair') percent = benefit.discountPercent; }
          const lines = repairLines(definition, condition(vehicle.condition!)).filter(line => components.includes(line.component));
          if (lines.some(line => line.costPhp === 0)) refuse('ALREADY_REPAIRED', 'A selected component is already fully repaired.');
          const cost = lines.reduce((total, line) => total + (php(line.costPhp) * BigInt(100 - percent) + 50n) / 100n, 0n);
          const paid = await pay(-cost, 'REPAIR_COST', 'talyer', command.key, `Repair: ${components.join(', ')}`, vehicle.id);
          if (paid) await tx.transactionComponent.createMany({ data: components.map(componentId => ({ transactionId: paid.id, componentId })) });
          await tx.vehicleCondition.update({ where: { vehicleId: vehicle.id }, data: { ...Object.fromEntries(components.map(c => [c, 1])), revision: { increment: 1 } } });
          receipt.resourceId = vehicle.id; receipt.details = { costPhp: Number(cost) / 100 }; break;
        }
        case 'fuel_purchase': {
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId);
          const current = Math.round(Number(vehicle.condition!.fuelLiters) * 1000);
          if (current + a.milliliters > 45000) refuse('FUEL_CAPACITY_EXCEEDED', 'Choose a quantity that fits in your tank.');
          const cost = (BigInt(a.milliliters) * php(FUEL_PRICE_PHP_PER_LITER) + 500n) / 1000n;
          await pay(-cost, 'FUEL_PURCHASE', 'refuel', command.key, `${a.milliliters} mL fuel`, vehicle.id);
          await tx.vehicleCondition.update({ where: { vehicleId: vehicle.id }, data: { fuelLiters: (current + a.milliliters) / 1000, revision: { increment: 1 } } });
          receipt.resourceId = vehicle.id; receipt.details = { liters: a.milliliters / 1000, costPhp: Number(cost) / 100 }; break;
        }
        case 'part_install': case 'part_remove': {
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId), part = await this.part(tx, playerId, a.partId);
          const definition = getVehicleDefinition(vehicle.definitionId), partDef = partDefinition(part.partDefinitionId)!;
          if (a.type === 'part_remove' && part.installation?.vehicleId !== vehicle.id) refuse('PART_NOT_INSTALLED', 'This part is not installed on this vehicle.');
          if (a.type === 'part_install' && part.installation) refuse('PART_ALREADY_INSTALLED', 'Remove this physical part before installing it again.');
          const body = bodyPart(part.partDefinitionId);
          if (a.type === 'part_install' && body && (!fitsVehicle(body, definition.tags) || !definition.visual.model.attachments.some(socket => socket.slot === body.socket))) refuse('INCOMPATIBLE_PART', 'This body part does not fit this vehicle.');
          if (a.type === 'part_install' && a.finish !== undefined) { if (!body || (a.finish && !canRefinish(body, a.finish))) refuse('INVALID_FINISH', 'This finish is not supported for this part.'); }
          if (a.type === 'part_install' && partDef.compatibleVehicleIds && !partDef.compatibleVehicleIds.includes(definition.id)) refuse('INCOMPATIBLE_PART', 'This part is not compatible with this vehicle.');
          const inventory = await this.inventory(tx, playerId);
          let labor = 0;
          if (performancePart(part.partDefinitionId)) {
            const preview = previewPerformanceInstall(inventory, definition, condition(vehicle.condition!), part.id, a.type === 'part_install' ? 'install' : 'remove', TALYER_PERFORMANCE);
            if ('rejected' in preview) refuse('INCOMPATIBLE_PART', preview.rejected);
            labor = preview.laborPhp;
          }
          const result = a.type === 'part_install' ? inventory.install(definition.id, part.id, { ...TALYER_PERFORMANCE, vehicle: definition }) : inventory.uninstall(part.id);
          if ('rejected' in result) refuse('INCOMPATIBLE_PART', result.rejected);
          const compatibility = checkPerformanceCompatibility(definition, installedPerformanceItems(inventory, definition.id), { context: TALYER_PERFORMANCE });
          if (!compatibility.compatible) refuse('INCOMPATIBLE_PART', compatibility.issues.map(issue => issue.message).join('; '));
          if (labor) await pay(-php(labor), 'INSTALL_LABOR', 'talyer', command.key, `${a.type}: ${partDef.name}`, vehicle.id);
          if (a.type === 'part_remove') await this.removeInstallation(tx, playerId, part.id);
          else {
            if ('displaced' in result) for (const old of result.displaced) await this.removeInstallation(tx, playerId, old);
            await tx.installedPart.create({ data: { ownedPartId: part.id, playerId, vehicleId: vehicle.id, slots: { create: partDef.slots.map(slotId => ({ slotId })) } } });
            if (a.finish !== undefined) await tx.ownedPart.update({ where: { id: part.id }, data: { finish: a.finish } });
          }
          receipt.resourceId = part.id; receipt.details = { name: partDef.name, laborPhp: labor, operation: a.type === 'part_install' ? 'install' : 'remove' }; break;
        }
        case 'part_refinish': {
          const part = await this.part(tx, playerId, a.partId), body = bodyPart(part.partDefinitionId);
          if (!body || (a.finish && !canRefinish(body, a.finish))) refuse('INVALID_FINISH', 'This finish is not supported for this part.');
          await tx.ownedPart.update({ where: { id: part.id }, data: { finish: a.finish } }); receipt.resourceId = part.id; break;
        }
        case 'vehicle_appearance': {
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId), definition = getVehicleDefinition(vehicle.definitionId);
          if (a.rideHeightM !== undefined && (a.rideHeightM < definition.visual.rideHeight.minM || a.rideHeightM > definition.visual.rideHeight.maxM)) refuse('INVALID_RIDE_HEIGHT', 'This suspension setting is outside the vehicle’s range.');
          if (a.spoilerMode && !definition.visual.model.attachments.some(socket => socket.slot === 'spoiler')) refuse('NO_SPOILER_SOCKET', 'This vehicle has no removable spoiler.');
          if (a.spoilerMode) { const slots = await tx.installedPartSlot.findMany({ where: { vehicleId: vehicle.id, slotId: 'spoiler' } }); for (const slot of slots) await this.removeInstallation(tx, playerId, slot.ownedPartId); }
          await tx.vehicle.update({ where: { id: vehicle.id }, data: { ...(a.paint !== undefined ? { paint: a.paint } : {}), ...(a.rideHeightM !== undefined ? { rideHeightM: a.rideHeightM } : {}), ...(a.spoilerMode ? { stockSpoilerRemoved: a.spoilerMode === 'none' } : {}) } }); receipt.resourceId = vehicle.id; break;
        }
        case 'vehicle_select': {
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId);
          await tx.playerProfile.update({ where: { id: playerId }, data: { activeVehicleId: vehicle.id } }); receipt.resourceId = vehicle.id; break;
        }
        case 'vehicle_checkpoint': {
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId), current = vehicle.condition!;
          if (current.revision.toString() !== a.revision) refuse('VEHICLE_REVISION_CONFLICT', 'This vehicle changed in another session. Reload the latest state.');
          if (Object.entries(a.conditionLoss).some(([key, loss]) => loss > Number(current[key as keyof VehicleCondition]) + 1e-8) ||
              a.fuelConsumedMilliliters > Math.round(Number(current.fuelLiters) * 1000)) refuse('INVALID_WEAR_CHECKPOINT', 'Driving loss exceeds the saved condition or fuel.');
          const worn = Object.fromEntries(Object.entries(a.conditionLoss).map(([key, loss]) => [key, Math.max(0, Number(current[key as keyof VehicleCondition]) - loss)]));
          await tx.vehicleCondition.update({ where: { vehicleId: vehicle.id }, data: { ...worn,
            fuelLiters: (Math.round(Number(current.fuelLiters) * 1000) - a.fuelConsumedMilliliters) / 1000,
            mileageMeters: { increment: BigInt(a.odometerDeltaMeters) }, revision: { increment: 1 } } });
          receipt.resourceId = vehicle.id; break;
        }
        case 'job_start': {
          const job = HUB_JOBS.find(j => j.id === a.definitionId); if (!job) refuse('UNKNOWN_JOB', 'Unknown job definition.');
          if (await tx.jobProgress.count({ where: { playerId, status: { in: ['accepted','active'] } } })) refuse('JOB_ACTIVE', 'Finish or abandon your current job first.');
          if (await tx.raceResult.count({ where: { playerId, outcome: 'started' } })) refuse('RACE_ACTIVE', 'Finish or abandon the race before starting a job.');
          if (job.requirements.minFuelLiters) { const car = await this.vehicle(tx, playerId, player.activeVehicleId!); if (Number(car.condition!.fuelLiters) < job.requirements.minFuelLiters) refuse('JOB_FUEL_REQUIRED', 'This job requires more fuel.'); }
          if (job.cooldownSeconds) {
            const last = await tx.jobProgress.findFirst({ where: { playerId, jobDefinitionId: job.id, completedAt: { not: null } }, orderBy: { completedAt: 'desc' } });
            if (last?.completedAt && Date.now() - last.completedAt.getTime() < job.cooldownSeconds * 1000) refuse('JOB_COOLDOWN', 'This job is still cooling down.');
          }
          const count = await tx.jobProgress.count({ where: { playerId } });
          const runId = `${job.id}#${count + 1}`;
          await tx.jobProgress.create({ data: { playerId, runId, jobDefinitionId: job.id, status: 'accepted' } }); receipt.resourceId = runId; break;
        }
        case 'job_begin': {
          const row = await tx.jobProgress.findUnique({ where: { playerId_runId: { playerId, runId: a.runId } } }); if (!row) missing();
          if (row.status === 'active') { receipt.resourceId = row.runId; break; }
          if (row.status !== 'accepted') refuse('JOB_NOT_ACCEPTED', 'This job cannot be started.');
          const job = HUB_JOBS.find(j => j.id === row.jobDefinitionId); if (!job) refuse('UNKNOWN_JOB', 'Unknown job definition.');
          if (job.requirements.minFuelLiters) { const car = await this.vehicle(tx, playerId, player.activeVehicleId!); if (Number(car.condition!.fuelLiters) < job.requirements.minFuelLiters) refuse('JOB_FUEL_REQUIRED', 'This job requires more fuel.'); }
          await tx.jobProgress.update({ where: { id: row.id }, data: { status: 'active' } }); receipt.resourceId = row.runId; break;
        }
        case 'job_objective': {
          const row = await tx.jobProgress.findUnique({ where: { playerId_runId: { playerId, runId: a.runId } } }); if (!row) missing();
          const job = HUB_JOBS.find(j => j.id === row.jobDefinitionId); if (!job) refuse('UNKNOWN_JOB', 'Unknown job definition.');
          const objectiveIndex = job.objectives.findIndex(o => o.id === a.objectiveId);
          if (objectiveIndex < 0) refuse('UNKNOWN_OBJECTIVE', 'Unknown objective.');
          if (objectiveIndex < row.objectiveIndex) {
            if (row.status === 'completed' && objectiveIndex === job.objectives.length - 1 &&
                (a.elapsedMs !== Number(row.elapsedMs) || a.cargoDamage !== Number(row.cargoDamage))) refuse('JOB_RESULT_CONFLICT', 'This job already has a different result.');
            receipt.resourceId = row.runId;
            receipt = await this.settledReceipt(tx, playerId, row.payoutTransactionId, receipt);
            const payoutPhp = Number(BigInt(receipt.amountCentavos)) / 100;
            receipt.details = { payoutPhp, bonusPhp: payoutPhp ? payoutPhp - job.payoutPhp : 0, completed: row.status === 'completed' }; break;
          }
          if (row.status !== 'active' || objectiveIndex !== row.objectiveIndex) refuse('JOB_OBJECTIVE_ORDER', 'Complete the current job objective first.');
          if (a.elapsedMs < Number(row.elapsedMs) || a.cargoDamage < Number(row.cargoDamage)) refuse('INVALID_JOB_PROGRESS', 'Job time and cargo damage cannot move backwards.');
          const wallElapsed = Date.now() - row.acceptedAt.getTime();
          if (a.elapsedMs > wallElapsed + 5000) refuse('INVALID_JOB_TIME', 'Job time exceeds this run’s elapsed session time.');
          if (job.timeLimitSeconds && a.elapsedMs > job.timeLimitSeconds * 1000) refuse('JOB_EXPIRED', 'This job’s deadline has passed.');
          if (job.cargo && a.cargoDamage > job.cargo.maxDamage) refuse('CARGO_DAMAGED', 'The cargo is too damaged to complete this job.');
          const run: JobRun = { runId: row.runId, jobId: job.id, status: 'active', objectiveIndex: row.objectiveIndex, elapsedSeconds: a.elapsedMs / 1000, cargoLoaded: row.cargoLoaded, cargoDamage: a.cargoDamage };
          const next = completeObjective(run, job, a.objectiveId); if ('rejected' in next) refuse('INVALID_JOB_PROGRESS', next.rejected);
          let paid = null;
          const payoutPhp = next.status === 'completed' ? jobPayout(next, job) : 0;
          if (payoutPhp) paid = await pay(php(payoutPhp), 'JOB_REWARD', `job:${job.type}`, row.runId, `Job: ${job.title}`);
          await tx.jobProgress.update({ where: { id: row.id }, data: { status: next.status as 'active' | 'completed', objectiveIndex: next.objectiveIndex, elapsedMs: BigInt(a.elapsedMs), cargoLoaded: next.cargoLoaded, cargoDamage: next.cargoDamage, ...(paid ? { payoutTransactionId: paid.id, completedAt: new Date() } : {}) } });
          receipt.resourceId = row.runId; receipt.details = { payoutPhp, bonusPhp: payoutPhp ? payoutPhp - job.payoutPhp : 0, completed: next.status === 'completed' }; break;
        }
        case 'job_end': {
          const row = await tx.jobProgress.findUnique({ where: { playerId_runId: { playerId, runId: a.runId } } }); if (!row) missing();
          if (row.status === 'active' || row.status === 'accepted') await tx.jobProgress.update({ where: { id: row.id }, data: { status: a.outcome, reason: a.reason, completedAt: new Date() } }); receipt.resourceId = row.runId; break;
        }
        case 'race_start': {
          const race = raceEconomy(a.definitionId); if (!race) refuse('UNKNOWN_RACE', 'Unknown race definition.');
          const vehicle = await this.vehicle(tx, playerId, a.vehicleId);
          const existing = await tx.raceResult.findUnique({ where: { playerId_attemptId: { playerId, attemptId: a.attemptId } } });
          if (existing) { if (existing.raceDefinitionId !== a.definitionId || existing.vehicleId !== vehicle.id) refuse('RACE_ATTEMPT_CONFLICT', 'This attempt belongs to another race or vehicle.'); receipt.resourceId = existing.attemptId; break; }
          if (await tx.raceResult.count({ where: { playerId, outcome: 'started' } })) refuse('RACE_ACTIVE', 'Finish or abandon the current race first.');
          // Opportunity requirements are evaluated from server social rows, never client flags.
          const gate = ['terrace_sprint','pahuway_descent','the_wall','midnight_run'].includes(race.id) ? SOCIAL_OPPORTUNITIES.find(o => o.benefit.kind === 'race' && o.benefit.raceId === race.id) : undefined;
          if (gate && !await this.eligible(tx, playerId, gate.id)) refuse('RACE_LOCKED', 'This race is not unlocked.');
          const interrupted = await tx.jobProgress.findMany({ where: { playerId, status: { in: ['accepted', 'active'] } } });
          for (const job of interrupted) {
            await tx.jobProgress.update({ where: { id: job.id }, data: { status: 'failed', reason: 'You left the job for a race.', completedAt: new Date() } });
            await progressSocial(tx, playerId, { type: 'job_end', runId: job.runId, outcome: 'failed', reason: 'You left the job for a race.' }, { ...receipt, resourceId: job.runId });
          }
          await tx.raceResult.create({ data: { playerId, attemptId: a.attemptId, raceDefinitionId: race.id, vehicleId: vehicle.id, rivalNpcId: race.npcId, rivalVehicleContentId: race.rivalVehicleId } }); receipt.resourceId = a.attemptId; break;
        }
        case 'race_checkpoint': case 'race_complete': {
          const row = await tx.raceResult.findUnique({ where: { playerId_attemptId: { playerId, attemptId: a.attemptId } } }); if (!row) missing();
          const race = raceEconomy(row.raceDefinitionId); if (!race) refuse('UNKNOWN_RACE', 'Unknown race definition.');
          if (row.outcome !== 'started') {
            if (a.type === 'race_complete' && (a.elapsedMs !== Number(row.elapsedMs) || a.finish !== (row.outcome !== 'dnf'))) refuse('RACE_RESULT_CONFLICT', 'This attempt already has a different result.');
            receipt.resourceId = row.attemptId;
            receipt = await this.settledReceipt(tx, playerId, row.payoutTransactionId, receipt);
            receipt.details = { prizePhp: Number(BigInt(receipt.amountCentavos)) / 100, outcome: row.outcome, position: row.position ?? 2 }; break;
          }
          if (a.elapsedMs < Number(row.lastCheckpointElapsedMs) || a.elapsedMs > Date.now() - row.startedAt.getTime() + 5000) refuse('INVALID_RACE_TIME', 'Invalid race elapsed time.');
          if (a.type === 'race_checkpoint') {
            if (a.checkpointIndex <= row.checkpointIndex) { receipt.resourceId = row.attemptId; break; }
            if (a.checkpointIndex !== row.checkpointIndex + 1 || a.checkpointIndex > race.checkpoints) refuse('RACE_CHECKPOINT_ORDER', 'Race checkpoints must be completed in order.');
            await tx.raceResult.update({ where: { id: row.id }, data: { checkpointIndex: a.checkpointIndex, lastCheckpointElapsedMs: BigInt(a.elapsedMs) } }); receipt.resourceId = row.attemptId; break;
          }
          if (a.finish && (row.checkpointIndex !== race.checkpoints || a.elapsedMs < race.minimumTimeMs)) refuse('INVALID_RACE_FINISH', 'The route or finish time is invalid.');
          // New clients report the measured physical rival finish. Older clients retain the
          // published benchmark, which also keeps existing in-flight attempts compatible.
          const rivalTime = a.opponentElapsedMs === undefined ? race.rivalTimeMs : a.opponentElapsedMs;
          if (rivalTime !== null && rivalTime < race.minimumTimeMs)
            refuse('INVALID_RACE_TIME', 'Rival finish time is outside the valid race window.');
          const outcome = raceOutcome(a.finish, a.elapsedMs, a.opponentElapsedMs, race.rivalTimeMs);
          const rewards = await tx.transaction.count({ where: { playerId, kind: 'RACE_REWARD', source: `race:${race.id}` } });
          const prizePhp = outcome === 'win' && rewards < SOCIAL_REPEAT_LIMITS.racePerRoute ? race.prizePhp : 0;
          const paid = prizePhp ? await pay(php(prizePhp), 'RACE_REWARD', `race:${race.id}`, row.attemptId, `Won ${race.id}`, row.vehicleId) : null;
          await tx.raceResult.update({ where: { id: row.id }, data: { outcome, position: outcome === 'dnf' ? null : outcome === 'win' ? 1 : 2, elapsedMs: BigInt(a.elapsedMs), completedAt: new Date(), payoutTransactionId: paid?.id } });
          receipt.resourceId = row.attemptId; receipt.details = { prizePhp, outcome, position: outcome === 'win' ? 1 : 2 }; break;
        }
        case 'refund': {
          const original = await tx.transaction.findFirst({ where: { id: a.transactionId, playerId, kind: 'PART_PURCHASE', amountCentavos: { lt: 0 } } }); if (!original) missing();
          if (await tx.transaction.findFirst({ where: { playerId, source: 'part_refund', sourceReference: original.id } })) refuse('ALREADY_REFUNDED', 'This purchase has already been refunded.');
          const part = await tx.ownedPart.findFirst({ where: { playerId, transactionId: original.id, retiredAt: null }, include: { installation: true } });
          if (!part || part.installation) refuse('REFUND_UNAVAILABLE', 'Refunds require the original unsold, uninstalled physical part.');
          await tx.ownedPart.update({ where: { id: part.id }, data: { retiredAt: new Date() } });
          await pay(-original.amountCentavos, 'REFUND', 'part_refund', original.id, 'Returned purchased part'); receipt.resourceId = part.id; break;
        }
        default: {
          const unsupported: never = a;
          throw new BadRequestException({ code: 'INVALID_COMMAND', message: `Unsupported command: ${String(unsupported)}` });
        }
      }
      await progressSocial(tx, playerId, a, receipt);
      await advanceChapter(tx, playerId, receipt.resourceId ?? command.key);
      if (['part_purchase','market_purchase','part_sell','part_install','part_remove','part_refinish','part_inspect','refund','vehicle_appearance'].includes(a.type)) await tx.inventory.update({ where: { playerId }, data: { revision: { increment: 1 } } });
      return receipt;
    });
    this.logger.log(JSON.stringify({ event: 'economy.command_completed', requestId, action: command.action.type, transactionId: result.transactionId, resourceId: result.resourceId, amountCentavos: result.amountCentavos }));
    return result;
  }
  async history(userId: string, cursor?: string): Promise<TransactionHistory> {
    return this.db.client.$transaction(async tx => {
      const player = await resolvePlayer(tx, userId), wallet = await tx.wallet.findUniqueOrThrow({ where: { playerId: player.id } });
      const rows = await tx.transaction.findMany({ where: { playerId: player.id, ...(cursor ? { sequence: { lt: BigInt(cursor) } } : {}) }, orderBy: { sequence: 'desc' }, take: 51 });
      const page = rows.slice(0, 50);
      return { balanceCentavos: wallet.balanceCentavos.toString(), revision: wallet.revision.toString(), nextCursor: rows.length > 50 ? page.at(-1)!.sequence.toString() : null,
        transactions: page.map(row => ({ id: row.id, sequence: row.sequence.toString(), amountCentavos: row.amountCentavos.toString(), balanceBeforeCentavos: row.balanceBeforeCentavos.toString(), balanceAfterCentavos: row.balanceAfterCentavos.toString(), category: row.kind, source: row.source, reference: row.sourceReference, description: row.description, timestamp: row.createdAt.toISOString(), requestId: row.requestId })) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async marketplace(userId: string) {
    return this.db.client.$transaction(async tx => {
      const player = await resolvePlayer(tx, userId, true);
      await tx.$queryRaw`SELECT "playerId" FROM "Wallet" WHERE "playerId" = ${player.id}::uuid FOR UPDATE`;
      const now = new Date();
      const rows = await tx.marketplaceListing.findMany({ where: { playerId: player.id, soldAt: null, expiresAt: { gt: now } }, orderBy: { postedAt: 'desc' } });
      while (rows.length < BOARD_SIZE) {
        const id = randomUUID(), seed = randomBytes(4).readUInt32LE();
        const listing = generateListing(seed, id, now.getTime());
        rows.push(await tx.marketplaceListing.create({ data: { id, playerId: player.id, definitionId: listing.templateId, sellerId: listing.sellerId, locationId: listing.location, askingCentavos: php(listing.askingPricePhp), advertisedGrade: listing.advertisedGrade,
          actualCondition: listing.actualCondition, blurb: listing.blurb, photoSeed: listing.photoSeed, postedAt: new Date(listing.postedAt), expiresAt: new Date(listing.expiresAt) } }));
      }
      const offer = opportunity('jun_suki_offer').benefit, eligible = await this.eligible(tx, player.id, 'jun_suki_offer');
      return rows.map(row => {
        const listing: Listing = { id: row.id, templateId: row.definitionId, sellerId: row.sellerId, location: row.locationId, askingPricePhp: Number(row.askingCentavos / 100n), advertisedGrade: row.advertisedGrade, actualCondition: Number(row.actualCondition), blurb: row.blurb, photoSeed: row.photoSeed, postedAt: row.postedAt.getTime(), expiresAt: row.expiresAt.getTime() };
        return { ...listingView(listing, now.getTime()), ...(eligible && offer.kind === 'seller' && row.sellerId === offer.sellerId ? { offerId: 'jun_suki_offer', offerLabel: opportunity('jun_suki_offer').name, offerPricePhp: Math.round(listing.askingPricePhp * (100 - offer.discountPercent) / 100) } : {}) };
      });
    }, { timeout: 15000 });
  }
}
