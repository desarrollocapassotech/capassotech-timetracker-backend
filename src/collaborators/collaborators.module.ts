import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppUserEntity, CollaboratorEntity, CollaboratorProjectRateEntity } from '../database/entities';
import { CollaboratorsController } from './collaborators.controller';
import { CollaboratorsService } from './collaborators.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollaboratorEntity, AppUserEntity, CollaboratorProjectRateEntity]),
    AuthModule,
  ],
  controllers: [CollaboratorsController],
  providers: [CollaboratorsService],
  exports: [CollaboratorsService],
})
export class CollaboratorsModule {}
