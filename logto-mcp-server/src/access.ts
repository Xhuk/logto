import { AsyncLocalStorage } from 'node:async_hooks';

/** Cursor OAuth subject for the current MCP request. Absent in stdio mode. */
export const accessContext = new AsyncLocalStorage<{ subject: string }>();

export const getAccessSubject = (): string | undefined => accessContext.getStore()?.subject;

/** OSS role that marks the control-plane admin. That login can manage every tenant. */
export const controlPlaneAdminRole = 'default:admin';
