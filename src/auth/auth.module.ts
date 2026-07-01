import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { firebaseAdminProvider } from './firebase-admin.provider';
import { RolesGuard } from './guards/roles.guard';
import { IdentityToolkitClient } from './identity-toolkit.client';

@Module({
  controllers: [AuthController],
  providers: [firebaseAdminProvider, IdentityToolkitClient, AuthService, RolesGuard],
  exports: [firebaseAdminProvider, AuthService, RolesGuard],
})
export class AuthModule {}
