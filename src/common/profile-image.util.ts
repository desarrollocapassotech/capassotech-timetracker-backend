import { BadRequestException } from '@nestjs/common';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB, mismo límite que mostraba la UI

export function assertValidImageFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('Falta el archivo de imagen.');
  }
  if (!file.mimetype?.startsWith('image/')) {
    throw new BadRequestException('El archivo debe ser una imagen (JPG, PNG, GIF).');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new BadRequestException('La imagen no puede superar los 5MB.');
  }
}

function fileExtension(originalName: string): string {
  const parts = originalName.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'jpg';
}

// Mismo esquema de rutas que usaba antes el frontend al subir directo a Firebase
// Storage (colaborador-profiles/{id}-{timestamp}.{ext}), para que las fotos ya
// guardadas convivan sin problema con las nuevas.
export function buildCollaboratorImagePath(collaboratorId: string, originalName: string): string {
  return `colaborador-profiles/${collaboratorId}-${Date.now()}.${fileExtension(originalName)}`;
}

export function buildClientImagePath(clientId: string, originalName: string): string {
  return `client-profiles/${clientId}-${Date.now()}.${fileExtension(originalName)}`;
}
