import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

const alteration: AlterationScript = {
  // `group_name` groups tenants of the same product across environments (dev/prod) for the console
  // picker. It is presentational metadata only: tenants stay isolated. Idempotent so operators that
  // apply the column by hand do not fail the automated runner.
  up: async (pool) => {
    await pool.query(sql`
      alter table tenants add column if not exists group_name varchar(128);
    `);
  },
  down: async (pool) => {
    await pool.query(sql`
      alter table tenants drop column if exists group_name;
    `);
  },
};

export default alteration;
