import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { errorMessages, splitFieldErrors } from './api-client';

function apiError(message: string | string[], status = 400) {
  const headers = new AxiosHeaders();
  return new AxiosError('failed', 'ERR_BAD_REQUEST', { headers }, null, {
    status,
    statusText: '',
    headers: {},
    config: { headers },
    data: { statusCode: status, error: 'Bad Request', message, path: '/x', timestamp: '' },
  });
}

describe('api-client error helpers', () => {
  it('returns API messages as a list', () => {
    expect(errorMessages(apiError('Not allowed', 403))).toEqual(['Not allowed']);
    expect(errorMessages(apiError(['a', 'b']))).toEqual(['a', 'b']);
  });

  it('explains network failures', () => {
    const offline = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(errorMessages(offline)).toEqual(['Cannot reach the server. Check your connection.']);
  });

  it('falls back to a generic message', () => {
    expect(errorMessages(new Error('boom'))).toEqual(['Something went wrong. Please try again.']);
  });

  it('splits "field: message" entries into form field errors', () => {
    const result = splitFieldErrors(
      apiError([
        'email: This email address is already in use',
        'roleIds: Select at least one role',
        'At least one active Admin must remain',
      ]),
    );
    expect(result.fields).toEqual({
      email: 'This email address is already in use',
      roleIds: 'Select at least one role',
    });
    expect(result.general).toEqual(['At least one active Admin must remain']);
  });
});
