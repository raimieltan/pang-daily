import { Body, Controller, HttpCode, Inject, Post, Get, Req, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthRequest, Principal } from '../auth/auth.service';
import { Actor } from '../integrity/actor';
import { validateCommand, validateDto } from '../integrity/validation';
import { EconomyRepository } from '../database/economy.repository';
const historyQuery = z.strictObject({ cursor: z.string().regex(/^\d{1,16}$/).optional() });
const emptyQuery = z.strictObject({});
@Controller('player')
export class EconomyController {
  constructor(@Inject(EconomyRepository) private readonly economy: EconomyRepository) {}
  @Post('commands') @HttpCode(200)
  command(@Body() body: unknown, @Req() request: AuthRequest, @Actor() principal: Principal, @Query() query: unknown) {
    validateDto(emptyQuery, query, 'INVALID_QUERY', 'Commands do not accept query parameters.');
    return this.economy.execute(principal.userId, validateCommand(body), request.requestId);
  }
  @Get('transactions')
  history(@Query() query: unknown, @Actor() principal: Principal) {
    const parsed = validateDto(historyQuery, query, 'INVALID_CURSOR', 'Use the returned history cursor.');
    return this.economy.history(principal.userId, parsed.cursor);
  }
  @Get('marketplace')
  marketplace(@Actor() principal: Principal, @Query() query: unknown) {
    validateDto(emptyQuery, query, 'INVALID_QUERY', 'Marketplace does not accept query parameters.');
    return this.economy.marketplace(principal.userId);
  }
}
