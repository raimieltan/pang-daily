import { expect, it } from 'vitest';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { grantCustomizationTestKit } from './developmentParts';

it('grants all test parts once, preserving owned items, installs and condition on reload', () => {
  const inventory = new InventorySession();
  grantCustomizationTestKit(inventory);
  expect(inventory.items()).toHaveLength(12);
  const skirts = inventory.items().find(p => p.partId === 'dalagan_fiberglass_skirts')!;
  expect(skirts.condition).toBe(0.25);
  expect(skirts.revealedBy).toBe('known');
  inventory.install('test_car', skirts.id);
  inventory.refinish(skirts.id, 'body_color');
  const restored = new InventorySession(JSON.parse(JSON.stringify(inventory.snapshot())));
  grantCustomizationTestKit(restored);
  expect(restored.snapshot()).toEqual(inventory.snapshot());
});
