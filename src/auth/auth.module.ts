import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollaboratorEntity } from '../database/entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { firebaseAdminProvider } from './firebase-admin.provider';
import { RolesGuard } from './guards/roles.guard';
import { IdentityToolkitClient } from './identity-toolkit.client';

@Module({
  imports: [TypeOrmModule.forFeature([CollaboratorEntity])],
  controllers: [AuthController],
  providers: [firebaseAdminProvider, IdentityToolkitClient, AuthService, RolesGuard],
  exports: [firebaseAdminProvider, AuthService, RolesGuard],
})
export class AuthModule {}
