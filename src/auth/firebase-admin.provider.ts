import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { readFileSync } from 'fs';
import * as path from 'path';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';

// Requiere una Service Account de Firebase (proyecto "capassotech-timetracker").
// Generarla en Firebase Console -> Configuración del proyecto -> Cuentas de
// servicio -> Generar nueva clave privada, y guardar el JSON en la ruta indicada
// por FIREBASE_SERVICE_ACCOUNT_PATH (por defecto ./firebase-service-account.json
// en la raíz del backend). No se commitea: ver .gitignore.
export const firebaseAdminProvider: Provider = {
  provide: FIREBASE_ADMIN,
  inject: [ConfigService],
  useFactory: (config: ConfigService): App => {
    if (getApps().length > 0) {
      return getApp();
    }

    const relativePath =
      config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ?? 'firebase-service-account.json';
    const serviceAccountPath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(process.cwd(), relativePath);

    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    return initializeApp({
      credential: cert(serviceAccount),
    });
  },
};
