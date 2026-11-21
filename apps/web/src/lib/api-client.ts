import axios from 'axios';

/**
 * Shared HTTP client. All calls go to `/api/v1`, proxied to NestJS by Vite in development.
 * Phase 1 auth adds: bearer-token injection and automatic refresh on 401.
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
