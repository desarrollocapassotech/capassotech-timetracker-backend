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
import { assertValidImageFile, buildCollaboratorImagePath } from '../common/profile-image.util';
import { AppUserEntity, BillingCurrency, CollaboratorEntity, UserRole } from '../database/entities';
import { CreateCollaboratorDto, UpdateCollaboratorDto } from './collaborators.dto';

export interface RequesterContext {
  uid: string;
  roles: UserRole[];
}

type CollaboratorField = keyof UpdateCollaboratorDto;

@Injectable()
export class CollaboratorsService {
  // Un admin puede editar cualquier campo.
  private static readonly ADMIN_FIELDS: CollaboratorField[] = [
    'name',
    'personalEmail',
    'workEmail',
    'password',
    'hourlyRate',
    'currency',
    'exchangeRate',
    'active',
    'startedDate',
    'birthDate',
    'paymentMethod',
    'phone',
    'city',
    'address',
    'floor',
    'province',
    'postalCode',
    'cbuCvu',
    'roles',
    'showFinancialValues',
    'profileImageUrl',
  ];

  // Un contable solo puede tocar el sueldo (misma restricción que hoy en
  // EmployeeManagement.tsx: isRateOnlyEdit && isAccountant).
  private static readonly ACCOUNTANT_RATE_FIELDS: CollaboratorField[] = [
    'hourlyRate',
    'currency',
    'exchangeRate',
  ];

  // Un colaborador editando su propio perfil (UserProfile.tsx) solo toca datos
  // personales, nunca sueldo/rol/password (eso va por /auth/change-password).
  private static readonly SELF_FIELDS: CollaboratorField[] = [
    'name',
    'personalEmail',
    'workEmail',
    'phone',
    'birthDate',
    'address',
    'floor',
    'city',
    'province',
    'postalCode',
    'cbuCvu',
    'paymentMethod',
    'startedDate',
    'active',
    'profileImageUrl',
  ];

  constructor(
    @InjectRepository(CollaboratorEntity)
    private readonly collaboratorRepository: Repository<CollaboratorEntity>,
    @InjectRepository(AppUserEntity)
    private readonly appUserRepository: Repository<AppUserEntity>,
    private readonly authService: AuthService,
  ) {}

