import { SOCIAL_RACE_CHECKPOINTS, type RaceValidation } from '../../src/game-core/social/raceOutcomes';
/** Complete checkpoint evidence for trusted outcome fixtures. Runtime evidence comes from Race.validation(). */
export const raceValidation = (raceId: string): RaceValidation => ({ completedCheckpoints: SOCIAL_RACE_CHECKPOINTS[raceId], totalCheckpoints: SOCIAL_RACE_CHECKPOINTS[raceId], finishValidated: true, invalidFinish: false });
