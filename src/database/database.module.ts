import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from './entities';

// synchronize siempre en false: el schema es responsabilidad de las migraciones
// (src/database/migrations), que reflejan el diseño aprobado en database/schema.sql.
// Nunca dejamos que TypeORM altere el schema automáticamente.
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        schema: 'tracker',
        entities,
        synchronize: false,
        ssl: { rejectUnauthorized: false },
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
