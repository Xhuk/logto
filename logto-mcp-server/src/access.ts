import { AsyncLocalStorage } from 'node:async_hooks';

/** Cursor OAuth subject for the current MCP request. Absent in stdio mode. */
export const accessContext = new AsyncLocalStorage<{ subject: string }>();

export const getAccessSubject = (): string | undefined => accessContext.getStore()?.subject;

/** OSS role that marks the control-plane admin. That login can manage every tenant. */
export const controlPlaneAdminRole = 'default:admin';

export type LoginIdentity = {
  id: string;
  username?: string;
  email?: string;
};

export type TenantUser = {
  id: string;
  username?: string | null;
  primaryEmail?: string | null;
};

/**
 * The OAuth subject is the admin-tenant user id. A tenant admin is the same person inside
 * that tenant: same id, or the same username, or the same email. Username stays case-sensitive.
 */
export const samePerson = (login: LoginIdentity, user: TenantUser): boolean => {
  if (user.id === login.id) {
    return true;
  }

  if (login.username && user.username === login.username) {
    return true;
  }

  if (!login.email || !user.primaryEmail) {
    return false;
  }

  return login.email.toLowerCase() === user.primaryEmail.toLowerCase();
};
