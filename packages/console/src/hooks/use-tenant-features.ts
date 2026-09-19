import { type TenantFeature } from '@logto/schemas';
import { isKeyInObject } from '@silverhand/essentials';
import { useContext, useMemo } from 'react';

import { TenantsContext } from '@/contexts/TenantsProvider';

type TenantFeatures = Record<string, boolean>;

const isTenantFeatures = (value: unknown): value is TenantFeatures =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((flag) => typeof flag === 'boolean');

/** Read the current tenant's feature flags (a missing map means all features are enabled). */
export const useTenantFeatures = (): TenantFeatures => {
  const { currentTenant } = useContext(TenantsContext);

  return useMemo<TenantFeatures>(() => {
    if (!currentTenant || !isKeyInObject(currentTenant, 'features')) {
      return {};
    }

    return isTenantFeatures(currentTenant.features) ? currentTenant.features : {};
  }, [currentTenant]);
};

/** Whether the given feature is enabled for the current tenant (a missing flag is enabled). */
export const useFeature = (feature: TenantFeature): boolean => {
  const features = useTenantFeatures();

  return features[feature] !== false;
};
