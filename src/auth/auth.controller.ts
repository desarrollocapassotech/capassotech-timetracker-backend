import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedRequest, FirebaseAuthGuard } from './guards/firebase-auth.guard';

interface LoginDto {
  email: string;
  password: string;
}

interface RefreshTokenDto {
  refreshToken: string;
}

interface ForgotPasswordDto {
  email: string;
}

interface ChangePasswordDto {
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Email y contraseña son obligatorios.');
    }
    return this.authService.login(body.email.trim(), body.password);
  }

  @Post('refresh-token')
  refresh(@Body() body: RefreshTokenDto) {
    if (!body?.refreshToken) {
      throw new BadRequestException('Falta el refresh token.');
    }
    return this.authService.refresh(body.refreshToken);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    if (!body?.email) {
      throw new BadRequestException('El correo electrónico es obligatorio.');
    }
    await this.authService.forgotPassword(body.email.trim());
    return { success: true };
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedRequest['user']) {
    await this.authService.logout(user.uid);
    return { success: true };
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: ChangePasswordDto,
  ) {
    if (!body?.newPassword) {
      throw new BadRequestException('La nueva contraseña es obligatoria.');
    }
    await this.authService.changePassword(user.uid, body.newPassword);
    return { success: true };
  }

  @UseGuards(FirebaseAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.authService.getProfile(user.uid, user.email);
  }
}
