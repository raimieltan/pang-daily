import { BODY_PARTS } from '@/game-core/exterior';
import { WHEEL_PARTS } from '@/game-core/wheels';
import type { InventorySession } from '@/game-core/inventory/InventorySession';

/** Developer sandbox supplies. Stable keys prevent duplicate grants on reload. */
export function grantCustomizationTestKit(inventory: InventorySession): void {
  const wear: Record<string, number> = {
    universal_rubber_lip: 0.5,
    dalagan_fiberglass_skirts: 0.25,
    marketplace_gt_wing: 0.55,
    dalagan_red_fender_fl: 0.6,
  };
  for (const partId of [...BODY_PARTS.map(p => p.id), ...WHEEL_PARTS.map(p => p.id), 'used_coilovers_01']) {
    inventory.add({ partId, condition: wear[partId] ?? 0.95, revealedBy: 'known',
      origin: { kind: 'grant', reason: 'Customization test kit' }, key: `dev:customization-kit:v1:${partId}` });
  }
}
