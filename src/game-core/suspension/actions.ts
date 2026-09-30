import { z } from 'zod';
import { COMPONENTS, PART_IDS, suspensionSaveSchema, suspensionSetupSchema, type SavedSuspension, type SuspensionBaseline } from './schema';
import { alignCorner, installPart, presetSetup, repairComponent, validateSetup } from './service';
export const suspensionActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('setup'), setup: suspensionSetupSchema }),
  z.object({ kind: z.literal('part'), part: z.enum(PART_IDS) }),
  z.object({ kind: z.literal('repair'), corner: z.number().int().min(0).max(3), component: z.enum(COMPONENTS) }),
  z.object({ kind: z.literal('align'), corner: z.number().int().min(0).max(3) }),
  z.object({ kind: z.literal('preset'), name: z.string().min(1).max(32), save: z.boolean() }),
  z.object({ kind: z.literal('checkpoint'), state: suspensionSaveSchema }),
]);
export type SuspensionAction = z.infer<typeof suspensionActionSchema>;
export function applySuspensionAction(saved: SavedSuspension, action: SuspensionAction, baseline: SuspensionBaseline): SavedSuspension | { rejected: string } {
  const parsed = suspensionActionSchema.safeParse(action);
  if (!parsed.success) return { rejected: 'Invalid suspension adjustment.' };
  const next = structuredClone(saved); action = parsed.data;
  switch (action.kind) {
    case 'setup': { const rejected = validateSetup(next, action.setup); if (rejected) return { rejected }; next.setup = action.setup; break; }
    case 'part': installPart(next, action.part, baseline); break;
    case 'repair': repairComponent(next, action.corner, action.component); break;
    case 'align': { const result = alignCorner(next, action.corner); if (result) return result; break; }
    case 'preset': if (action.save) next.presets[action.name] = { part: next.part, setup: structuredClone(next.setup) }; else {
      presetSetup(next, action.name, baseline);
    } break;
    case 'checkpoint': {
      const incoming = action.state;
      if (incoming.part !== next.part || JSON.stringify(incoming.setup) !== JSON.stringify(next.setup)) return { rejected: 'Driving cannot install or tune suspension parts.' };
      for (let i = 0; i < 4; i++) {
        if (COMPONENTS.some(k => incoming.damage[i].health[k] > next.damage[i].health[k] + 1e-8)) return { rejected: 'Driving cannot repair suspension.' };
        const stress = Math.max(...COMPONENTS.map(k => next.damage[i].health[k] - incoming.damage[i].health[k]),
          (incoming.damage[i].fatigue - next.damage[i].fatigue) * 20);
        if (incoming.damage[i].fatigue < next.damage[i].fatigue) return { rejected: 'Driving cannot restore suspension fatigue.' };
        // Only the small, toe-only service drift produced by impacts may pass this boundary.
        const aAlign = incoming.alignment[i], bAlign = next.alignment[i];
        if (aAlign.camber !== bAlign.camber || aAlign.caster !== bAlign.caster || Math.abs(aAlign.toe - bAlign.toe) > stress * .003 + 1e-8)
          return { rejected: 'Driving cannot perform alignment service.' };
        const a = incoming.damage[i].deformation, b = next.damage[i].deformation;
        if (['camber', 'toe', 'caster', 'rideHeight', 'travelReduction', 'steeringCenter'].some(k => Math.abs(a[k as 'toe']) + 1e-8 < Math.abs(b[k as 'toe']))) return { rejected: 'Driving cannot straighten suspension.' };
        if (['x', 'y', 'z'].some(k => Math.abs(a.position[k as 'x']) + 1e-8 < Math.abs(b.position[k as 'x']))) return { rejected: 'Driving cannot straighten suspension.' };
      }
      next.damage = incoming.damage; next.alignment = incoming.alignment; break;
    }
  }
  const validated = suspensionSaveSchema.safeParse(next);
  return validated.success ? validated.data : { rejected: 'The resulting setup exceeds safe data limits.' };
}
