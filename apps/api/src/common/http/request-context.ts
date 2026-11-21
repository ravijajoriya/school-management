import type { Request } from 'express';
import { isIP } from 'node:net';

/** Client metadata recorded on audit events and refresh tokens. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export function getRequestContext(req: Request): RequestContext {
  const ip = req.ip ?? null;
  const ua = req.headers['user-agent'];
  return {
    // The DB column is INET; store only syntactically valid addresses.
    ipAddress: ip && isIP(ip) ? ip : null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null,
  };
}
