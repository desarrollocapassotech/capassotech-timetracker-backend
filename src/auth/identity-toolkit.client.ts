import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Cliente mínimo sobre la REST API pública de Firebase Auth (Identity Toolkit),
// la misma que usa el SDK de cliente (firebase/auth) por debajo. Se usa server-side
// para no depender del SDK de cliente en el frontend, siguiendo usando Firebase Auth
// como proveedor de identidad.
// Docs: https://firebase.google.com/docs/reference/rest/auth

export interface IdentityToolkitError {
  code: number;
  message: string;
}

export class IdentityToolkitException extends Error {
  constructor(public readonly identityToolkitCode: string) {
    super(identityToolkitCode);
  }
}

interface SignInResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email: string;
}

interface RefreshTokenResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
}

@Injectable()
export class IdentityToolkitClient {
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('FIREBASE_API_KEY');
  }

  async signInWithPassword(email: string, password: string): Promise<SignInResponse> {
    return this.post<SignInResponse>('accounts:signInWithPassword', {
      email,
      password,
      returnSecureToken: true,
    });
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    await this.post(
      'accounts:sendOobCode',
      { requestType: 'PASSWORD_RESET', email },
      { 'X-Firebase-Locale': 'es' },
    );
  }

  async refreshIdToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new IdentityToolkitException(body?.error?.message ?? 'REFRESH_TOKEN_FAILED');
    }
    return body as RefreshTokenResponse;
  }

  private async post<T>(
    endpoint: string,
    payload: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extraHeaders },
          body: JSON.stringify(payload),
        },
      );
    } catch {
      throw new IdentityToolkitException('NETWORK_ERROR');
    }

    let body: { error?: IdentityToolkitError } & Record<string, unknown>;
    try {
      body = await response.json();
    } catch {
      throw new InternalServerErrorException('Respuesta inválida del proveedor de autenticación.');
    }

    if (!response.ok) {
      throw new IdentityToolkitException(body.error?.message ?? 'UNKNOWN_ERROR');
    }

    return body as T;
  }
}
