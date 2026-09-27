import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EconomyController } from './economy.controller';
@Module({ imports: [DatabaseModule], controllers: [EconomyController] })
export class EconomyModule {}