  findAll(): Promise<CollaboratorEntity[]> {
    return this.collaboratorRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<CollaboratorEntity> {
    const found = await this.collaboratorRepository.findOneBy({ id });
    if (!found) {
      throw new NotFoundException('Colaborador no encontrado.');
    }
    return found;
  }

  async create(dto: CreateCollaboratorDto): Promise<CollaboratorEntity> {
    if (!dto.name?.trim() || !dto.startedDate || dto.hourlyRate === undefined || dto.hourlyRate === null) {
      throw new BadRequestException('Faltan campos obligatorios (nombre, fecha de inicio, valor por hora).');
    }

    const roles = dto.roles?.length ? dto.roles : [UserRole.COLABORADOR];
    let userId: string | null = null;

    if (dto.workEmail && dto.password) {
      userId = await this.authService.createFirebaseUser(dto.workEmail, dto.password);
      await this.appUserRepository.upsert(
        {
          id: userId,
          email: dto.workEmail,
          name: dto.name,
          roles,
          hourlyRate: String(dto.hourlyRate),
        },
        ['id'],
      );
    }

    const collaborator = this.collaboratorRepository.create({
      id: randomUUID(),
      userId,
      name: dto.name,
      personalEmail: dto.personalEmail ?? null,
      workEmail: dto.workEmail ?? null,
      password: dto.password ?? null,
      hourlyRate: String(dto.hourlyRate),
      currency: this.normalizeCurrency(dto.currency),
      exchangeRate: dto.exchangeRate != null ? String(dto.exchangeRate) : null,
      active: dto.active ?? true,
      startedDate: dto.startedDate,
      birthDate: dto.birthDate ?? null,
      paymentMethod: dto.paymentMethod ?? null,
      phone: dto.phone ?? null,
      city: dto.city ?? null,
      address: dto.address ?? null,
      floor: dto.floor ?? null,
      province: dto.province ?? null,
      postalCode: dto.postalCode ?? null,
      cbuCvu: dto.cbuCvu ?? null,
      roles,
      showFinancialValues: dto.showFinancialValues ?? true,
      profileImageUrl: dto.profileImageUrl ?? null,
    });

    return this.collaboratorRepository.save(collaborator);
  }

  async update(
    id: string,
    dto: UpdateCollaboratorDto,
    requester: RequesterContext,
  ): Promise<CollaboratorEntity> {
    const existing = await this.findOne(id);
    const allowedFields = this.resolveAllowedFields(existing, requester);

    if (allowedFields.size === 0) {
      throw new ForbiddenException('No tenés permisos para editar este colaborador.');
    }

    for (const field of allowedFields) {
      if (!(field in dto)) continue;

      switch (field) {
        case 'hourlyRate':
          if (dto.hourlyRate !== undefined) existing.hourlyRate = String(dto.hourlyRate);
          break;
        case 'exchangeRate':
          if (dto.exchangeRate !== undefined) {
            existing.exchangeRate = dto.exchangeRate == null ? null : String(dto.exchangeRate);
          }
          break;
        case 'currency':
          if (dto.currency !== undefined) existing.currency = this.normalizeCurrency(dto.currency);
          break;
        case 'password':
          if (dto.password) {
            if (!existing.userId) {
              throw new BadRequestException('Este colaborador todavía no tiene una cuenta de acceso creada.');
            }
            await this.authService.setFirebaseUserPassword(existing.userId, dto.password);
            existing.password = dto.password;
          }
          break;
        case 'roles':
          if (dto.roles !== undefined) existing.roles = dto.roles.length ? dto.roles : [UserRole.COLABORADOR];
          break;
        default:
          (existing as unknown as Record<string, unknown>)[field] = dto[field] ?? null;
      }
    }

    return this.collaboratorRepository.save(existing);
  }

  // Sube la foto de perfil y la persiste en el mismo paso. Mismo criterio de
  // permisos que update(): solo se puede si 'profileImageUrl' está en el set de
  // campos permitidos para este requester sobre este colaborador (admin, o el
  // propio colaborador vía UserProfile.tsx).
  async uploadProfileImage(
    id: string,
    file: Express.Multer.File | undefined,
    requester: RequesterContext,
  ): Promise<CollaboratorEntity> {
    assertValidImageFile(file);

    const existing = await this.findOne(id);
    const allowedFields = this.resolveAllowedFields(existing, requester);
    if (!allowedFields.has('profileImageUrl')) {
      throw new ForbiddenException('No tenés permisos para cambiar esta foto de perfil.');
    }

    const path = buildCollaboratorImagePath(id, file.originalname);
    existing.profileImageUrl = await this.authService.uploadProfileImage(file.buffer, file.mimetype, path);

    return this.collaboratorRepository.save(existing);
  }

  async remove(id: string): Promise<void> {
    try {
      const result = await this.collaboratorRepository.delete({ id });
      if (result.affected === 0) {
        throw new NotFoundException('Colaborador no encontrado.');
      }
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'No se puede eliminar: el colaborador tiene horas cargadas u otras asignaciones. Desactivalo en su lugar.',
        );
      }
      throw error;
    }
  }

  private resolveAllowedFields(
    target: CollaboratorEntity,
    requester: RequesterContext,
  ): Set<CollaboratorField> {
    if (requester.roles.includes(UserRole.ADMIN)) {
      return new Set(CollaboratorsService.ADMIN_FIELDS);
    }

    const fields = new Set<CollaboratorField>();
    if (target.userId && target.userId === requester.uid) {
      CollaboratorsService.SELF_FIELDS.forEach((field) => fields.add(field));
    }
    if (requester.roles.includes(UserRole.CONTABLE)) {
      CollaboratorsService.ACCOUNTANT_RATE_FIELDS.forEach((field) => fields.add(field));
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
