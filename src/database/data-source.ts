import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL no está definido. Configurá el .env (o la env var del entorno) antes de correr migraciones.',
  );
}

// Usado solo por el CLI de TypeORM (npm run migration:run / migration:revert),
// apuntando siempre a DATABASE_URL: developer local, rama develop (QA) o rama
// production, según qué connection string esté cargada en el entorno.
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: 'tracker',
  entities,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  ssl: { rejectUnauthorized: false },
});
