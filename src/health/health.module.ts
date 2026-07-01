import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthCheckEntity } from '../database/entities';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthCheckEntity])],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
