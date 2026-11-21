import type { PermissionCode, UserStatus } from '@school/shared';

/** The authenticated user attached to `request.user` by the AccessGuard. */
export interface RequestUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  roles: string[];
  permissions: Set<PermissionCode>;
  /** Refresh-token family (login session) the current access token belongs to. */
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}
