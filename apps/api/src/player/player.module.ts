import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({ imports: [DatabaseModule], controllers: [PlayerController], providers: [PlayerService] })
export class PlayerModule {}
