import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { playerCommandSchema } from '@pang-daily/contracts';
import type { AuthRequest } from '../auth/auth.service';
import { EconomyRepository } from '../database/economy.repository';
@Controller('player')
export class EconomyController {
  constructor(@Inject(EconomyRepository) private readonly economy: EconomyRepository) {}
  @Post('commands') @HttpCode(200)
  command(@Body() body: unknown, @Req() request: AuthRequest) {
    const parsed = playerCommandSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'INVALID_COMMAND', message: 'Invalid player command.', issues: parsed.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) });
    return this.economy.execute(request.principal!.userId, parsed.data, request.requestId ?? 'unknown');
  }
  @Get('transactions')
  history(@Query() query: Record<string, unknown>, @Req() request: AuthRequest) {
    if (Object.keys(query).some(key => key !== 'cursor') || (query.cursor !== undefined && (typeof query.cursor !== 'string' || !/^\d{1,16}$/.test(query.cursor)))) throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Use a numeric transaction cursor.' });
    return this.economy.history(request.principal!.userId, query.cursor as string | undefined);
  }
  @Get('marketplace')
  marketplace(@Req() request: AuthRequest) { return this.economy.marketplace(request.principal!.userId); }
}
