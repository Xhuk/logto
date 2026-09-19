import {
  adminTenantId,
  LogtoConfigs,
  LogtoOidcConfigKey,
  type OidcPrivateKey,
  oidcPrivateKeyGuard,
  type TenantFeatures,
} from '@logto/schemas';
import { Tenants } from '@logto/schemas/models';
import { conditional } from '@silverhand/essentials';
import { parseDsn, sql, stringifyDsn } from '@silverhand/slonik';
import { z } from 'zod';

import { EnvSet } from '#src/env-set/index.js';
import { convertToIdentifiers } from '#src/utils/sql.js';

export class TenantNotFoundError extends Error {
  name = 'TenantNotFoundError';
}

const { table: logtoConfigsTable, fields: logtoConfigFields } = convertToIdentifiers(LogtoConfigs);

/**
 * This function is to fetch the tenant password for the corresponding Postgres user.
 *
 * ** **CAUTION** ** In multi-tenancy mode, Logto should ALWAYS use a restricted user with RLS enforced to ensure data isolation between tenants.
 */
export const getTenantDatabaseDsn = async (tenantId: string) => {
  const { sharedPool, dbUrl } = EnvSet;
  const {
    tableName,
    rawKeys: { id, dbUser, dbUserPassword },
  } = Tenants;

  const identifier = (id: string) => sql.identifier([id]);
  const pool = await sharedPool;

  const { rows } = await pool.query(sql`
    select ${identifier(dbUser)}, ${identifier(dbUserPassword)}
    from ${identifier(tableName)}
    where ${identifier(id)} = ${tenantId}
  `);

  if (!rows[0]) {
    throw new TenantNotFoundError(`Cannot find valid tenant credentials for ID ${tenantId}`);
  }

  const options = parseDsn(dbUrl);
  const { dbUser: username, dbUserPassword: password } = z
    .object({ dbUser: z.string(), dbUserPassword: z.string().optional() })
    .parse(rows[0]);

  return stringifyDsn({
    ...options,
    username,
    password: conditional(typeof password === 'string' && password),
  });
};

/**
 * Read the per-tenant feature flags.
 *
 * Like {@link getTenantDatabaseDsn}, this uses the shared pool: the `tenants` table is RLS-scoped
 * and its read grant for tenant roles does not include the `features` column.
 */
export const getTenantFeatures = async (tenantId: string): Promise<TenantFeatures> => {
  const pool = await EnvSet.sharedPool;
  const {
    tableName,
    rawKeys: { features, id },
  } = Tenants;

  const identifier = (key: string) => sql.identifier([key]);

  const { rows } = await pool.query<{ features: TenantFeatures }>(sql`
    select ${identifier(features)}
    from ${identifier(tableName)}
    where ${identifier(id)} = ${tenantId}
  `);

  return rows[0]?.features ?? {};
};

/**
 * Read admin tenant signing keys through the shared pool for OSS admin token validation.
 *
 * Like `getTenantDatabaseDsn`, this cannot use tenant-scoped Queries because callers may need
 * admin tenant keys while running in a user tenant whose pool is scoped by RLS.
 */
export const getAdminTenantPrivateSigningKeys = async (): Promise<OidcPrivateKey[]> => {
  const pool = await EnvSet.sharedPool;
  const { value } = await pool.one<{ value: unknown }>(sql`
    select ${logtoConfigFields.value} from ${logtoConfigsTable}
      where ${logtoConfigFields.tenantId} = ${adminTenantId}
      and ${logtoConfigFields.key} = ${LogtoOidcConfigKey.PrivateKeys}
  `);

  return oidcPrivateKeyGuard.array().parse(value);
};
