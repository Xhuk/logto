import { OidcModelInstances } from '@logto/schemas';
import { type CommonQueryMethods, sql } from '@silverhand/slonik';
import { z } from 'zod';

import { buildInsertIntoWithPool } from '#src/database/insert-into.js';
import { convertToIdentifiers, convertToTimestamp } from '#src/utils/sql.js';

const { table, fields } = convertToIdentifiers(OidcModelInstances);

/**
 * The `oidc_model_instances` model name sign-in login hints live under.
 *
 * Hints are short-lived, single-use, opaque handles for "this user already told the client who
 * they are", which is exactly what the OIDC model store already gives us: an opaque `id`, a
 * `payload`, an `expires_at` and `consumed_at` with a one-shot `consume`. Keeping them here
 * instead of a dedicated table avoids a schema change for a credential that lives ten minutes and
 * is read once; never reuse the `subject_tokens` table, since consuming one of those through the
 * token-exchange grant mints tokens without any password.
 */
const loginHintModelName = 'LoginHint';

/**
 * The hint payload. Deliberately carries no raw identifier: the point of the feature is that the
 * value the client typed never comes back out, so the row only keeps the user it resolves to, the
 * application it was minted for, and the masked confirmation to render.
 */
const loginHintPayloadGuard = z.object({
  userId: z.string(),
  clientId: z.string(),
  identifierType: z.string(),
  maskedIdentifier: z.string(),
});

export type LoginHintPayload = z.infer<typeof loginHintPayloadGuard>;

export type LoginHint = LoginHintPayload & { id: string };

export const createLoginHintQueries = (pool: CommonQueryMethods) => {
  const insertInstance = buildInsertIntoWithPool(pool)(OidcModelInstances);

  const insertLoginHint = async ({
    id,
    payload,
    expiresAt,
  }: {
    id: string;
    payload: LoginHintPayload;
    expiresAt: number;
  }) => {
    await insertInstance({ id, modelName: loginHintModelName, payload, expiresAt });
  };

  /**
   * An unexpired, unconsumed hint, or `undefined` when the token is unknown, already used, or past
   * its TTL. A payload that does not parse is treated the same way: a half-written hint must never
   * let a login through.
   */
  const findActiveLoginHint = async (id: string): Promise<LoginHint | undefined> => {
    const result = await pool.maybeOne<{ payload: unknown }>(sql`
      select ${fields.payload}
      from ${table}
      where ${fields.modelName} = ${loginHintModelName}
      and ${fields.id} = ${id}
      and ${fields.consumedAt} is null
      and ${fields.expiresAt} > ${convertToTimestamp()}
    `);

    if (!result) {
      return;
    }

    const parsed = loginHintPayloadGuard.safeParse(result.payload);

    return parsed.success ? { id, ...parsed.data } : undefined;
  };

  /**
   * Consume a hint. Returns whether this call was the one that consumed it, so two concurrent
   * password attempts cannot both ride the same token.
   */
  const consumeLoginHint = async (id: string) => {
    const { rowCount } = await pool.query(sql`
      update ${table}
      set ${fields.consumedAt} = ${convertToTimestamp()}
      where ${fields.modelName} = ${loginHintModelName}
      and ${fields.id} = ${id}
      and ${fields.consumedAt} is null
    `);

    return Boolean(rowCount);
  };

  /**
   * Drop hints past their TTL. Called when minting, so the table never accumulates dead rows
   * without a scheduled job; the `(tenant_id, expires_at)` index bounds the scan.
   */
  const deleteExpiredLoginHints = async () => {
    await pool.query(sql`
      delete from ${table}
      where ${fields.modelName} = ${loginHintModelName}
      and ${fields.expiresAt} <= ${convertToTimestamp()}
    `);
  };

  return {
    insertLoginHint,
    findActiveLoginHint,
    consumeLoginHint,
    deleteExpiredLoginHints,
  };
};
