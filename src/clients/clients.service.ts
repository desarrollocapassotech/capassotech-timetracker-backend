import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../auth/auth.types';
import { AppUserEntity, BillingCurrency, ClientEntity, ClientFunctionalAnalystEntity } from '../database/entities';
import { normalizeBillableConfig } from './billable-config.util';
import { CreateClientDto, UpdateClientDto } from './clients.dto';

export interface RequesterContext {
  uid: string;
  roles: UserRole[];
}

export interface ClientResponse extends ClientEntity {
  analistaFuncionalIds: string[];
}

type ClientField = keyof UpdateClientDto;

@Injectable()
export class ClientsService {
  // Un admin puede editar cualquier campo.
  private static readonly ADMIN_FIELDS: ClientField[] = [
    'name',
    'email',
    'password',
    'phone',
    'address',
    'city',
    'province',
    'postalCode',
    'floor',
    'razonSocial',
    'cuit',
    'ivaCondition',
    'billingCurrency',
    'billableConfig',
    'analistaFuncionalIds',
    'profileImageUrl',
    'billableHoursLimit',
  ];

  // Un contable solo puede ajustar la configuración de horas facturables (igual
  // que hoy en AdminTimeManagement/BillableAdjustForm.tsx). El resto de la ficha
  // de ClientManagement.tsx es de solo lectura para contable.
  private static readonly ACCOUNTANT_FIELDS: ClientField[] = ['billableConfig'];

