import { defaultTenantIdKey, defaultTenantId as ossDefaultTenantId } from '@logto/schemas';
import { trySafe } from '@silverhand/essentials';
import { useCallback, useContext, useMemo } from 'react';
import { z } from 'zod';

import { isCloud, isMultiTenancy } from '@/consts/env';
import { TenantsContext } from '@/contexts/TenantsProvider';

import useCurrentUser from './use-current-user';

/**
 * A hook that gets the default tenant ID for the current user from user's `customData`.
 *
 * - By default, the default tenant ID is empty, which means the first tenant is the default tenant.
 * - If the default tenant ID is not available to the user anymore, it semantically equals to the first tenant ID.
 */
const useUserDefaultTenantId = () => {
  const { customData, updateCustomData } = useCurrentUser();
  const { tenants } = useContext(TenantsContext);
  /** The current stored default tenant ID in the user's `customData`. */
  const storedId = useMemo(
    () =>
      trySafe(
        () => z.object({ [defaultTenantIdKey]: z.string() }).parse(customData)[defaultTenantIdKey]
      ),
    [customData]
  );

  const defaultTenantId = useMemo(() => {
    // Single-tenant OSS always resolves to the fixed default tenant.
    if (!isCloud && !isMultiTenancy) {
      return ossDefaultTenantId;
    }

    // Ensure the stored ID is still available to the user.
    if (storedId && tenants.some(({ id }) => id === storedId)) {
      return storedId;
    }

    // Fall back to the first tenant ID.
    return tenants[0]?.id;
  }, [storedId, tenants]);

  const updateDefaultTenantId = useCallback(
    async (tenantId: string) => {
      // Only persist the last-visited tenant in Cloud; self-hosted falls back to the first tenant.
      if (!isCloud) {
        return;
      }

      await updateCustomData({
        [defaultTenantIdKey]: tenantId,
      });
    },
    [updateCustomData]
  );

  return useMemo(
    () => ({
      defaultTenantId,
      updateDefaultTenantId,
    }),
    [defaultTenantId, updateDefaultTenantId]
  );
};

export default useUserDefaultTenantId;
