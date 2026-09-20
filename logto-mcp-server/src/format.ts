export type ResponseFormat = 'json' | 'markdown';

/** Tenant shape returned by the Logto tenant management API. */
export type Tenant = {
  id: string;
  name: string;
  tag: string;
  groupName?: string | null;
  features: Record<string, boolean>;
  isSuspended: boolean;
  createdAt: string;
};

const formatFeatures = (features: Record<string, boolean>): string => {
  const entries = Object.entries(features);

  if (entries.length === 0) {
    return '_all enabled (defaults)_';
  }

  return entries.map(([key, enabled]) => `${enabled ? 'enabled' : 'disabled'}: \`${key}\``).join(', ');
};

const formatDate = (value: string): string => {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

export const tenantToMarkdown = (tenant: Tenant): string =>
  [
    `### ${tenant.name} (\`${tenant.id}\`)`,
    `- Tag: ${tenant.tag}`,
    ...(tenant.groupName ? [`- Group: ${tenant.groupName}`] : []),
    `- Suspended: ${tenant.isSuspended ? 'yes' : 'no'}`,
    `- Features: ${formatFeatures(tenant.features)}`,
    `- Created at: ${formatDate(tenant.createdAt)}`,
  ].join('\n');

export const tenantsToMarkdown = (tenants: Tenant[]): string =>
  tenants.length === 0
    ? '_No tenants found._'
    : tenants.map((tenant) => tenantToMarkdown(tenant)).join('\n\n');

/** Render a value as either pretty-printed JSON or human-readable Markdown. */
export const render = <Value>(
  value: Value,
  format: ResponseFormat,
  toMarkdown: (value: Value) => string
): string => (format === 'json' ? JSON.stringify(value, null, 2) : toMarkdown(value));
