import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { DatabaseModule } from './database/database.module';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    CollaboratorsModule,
    ClientsModule,
    ExchangeRateModule,
    HealthModule,
    UsersModule,
    ProjectsModule,
    TimeEntriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
