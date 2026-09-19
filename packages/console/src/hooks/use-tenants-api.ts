import { useLogto } from '@logto/react';
import { adminTenantId, getManagementApiResourceIndicator } from '@logto/schemas';
import ky from 'ky';
import { useMemo } from 'react';

import { adminTenantEndpoint } from '@/consts';

/**
 * A Ky instance for the tenant management (control plane) API.
 *
 * The console authenticates against the admin tenant, so a token for the admin tenant's Management
 * API is used to reach `/api/tenants`. User tenants accept admin-tenant-issued tokens, so the same
 * token also works for per-tenant calls if needed.
 */
export const useTenantsApi = () => {
  const { isAuthenticated, getAccessToken } = useLogto();

  return useMemo(
    () =>
      ky.create({
        prefixUrl: adminTenantEndpoint,
        hooks: {
          beforeRequest: [
            async (request) => {
              if (!isAuthenticated) {
                return;
              }

              const accessToken = await getAccessToken(
                getManagementApiResourceIndicator(adminTenantId)
              );

              request.headers.set('Authorization', `Bearer ${accessToken ?? ''}`);
            },
          ],
        },
      }),
    [getAccessToken, isAuthenticated]
  );
};
