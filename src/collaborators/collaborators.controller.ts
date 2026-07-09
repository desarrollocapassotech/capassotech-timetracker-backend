import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CollaboratorsService } from './collaborators.service';
import type { CreateCollaboratorDto, UpdateCollaboratorDto } from './collaborators.dto';

// La lectura queda abierta a cualquier usuario autenticado: la lista de
// colaboradores se usa en toda la app (time entries, equipos de proyecto,
// historial de clientes, etc.), no solo en la pantalla de gestión.
@UseGuards(FirebaseAuthGuard)
@Controller('collaborators')
export class CollaboratorsController {
  constructor(
    private readonly collaboratorsService: CollaboratorsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  findAll() {
    return this.collaboratorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.collaboratorsService.findOne(id);
  }

  // Alta: solo admin (igual que hoy, el botón "Nuevo Colaborador" no se muestra
  // para contable en EmployeeManagement.tsx).
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() body: CreateCollaboratorDto) {
    return this.collaboratorsService.create(body);
  }

  // Edición: admin (todo), contable (solo sueldo) o el propio colaborador sobre su
  // perfil (datos personales). El detalle de qué campos aplica cada rol vive en
  // CollaboratorsService.resolveAllowedFields, no en un guard genérico, porque
  // depende de si el request es sobre uno mismo.
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCollaboratorDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    const requesterProfile = await this.authService.getProfile(user.uid, user.email);
    return this.collaboratorsService.update(id, body, {
      uid: user.uid,
      roles: requesterProfile.roles,
    });
  }

  // Foto de perfil: mismo criterio de permisos que update() (ver
  // CollaboratorsService.resolveAllowedFields) — admin, o el propio colaborador
  // sobre su perfil. Sube directo a Firebase Storage vía el backend, en vez de
  // subir desde el navegador como antes.
  @Post(':id/profile-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadProfileImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    const requesterProfile = await this.authService.getProfile(user.uid, user.email);
    return this.collaboratorsService.uploadProfileImage(id, file, {
      uid: user.uid,
      roles: requesterProfile.roles,
    });
  }

  // Baja definitiva: solo admin (igual que hoy, el botón de eliminar no se
  // muestra para contable). Desactivar es un PATCH { active: false }, no esto.
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.collaboratorsService.remove(id);
  }
}
