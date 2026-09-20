import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

const alteration: AlterationScript = {
  // Written to be safe to re-run: operators that manage the schema by hand apply this column
  // directly, and the automated runner must not fail on an already-migrated database.
  up: async (pool) => {
    await pool.query(sql`
      alter table tenants add column if not exists features jsonb not null default '{}'::jsonb;
    `);
  },
  down: async (pool) => {
    await pool.query(sql`
      alter table tenants drop column if exists features;
    `);
  },
};

export default alteration;
