import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { AuthRepository } from './auth.repository';
import { PlayerRepository } from './player.repository';

import { EconomyRepository } from './economy.repository';

@Module({ providers: [DatabaseService, AuthRepository, PlayerRepository, EconomyRepository], exports: [DatabaseService, AuthRepository, PlayerRepository, EconomyRepository] })
export class DatabaseModule {}
