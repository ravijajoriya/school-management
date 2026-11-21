import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse } from '@school/shared';

/**
 * Shared HTTP client. All calls go to `/api/v1` (proxied to NestJS by Vite in development).
 *
 * Session model:
 *  - The access token lives only in memory (never localStorage), so XSS can't read it from storage.
 *  - The refresh token is an httpOnly cookie scoped to /api/v1/auth; the browser sends it to
 *    /auth/refresh automatically.
 *  - On a 401 the client refreshes once (concurrent requests share one refresh), then retries.
 */
export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/** Shape of every error body returned by the API (see AllExceptionsFilter). */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}

// --- In-memory session state ------------------------------------------------------

let accessToken: string | null = null;
type SessionListener = (session: AuthResponse | null) => void;
const listeners = new Set<SessionListener>();

export const session = {
  set(auth: AuthResponse | null) {
    accessToken = auth?.accessToken ?? null;
    listeners.forEach((l) => l(auth));
  },
  hasToken: () => accessToken !== null,
  subscribe(listener: SessionListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

// --- Refresh (single flight) -------------------------------------------------------

let refreshInFlight: Promise<AuthResponse> | null = null;

async function doRefresh(): Promise<AuthResponse> {
  try {
    const { data } = await axios.post<AuthResponse>('/api/v1/auth/refresh', null, {
      withCredentials: true,
    });
    return data;
  } catch (error) {
    // Another tab may have rotated the cookie a moment ago: retry once with the newer cookie.
    const message = (error as AxiosError<ApiError>).response?.data?.message;
    if (message === 'Refresh token already rotated') {
      await new Promise((r) => setTimeout(r, 300));
      const { data } = await axios.post<AuthResponse>('/api/v1/auth/refresh', null, {
        withCredentials: true,
      });
      return data;
    }
    throw error;
  }
}

/** Exchanges the refresh cookie for a new session. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthResponse> {
  refreshInFlight ??= doRefresh()
    .then((auth) => {
      session.set(auth);
      return auth;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

// --- Interceptors -------------------------------------------------------------------

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        await refreshSession();
        return apiClient(original);
      } catch {
        session.set(null);
      }
    }
    return Promise.reject(error);
  },
);

// --- Error helpers ------------------------------------------------------------------

/** Returns the API's error messages as a list ("field: message" entries are kept as-is). */
export function errorMessages(error: unknown): string[] {
  const data = (error as AxiosError<ApiError>)?.response?.data;
  if (data?.message) return Array.isArray(data.message) ? data.message : [data.message];
  if ((error as AxiosError)?.code === 'ERR_NETWORK')
    return ['Cannot reach the server. Check your connection.'];
  return ['Something went wrong. Please try again.'];
}

/**
 * Splits API messages into per-field errors ("email: already in use") and general errors.
 * Use with react-hook-form's setError to show server validation next to inputs.
 */
export function splitFieldErrors(error: unknown): {
  fields: Record<string, string>;
  general: string[];
} {
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const msg of errorMessages(error)) {
    const match = /^([A-Za-z][\w.]*): (.+)$/.exec(msg);
    if (match && !fields[match[1]]) fields[match[1]] = match[2];
    else general.push(msg);
  }
  return { fields, general };
}

export const apiStatus = (error: unknown) => (error as AxiosError)?.response?.status;
export const apiErrorCode = (error: unknown) =>
  (error as AxiosError<ApiError>)?.response?.data?.error;
