import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';
import { playerCommandSchema, type PlayerCommand } from '@pang-daily/contracts';
import { AUTO_PARTS_STOCK } from '@pang-daily/game-core/shops/AutoPartsShop';
import { getVehicleDefinition } from '@pang-daily/game-core/vehicles/catalog';
import { HUB_JOBS } from '@pang-daily/game-core/jobs/catalog';
import { raceEconomy } from '@pang-daily/game-core/economy/raceRules';
import { SOCIAL_CONTENT } from '@pang-daily/game-core/social/catalog';
import { CONVERSATIONS } from '@pang-daily/game-core/social/conversation';
import { CHAPTER_ONE } from '@pang-daily/game-core/progression/chapter';
import { invalidContent } from './errors';

export function validateDto<T>(schema: ZodType<T>, input: unknown, code: string, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException({ code, message,
    fields: parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) });
  return parsed.data;
}
/** Content references are rejected before acquiring a lock or entering any domain mutation. */
export function validateCommand(input: unknown): PlayerCommand {
  const command = validateDto(playerCommandSchema, input, 'INVALID_COMMAND', 'Check this command and try again.');
  const a = command.action;
  if (a.type === 'part_purchase' && !AUTO_PARTS_STOCK.some(part => part.partId === a.definitionId)) invalidContent('action.definitionId');
  if (a.type === 'vehicle_purchase') {
    try { getVehicleDefinition(a.definitionId); } catch { invalidContent('action.definitionId'); }
  }
  if (a.type === 'job_start' && !HUB_JOBS.some(job => job.id === a.definitionId)) invalidContent('action.definitionId');
  if (a.type === 'job_objective' && !HUB_JOBS.some(job => job.objectives.some(objective => objective.id === a.objectiveId))) invalidContent('action.objectiveId');
  if (a.type === 'race_start' && !raceEconomy(a.definitionId)) invalidContent('action.definitionId');
  if (a.type === 'social_introduce' && !SOCIAL_CONTENT.npcs.some(npc => npc.dialogueEntryId === a.dialogueId)) invalidContent('action.dialogueId');
  if (a.type === 'social_choice') {
    const dialogue = CONVERSATIONS.find(dialogue => dialogue.id === a.dialogueId);
    if (!dialogue) invalidContent('action.dialogueId');
    const node = dialogue.nodes.find(node => node.id === a.nodeId);
    if (!node) invalidContent('action.nodeId');
    if (!node.choices.some(choice => choice.id === a.choiceId)) invalidContent('action.choiceId');
  }
  if (a.type === 'chapter_continue' && !CHAPTER_ONE.beats.some(beat => beat === a.beatId)) invalidContent('action.beatId');
  return command;
}