  // Un cliente editando su propio perfil (UserProfile.tsx) solo toca datos de
  // contacto/fiscales, nunca facturación ni la lista de analistas asignados.
  private static readonly SELF_FIELDS: ClientField[] = [
    'name',
    'email',
    'phone',
    'address',
    'floor',
    'city',
    'province',
    'postalCode',
    'razonSocial',
    'cuit',
    'ivaCondition',
  ];

  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepository: Repository<ClientEntity>,
    @InjectRepository(ClientFunctionalAnalystEntity)
    private readonly analystRepository: Repository<ClientFunctionalAnalystEntity>,
    @InjectRepository(AppUserEntity)
    private readonly appUserRepository: Repository<AppUserEntity>,
    private readonly authService: AuthService,
  ) {}

  async findAll(): Promise<ClientResponse[]> {
    const clients = await this.clientRepository.find({ order: { name: 'ASC' } });
    const analystRows = await this.analystRepository.find();

    const analystsByClient = new Map<string, string[]>();
    for (const row of analystRows) {
      const list = analystsByClient.get(row.clientId) ?? [];
      list.push(row.collaboratorId);
      analystsByClient.set(row.clientId, list);
    }

    return clients.map((client) => ({ ...client, analistaFuncionalIds: analystsByClient.get(client.id) ?? [] }));
  }

  async findOne(id: string): Promise<ClientResponse> {
    const client = await this.findEntity(id);
    return this.withAnalysts(client);
  }

  async create(dto: CreateClientDto): Promise<ClientResponse> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Falta el nombre del cliente.');
    }

    let userId: string | null = null;

    if (dto.email && dto.password) {
      userId = await this.authService.createFirebaseUser(dto.email, dto.password);
      await this.appUserRepository.upsert(
        {
          id: userId,
          email: dto.email,
          name: dto.name,
          roles: [UserRole.CLIENT],
          hourlyRate: '0',
        },
        ['id'],
      );
    }

    const client = this.clientRepository.create({
      id: randomUUID(),
      userId,
      name: dto.name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      address: dto.address ?? null,
      city: dto.city ?? null,
      province: dto.province ?? null,
      postalCode: dto.postalCode ?? null,
      floor: dto.floor ?? null,
      razonSocial: dto.razonSocial ?? null,
      cuit: dto.cuit ?? null,
      ivaCondition: dto.ivaCondition ?? null,
      password: dto.password ?? null,
      billingCurrency: this.normalizeCurrency(dto.billingCurrency),
      billableConfig: normalizeBillableConfig(dto.billableConfig),
      profileImageUrl: dto.profileImageUrl ?? null,
      billableHoursLimit: dto.billableHoursLimit != null ? String(dto.billableHoursLimit) : null,
    });

    const saved = await this.clientRepository.save(client);

    if (dto.analistaFuncionalIds?.length) {
      await this.replaceAnalysts(saved.id, dto.analistaFuncionalIds);
    }

    return this.withAnalysts(saved);
  }

  async update(id: string, dto: UpdateClientDto, requester: RequesterContext): Promise<ClientResponse> {
    const existing = await this.findEntity(id);
    const allowedFields = this.resolveAllowedFields(existing, requester);

    if (allowedFields.size === 0) {
      throw new ForbiddenException('No tenés permisos para editar este cliente.');
    }

    let analystsToApply: string[] | undefined;

    for (const field of allowedFields) {
      if (!(field in dto)) continue;

      switch (field) {
        case 'billingCurrency':
          if (dto.billingCurrency !== undefined) existing.billingCurrency = this.normalizeCurrency(dto.billingCurrency);
          break;
        case 'billableConfig':
          if (dto.billableConfig !== undefined) existing.billableConfig = normalizeBillableConfig(dto.billableConfig);
          break;
        case 'billableHoursLimit':
          if (dto.billableHoursLimit !== undefined) {
            existing.billableHoursLimit = dto.billableHoursLimit == null ? null : String(dto.billableHoursLimit);
          }
          break;
        case 'password':
          if (dto.password) {
            if (!existing.userId) {
              throw new BadRequestException('Este cliente todavía no tiene una cuenta de acceso creada.');
            }
            await this.authService.setFirebaseUserPassword(existing.userId, dto.password);
            existing.password = dto.password;
          }
          break;
        case 'analistaFuncionalIds':
          if (dto.analistaFuncionalIds !== undefined) analystsToApply = dto.analistaFuncionalIds;
          break;
        default:
          (existing as unknown as Record<string, unknown>)[field] = dto[field] ?? null;
      }
    }

    const saved = await this.clientRepository.save(existing);

    if (analystsToApply !== undefined) {
      await this.replaceAnalysts(id, analystsToApply);
    }

    return this.withAnalysts(saved);
  }

  async remove(id: string): Promise<void> {
    try {
      const result = await this.clientRepository.delete({ id });
      if (result.affected === 0) {
        throw new NotFoundException('Cliente no encontrado.');
      }
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'No se puede eliminar: el cliente tiene proyectos u otras asignaciones vinculadas.',
        );
      }
      throw error;
    }
  }

  private async findEntity(id: string): Promise<ClientEntity> {
    const found = await this.clientRepository.findOneBy({ id });
    if (!found) {
      throw new NotFoundException('Cliente no encontrado.');
    }
    return found;
  }

  private async withAnalysts(client: ClientEntity): Promise<ClientResponse> {
    const rows = await this.analystRepository.find({ where: { clientId: client.id } });
    return { ...client, analistaFuncionalIds: rows.map((row) => row.collaboratorId) };
  }

  private async replaceAnalysts(clientId: string, collaboratorIds: string[]): Promise<void> {
    await this.analystRepository.delete({ clientId });
    const uniqueIds = [...new Set(collaboratorIds)];
    if (uniqueIds.length) {
      const rows = uniqueIds.map((collaboratorId) => this.analystRepository.create({ clientId, collaboratorId }));
      await this.analystRepository.save(rows);
    }
  }

  private resolveAllowedFields(target: ClientEntity, requester: RequesterContext): Set<ClientField> {
    if (requester.roles.includes(UserRole.ADMIN)) {
      return new Set(ClientsService.ADMIN_FIELDS);
    }

    const fields = new Set<ClientField>();
    if (target.userId && target.userId === requester.uid) {
      ClientsService.SELF_FIELDS.forEach((field) => fields.add(field));
    }
    if (requester.roles.includes(UserRole.CONTABLE)) {
      ClientsService.ACCOUNTANT_FIELDS.forEach((field) => fields.add(field));
    }
    return fields;
  }

  private normalizeCurrency(currency: BillingCurrency | undefined): BillingCurrency {
    return currency === BillingCurrency.ARS ? BillingCurrency.ARS : BillingCurrency.USD;
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503';
  }
}
