import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Get('live')
  live() { return { status: 'alive' }; }
  @Get()
  async ready() {
    const database = await this.database.isReady();
    const result = { status: database ? 'ready' : 'not_ready', application: 'alive', database: database ? 'up' : 'down' };
    if (!database) throw new ServiceUnavailableException(result);
    return result;
  }
}
