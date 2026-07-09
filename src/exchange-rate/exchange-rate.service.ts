import { Injectable, Logger } from '@nestjs/common';

interface DolarApiResponse {
  compra?: number;
  venta?: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private cachedRate: number | null = null;
  private cachedAt = 0;

  async getUsdRate(): Promise<{ rate: number }> {
    const now = Date.now();
    if (this.cachedRate !== null && now - this.cachedAt < CACHE_TTL_MS) {
      return { rate: this.cachedRate };
    }

    try {
      const response = await fetch('https://dolarapi.com/v1/dolares/oficial');
      if (!response.ok) {
        throw new Error(`dolarapi respondió ${response.status}`);
      }
      const data = (await response.json()) as DolarApiResponse;
      const rate = data?.venta;
      if (typeof rate !== 'number' || rate <= 0) {
        throw new Error('dolarapi devolvió una tasa inválida');
      }
      this.cachedRate = rate;
      this.cachedAt = now;
      return { rate };
    } catch (error) {
      this.logger.warn(`No se pudo obtener la cotización del dólar: ${(error as Error).message}`);
      if (this.cachedRate !== null) {
        return { rate: this.cachedRate };
      }
      return { rate: 1 };
    }
  }
}
