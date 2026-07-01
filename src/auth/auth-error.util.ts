// Traduce los códigos de error de la REST API de Firebase (Identity Toolkit) a los
// mismos códigos "auth/xxx" que exponía el SDK de cliente (FirebaseError.code), para
// que el frontend pueda seguir mostrando los mismos mensajes que mostraba antes.
const CODE_MAP: Record<string, { code: string; message: string }> = {
  EMAIL_NOT_FOUND: {
    code: 'auth/user-not-found',
    message: 'No existe una cuenta asociada a este correo electrónico.',
  },
  INVALID_EMAIL: {
    code: 'auth/invalid-email',
    message: 'El correo ingresado no tiene un formato válido.',
  },
  MISSING_EMAIL: {
    code: 'auth/missing-email',
    message: 'Ingresa un correo electrónico para continuar.',
  },
  TOO_MANY_ATTEMPTS_TRY_LATER: {
    code: 'auth/too-many-requests',
    message: 'Se realizaron demasiados intentos. Por favor, espera unos minutos antes de volver a intentarlo.',
  },
  NETWORK_ERROR: {
    code: 'auth/network-request-failed',
    message: 'No pudimos conectarnos al servidor. Revisa tu conexión a internet e inténtalo nuevamente.',
  },
};

const DEFAULT_ERROR = {
  code: 'auth/unknown-error',
  message: 'No se pudo enviar el correo de restablecimiento. Por favor, verifica la información e inténtalo nuevamente.',
};

export function mapIdentityToolkitError(identityToolkitCode: string): { code: string; message: string } {
  return CODE_MAP[identityToolkitCode] ?? DEFAULT_ERROR;
}
