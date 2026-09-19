import { createTenantDatabaseMetadata } from '@logto/core-kit';
import {
  adminTenantId,
  defaultManagementApiAdminName,
  getManagementApiResourceIndicator,
  PredefinedScope,
  type TenantFeatures,
  TenantTag,
} from '@logto/schemas';
import { Tenants } from '@logto/schemas/models';
import { generateStandardId } from '@logto/shared';
import { sql, type CommonQueryMethods } from '@silverhand/slonik';
import { z } from 'zod';

import { EnvSet } from '#src/env-set/index.js';
import RequestError from '#src/errors/RequestError/index.js';
import { convertToIdentifiers } from '#src/utils/sql.js';

const { table, fields } = convertToIdentifiers({
  table: Tenants.tableName,
  fields: Tenants.rawKeys,
});

/** Safe tenant shape exposed through the Management API (no DB credentials). */
export const tenantResponseGuard = Tenants.guard()
  .pick({
    id: true,
    name: true,
    tag: true,
    features: true,
    isSuspended: true,
    createdAt: true,
  })
  // The driver returns `timestamptz` as a millisecond epoch number, so coerce it to a Date.
  .extend({ createdAt: z.coerce.date() });

type TenantResponse = z.infer<typeof tenantResponseGuard>;

const notFound = () => new RequestError({ code: 'entity.not_found', status: 404 });

/**
 * The tenant management control plane runs on the shared (owner) pool, which bypasses row-level
 * security by design: a tenant-scoped role cannot see other tenants nor read the `tenants` table's
 * `features` column. This pool can create/drop database roles and tenants, so callers must be
 * reached only through the strictly authenticated tenant-management routes (see `routes/init.ts`).
 */
const getSharedPool = async (): Promise<CommonQueryMethods> => EnvSet.sharedPool;

/**
 * Grant the OSS admin console role access to the Management API of a user tenant.
 *
 * The console authenticates against the admin tenant, so the admin tenant must expose the new
 * tenant's Management API as a resource and grant the console admin role the `all` scope on it.
 * User tenants already accept admin-tenant-issued tokens (see the admin token validation set in
 * the auth middleware), so no token exchange is required.
 */
const grantAdminConsoleAccessToTenant = async (
  pool: CommonQueryMethods,
  tenantId: string
): Promise<void> => {
  const adminRole = await pool.maybeOne<{ id: string }>(sql`
    select id from roles
    where tenant_id = ${adminTenantId} and name = ${defaultManagementApiAdminName}
  `);

  // The OSS admin role is created at seed time; skip when it is not present (e.g. custom setups).
  if (!adminRole) {
    return;
  }

  const { id: resourceId } = await pool.one<{ id: string }>(sql`
    insert into resources (tenant_id, id, name, indicator)
    values (
      ${adminTenantId},
      ${generateStandardId()},
      ${`Logto Management API for tenant ${tenantId}`},
      ${getManagementApiResourceIndicator(tenantId)}
    )
    on conflict (tenant_id, indicator) do update set name = excluded.name
    returning id
  `);

  const { id: scopeId } = await pool.one<{ id: string }>(sql`
    insert into scopes (tenant_id, id, resource_id, name, description)
    values (
      ${adminTenantId},
      ${generateStandardId()},
      ${resourceId},
      ${PredefinedScope.All},
      ${'Default scope for Management API, allows all permissions.'}
    )
    on conflict (tenant_id, resource_id, name) do update set description = excluded.description
    returning id
  `);

  await pool.query(sql`
    insert into roles_scopes (tenant_id, id, role_id, scope_id)
    values (${adminTenantId}, ${generateStandardId()}, ${adminRole.id}, ${scopeId})
    on conflict (tenant_id, role_id, scope_id) do nothing
  `);
};

const findAllTenants = async (): Promise<TenantResponse[]> => {
  const pool = await getSharedPool();
  const { rows } = await pool.query(sql`
    select ${fields.id}, ${fields.name}, ${fields.tag}, ${fields.features}, ${fields.isSuspended}, ${fields.createdAt}
    from ${table}
    order by ${fields.createdAt}
  `);

  return rows.map((row) => tenantResponseGuard.parse(row));
};

const findTenantById = async (id: string): Promise<TenantResponse> => {
  const pool = await getSharedPool();
  const row = await pool.maybeOne(sql`
    select ${fields.id}, ${fields.name}, ${fields.tag}, ${fields.features}, ${fields.isSuspended}, ${fields.createdAt}
    from ${table}
    where ${fields.id} = ${id}
  `);

  if (!row) {
    throw notFound();
  }

  return tenantResponseGuard.parse(row);
};

const createTenant = async (data: { name: string; tag?: TenantTag }): Promise<TenantResponse> => {
  const pool = await getSharedPool();
  const { currentDatabase } = await pool.one<{ currentDatabase: string }>(sql`
    select current_database();
  `);
  const database = currentDatabase.replaceAll('-', '_');
  const { id: tenantId, parentRole, role, password } = createTenantDatabaseMetadata(database);

  await pool.query(sql`
    insert into ${table} (${fields.id}, ${fields.dbUser}, ${fields.dbUserPassword}, ${fields.name}, ${fields.tag})
    values (${tenantId}, ${role}, ${password}, ${data.name}, ${data.tag ?? TenantTag.Development})
  `);
  await pool.query(sql`
    create role ${sql.identifier([role])} with inherit login
      password '${sql.raw(password)}'
      in role ${sql.identifier([parentRole])};
  `);

  await grantAdminConsoleAccessToTenant(pool, tenantId);

  return findTenantById(tenantId);
};

const deleteTenant = async (id: string): Promise<void> => {
  if (id === adminTenantId) {
    throw new RequestError({ code: 'auth.forbidden', status: 403 });
  }

  const pool = await getSharedPool();
  const row = await pool.maybeOne<{ dbUser: unknown }>(sql`
    select ${fields.dbUser} from ${table} where ${fields.id} = ${id}
  `);

  if (!row) {
    throw notFound();
  }

  // `db_user` is nullable; only drop the role when a value is actually present.
  if (typeof row.dbUser === 'string') {
    await pool.query(sql`drop role ${sql.identifier([row.dbUser])}`);
  }

  await pool.query(sql`delete from ${table} where ${fields.id} = ${id}`);
};

const updateTenant = async (
  id: string,
  data: { name?: string; tag?: TenantTag }
): Promise<TenantResponse> => {
  const pool = await getSharedPool();
  await pool.query(sql`
    update ${table}
    set
      ${fields.name} = coalesce(${data.name ?? null}, ${fields.name}),
      ${fields.tag} = coalesce(${data.tag ?? null}, ${fields.tag})
    where ${fields.id} = ${id}
  `);

  return findTenantById(id);
};

const setTenantFeatures = async (id: string, features: TenantFeatures): Promise<TenantResponse> => {
  const pool = await getSharedPool();
  await pool.query(sql`
    update ${table}
    set ${fields.features} = ${sql.jsonb(features)}
    where ${fields.id} = ${id}
  `);

  return findTenantById(id);
};

const setTenantSuspended = async (id: string, isSuspended: boolean): Promise<TenantResponse> => {
  const pool = await getSharedPool();
  await pool.query(sql`
    update ${table}
    set ${fields.isSuspended} = ${isSuspended}
    where ${fields.id} = ${id}
  `);

  return findTenantById(id);
};

export const createTenantLibrary = () => ({
  findAllTenants,
  findTenantById,
  createTenant,
  deleteTenant,
  updateTenant,
  setTenantFeatures,
  setTenantSuspended,
});
