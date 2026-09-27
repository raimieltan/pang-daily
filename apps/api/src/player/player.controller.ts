import { Controller, ForbiddenException, Get, Inject, Query, Req } from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.service';
import { PlayerService } from './player.service';

@Controller('player')
export class PlayerController {
  constructor(@Inject(PlayerService) private readonly players: PlayerService) {}
  @Get('bootstrap')
  bootstrap(@Req() request: AuthRequest, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new ForbiddenException({ code: 'PLAYER_ID_NOT_ACCEPTED', message: 'Bootstrap uses your authenticated session; request parameters are not accepted.' });
    return this.players.bootstrap(request.principal!, request.requestId);
  }
}
