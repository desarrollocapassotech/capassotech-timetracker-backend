import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { HealthCheckEntity } from '../database/entities';

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(HealthCheckEntity)
    private readonly healthCheckRepository: Repository<HealthCheckEntity>,
  ) {}

  // Escribe un registro de prueba, lo relee y lo borra, para probar el
  // round-trip real backend -> Postgres (Neon) en el entorno donde corre.
  async checkDatabase() {
    const id = randomUUID();
    const note = `backend health check @ ${new Date().toISOString()}`;

    await this.healthCheckRepository.insert({ id, note });

    const found = await this.healthCheckRepository.findOneBy({ id });
    await this.healthCheckRepository.delete({ id });

    if (!found || found.note !== note) {
      throw new ServiceUnavailableException('La base respondió pero el registro de prueba no coincide.');
    }

    return {
      status: 'ok' as const,
      write: true,
      read: true,
      cleanedUp: true,
      recordId: id,
    };
  }
}
