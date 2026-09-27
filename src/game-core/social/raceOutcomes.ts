import type { VehicleSession } from '../maintenance/VehicleSession';
import { REPUTATION_CONFIG } from './reputation';
import { SOCIAL_REPEAT_LIMITS } from './rules';
import type { RivalOutcome } from './rivalHistory';

export type RaceValidation = { completedCheckpoints: number; totalCheckpoints: number; finishValidated: boolean; invalidFinish: boolean };
export const SOCIAL_RACE_CHECKPOINTS: Readonly<Record<string, number>> = { barangay_sprint: 3, kyo_block_lap: 4, terrace_sprint: 3, pahuway_descent: 3, the_wall: 5, midnight_run: 6 };
export type RaceOutcomeInput = { raceId: string; attemptId: string; position: number; racers: number; timeMs: number; outcome?: RivalOutcome; validation?: RaceValidation };
export function validateRaceOutcome(input: RaceOutcomeInput): string | null {
 const proof = input.validation, total = SOCIAL_RACE_CHECKPOINTS[input.raceId];
 if (!input.attemptId?.trim() || !Number.isSafeInteger(input.position) || !Number.isSafeInteger(input.racers) || input.racers < 2 || input.position < 1 || input.position > input.racers || !Number.isSafeInteger(input.timeMs) || input.timeMs < 0) return 'Invalid race result';
 if (!proof || total === undefined || proof.totalCheckpoints !== total || !Number.isSafeInteger(proof.completedCheckpoints) || proof.completedCheckpoints < 0 || proof.completedCheckpoints > total || typeof proof.finishValidated !== 'boolean' || typeof proof.invalidFinish !== 'boolean') return 'Missing or invalid checkpoint validation';
 if (input.outcome === 'dnf') return proof.finishValidated ? 'A finished race cannot be a DNF' : null;
 if (input.outcome && input.outcome !== (input.position === 1 ? 'win' : 'loss')) return 'Race outcome disagrees with validated placing';
 if (!proof.finishValidated || proof.invalidFinish || proof.completedCheckpoints !== total || input.timeMs <= 0) return 'Race finish did not validate every checkpoint';
 return null;
}

/** Shared wallet path: no duplicate payment per attempt; the same authored repeat cap applies after reload. */
export function payRacePrize(wallet: Pick<VehicleSession, 'earn' | 'snapshot'>, result: RaceOutcomeInput, prizePhp: number): number {
 if (validateRaceOutcome(result) || result.outcome === 'dnf' || result.position !== 1 || !(prizePhp > 0)) return 0;
 const source = `race:${result.raceId}`;
 const ledger = wallet.snapshot().transactions.filter(tx => tx.kind === 'race_prize');
 if (ledger.some(tx => tx.relatedEntityId === result.attemptId) || ledger.filter(tx => tx.source === source).length >= SOCIAL_REPEAT_LIMITS.racePerRoute) return 0;
 if (!(result.raceId in REPUTATION_CONFIG.races)) return 0;
 const paid = wallet.earn(prizePhp, { kind: 'race_prize', source, description: `Won ${result.raceId}`, relatedEntityId: result.attemptId });
 return 'rejected' in paid ? 0 : prizePhp;
}
