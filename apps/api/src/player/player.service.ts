import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { bootstrapSchema } from '@pang-daily/contracts';
import { BANWA_DALAGAN_1996, HIRAYA_KIDLAT_1997 } from '@pang-daily/game-core/vehicles/catalog';
import { partDefinition, PART_SLOTS } from '@pang-daily/game-core/parts/parts';
import { SOCIAL_CONTENT } from '@pang-daily/game-core/social/catalog';
import { SocialSession } from '@pang-daily/game-core/social/SocialSession';
import { FUEL_CAPACITY_LITERS } from '@pang-daily/game-core/economy/economy';
import { PlayerRepository } from '../database/player.repository';
import type { Principal } from '../auth/auth.service';
import { starterState } from './starter-state';
import { logEvent } from '../observability';

@Injectable()
export class PlayerService {
  constructor(@Inject(PlayerRepository) private readonly repository: PlayerRepository) {}
  async bootstrap(principal: Principal, requestId: string) {
    const started = performance.now();
    let outcome = 'failure';
    try {
    const bootstrap = await this.repository.bootstrap(principal.userId, starterState(principal.username), requestId);
    try {
      const dto = bootstrapSchema.parse(bootstrap);
      new SocialSession(SOCIAL_CONTENT, dto.social.state);
      if (dto.vehicles.some(car => ![BANWA_DALAGAN_1996.id, HIRAYA_KIDLAT_1997.id].includes(car.definitionId)) ||
        dto.vehicles.some(car => car.fuelLiters > FUEL_CAPACITY_LITERS) ||
        dto.inventory.parts.some(part => !partDefinition(part.definitionId)) ||
        dto.inventory.installed.some(item => item.slots.some(slot => !(PART_SLOTS as readonly string[]).includes(slot)))) throw new Error('Unknown content reference');
      for (const installation of dto.inventory.installed) {
        const part = dto.inventory.parts.find(item => item.id === installation.ownedPartId && !item.retired);
        const definition = part && partDefinition(part.definitionId);
        if (!definition || definition.slots.length !== installation.slots.length || !definition.slots.every(slot => installation.slots.includes(slot))) {
          throw new Error('Incomplete part installation');
        }
      }
      outcome = 'success';
      return dto;
    } catch {
      throw new ConflictException({ code: 'PLAYER_STATE_INVALID', message: 'Your save could not be loaded safely. Progress has not been reset.', recovery: 'contact_support' });
    }
    } finally {
      logEvent('persistence.bootstrap', { requestId, actorId: principal.userId,
        durationMs: Math.round(performance.now() - started), outcome });
    }
  }
}
