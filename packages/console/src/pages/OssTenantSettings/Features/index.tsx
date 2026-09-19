import { TenantFeature } from '@logto/schemas';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';

import { TenantsContext } from '@/contexts/TenantsProvider';
import { useTenantFeatures } from '@/hooks/use-tenant-features';
import { useTenantsApi } from '@/hooks/use-tenants-api';

import styles from './index.module.scss';

/**
 * Minimal per-tenant feature flag editor.
 *
 * Reads the current tenant's flags (missing = enabled) and writes them through the tenant
 * management API (`PATCH /api/tenants/:id/features`). Intentionally dependency-free so it works in
 * any self-hosted deployment.
 */
function Features() {
  const api = useTenantsApi();
  const { currentTenantId } = useContext(TenantsContext);
  const storedFeatures = useTenantFeatures();

  const [features, setFeatures] = useState<Record<string, boolean>>(storedFeatures);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync the local state when the selected tenant (and thus its flags) changes.
  useEffect(() => {
    setFeatures(storedFeatures);
  }, [storedFeatures]);

  const toggle = (feature: TenantFeature) => {
    setFeatures((previous) => ({ ...previous, [feature]: previous[feature] === false }));
  };

  const save = async () => {
    setIsSaving(true);

    try {
      await api.patch(`api/tenants/${currentTenantId}/features`, { json: { features } });
      toast.success('Feature flags updated.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Tenant features</h2>
      <p className={styles.description}>
        Enable or disable features for <strong>{currentTenantId}</strong>. A missing flag is treated
        as enabled.
      </p>
      <ul className={styles.list}>
        {Object.values(TenantFeature).map((feature) => (
          <li key={feature} className={styles.item}>
            <label className={styles.label}>
              <input
                type="checkbox"
                checked={features[feature] !== false}
                onChange={() => {
                  toggle(feature);
                }}
              />
              <code>{feature}</code>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.saveButton}
        disabled={isSaving || !currentTenantId}
        onClick={() => {
          void save();
        }}
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default Features;
