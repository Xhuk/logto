import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';

import {
  AccountCenters,
  createDefaultAccountCenter,
  createDefaultSignInExperience,
  getSeededOidcPrivateKeys,
  LogtoConfigs,
  LogtoOidcConfigKey,
  SignInExperiences,
} from '@logto/schemas';
import { generateStandardId, generateStandardSecret } from '@logto/shared';
import { sql, type CommonQueryMethods, type SqlToken } from '@silverhand/slonik';

import { EnvSet } from '#src/env-set/index.js';
import { convertToIdentifiers, type FieldIdentifiers } from '#src/utils/sql.js';

const { table: logtoConfigsTable, fields: logtoConfigFields } = convertToIdentifiers(LogtoConfigs);

const { table: signInExperiencesTable, fields: signInExperienceFields } =
  convertToIdentifiers(SignInExperiences);

const { table: accountCentersTable, fields: accountCenterFields } =
  convertToIdentifiers(AccountCenters);

/** An OIDC key entry, in the shape the config guards expect. */
const createSeedKey = (value: string) => ({
  id: generateStandardId(),
  value,
  createdAt: Math.floor(Date.now() / 1000),
});

/**
 * Build the SQL for a single seed value.
 *
 * Object and array values are sent as JSON, since these tables hold JSON columns and the driver
 * cannot infer the type of a JavaScript object.
 */
const toSeedValue = (value: unknown): SqlToken => {
  if (value === null) {
    return sql`null`;
  }

  if (typeof value === 'object') {
    return sql`${JSON.stringify(value)}::jsonb`;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return sql`${value}`;
  }

  throw new TypeError(`Unsupported seed value type: ${typeof value}`);
};

/**
 * Insert a seed row through the shared pool.
 *
 * JavaScript keys are mapped to their database columns through the table's field identifiers.
 * `on conflict do nothing` keeps the call idempotent.
 */
const insertSeedRow = async <Key extends string>(
  pool: CommonQueryMethods,
  table: SqlToken,
  fields: FieldIdentifiers<Key>,
  row: Partial<Record<Key, unknown>>
): Promise<void> => {
  // eslint-disable-next-line no-restricted-syntax -- Object.entries can only return string keys
  const entries = Object.entries(row) as Array<[Key, unknown]>;
  const columns = entries.map(([column]) => fields[column]);
  const values = entries.map(([, value]) => toSeedValue(value));

  await pool.query(sql`
    insert into ${table} (${sql.join(columns, sql`, `)})
    values (${sql.join(values, sql`, `)})
    on conflict do nothing
  `);
};

/**
 * Seed the OIDC configs of a newly created tenant.
 *
 * `EnvSet.load` requires `oidc.privateKeys` and `oidc.cookieKeys` for a tenant before it can be
 * instantiated, and the OSS seed only covers the `default` and `admin` tenants. Without this, a new
 * tenant exists in the control plane while every request to it fails with "Failed to get configs".
 *
 * The tenant gets its own signing key, so the tokens it issues are signed by a key unique to it.
 * This mirrors what `logto db seed` writes for the seeded tenants.
 */
const seedTenantOidcConfigs = async (pool: CommonQueryMethods, tenantId: string): Promise<void> => {
  const { privateKey } = await promisify(generateKeyPair)('ec', {
    // Match the curve Logto generates for its own signing keys; the OIDC provider must agree with
    // the key's actual curve.
    namedCurve: 'secp384r1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const configs = [
    {
      key: LogtoOidcConfigKey.PrivateKeys,
      value: getSeededOidcPrivateKeys([createSeedKey(privateKey)]),
    },
    { key: LogtoOidcConfigKey.CookieKeys, value: [createSeedKey(generateStandardSecret())] },
  ] as const;

  await Promise.all(
    configs.map(async ({ key, value }) =>
      pool.query(sql`
        insert into ${logtoConfigsTable} (${logtoConfigFields.tenantId}, ${logtoConfigFields.key}, ${logtoConfigFields.value})
        values (${tenantId}, ${key}, ${sql.jsonb(value)})
        on conflict (${logtoConfigFields.tenantId}, ${logtoConfigFields.key}) do nothing
      `)
    )
  );
};

/**
 * Seed every piece of data a new tenant needs before it can serve requests.
 *
 * The sign-in experience and account center are read through the well-known cache, whose guards
 * reject a missing row, so a tenant without them serves an internal error on the sign-in page and
 * in the account center.
 */
export const seedNewTenant = async (pool: CommonQueryMethods, tenantId: string): Promise<void> => {
  await seedTenantOidcConfigs(pool, tenantId);
  await insertSeedRow(
    pool,
    signInExperiencesTable,
    signInExperienceFields,
    createDefaultSignInExperience(tenantId, EnvSet.values.isCloud)
  );
  await insertSeedRow(
    pool,
    accountCentersTable,
    accountCenterFields,
    createDefaultAccountCenter(tenantId)
  );
};

/** Remove the tenant-scoped data seeded by {@link seedNewTenant}. */
export const removeTenantSeedData = async (
  pool: CommonQueryMethods,
  tenantId: string
): Promise<void> => {
  await pool.query(sql`
    delete from ${logtoConfigsTable} where ${logtoConfigFields.tenantId} = ${tenantId}
  `);
  await pool.query(sql`
    delete from ${signInExperiencesTable} where ${signInExperienceFields.tenantId} = ${tenantId}
  `);
  await pool.query(sql`
    delete from ${accountCentersTable} where ${accountCenterFields.tenantId} = ${tenantId}
  `);
};
