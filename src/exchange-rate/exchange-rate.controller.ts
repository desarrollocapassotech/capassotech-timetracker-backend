import { Controller, Get, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { ExchangeRateService } from './exchange-rate.service';

@UseGuards(FirebaseAuthGuard)
@Controller('exchange-rate')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Get('usd')
  getUsdRate() {
    return this.exchangeRateService.getUsdRate();
  }
}
