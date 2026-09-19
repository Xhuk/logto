import { useLogto } from '@logto/react';
import { conditional, trySafe, yes } from '@silverhand/essentials';
import { useContext, useEffect } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';

import { useCloudApi } from '@/cloud/hooks/use-cloud-api';
import { type TenantResponse } from '@/cloud/types/router';
import AppLoading from '@/components/AppLoading';
import { searchKeys } from '@/consts';
import { isCloud, isMultiTenancy } from '@/consts/env';
import { TenantsContext } from '@/contexts/TenantsProvider';
import useRedirectUri from '@/hooks/use-redirect-uri';
import { useTenantsApi } from '@/hooks/use-tenants-api';
import { saveRedirect } from '@/utils/storage';

/**
 * The container for all protected routes. It renders `<AppLoading />` when the user is not
 * authenticated or the user is authenticated but the tenant is not initialized.
 *
 * That is, when it renders `<Outlet />`, you can expect:
 *
 * - `isAuthenticated` from `useLogto()` to be `true`.
 * - `isInitComplete` from `TenantsContext` to be `true`.
 *
 * Usage:
 *
 * ```tsx
 * <Route element={<ProtectedRoutes />}>
 *  <Route path="some-path" element={<SomeContent />} />
 * </Route>
 * ```
 *
 * Note that the `ProtectedRoutes` component should be put in a {@link https://reactrouter.com/en/main/start/concepts#pathless-routes | pathless route}.
 */
export default function ProtectedRoutes() {
  const api = useCloudApi();
  const tenantsApi = useTenantsApi();
  const [searchParameters] = useSearchParams();
  const { isAuthenticated, isLoading, signIn } = useLogto();
  const { isInitComplete, resetTenants } = useContext(TenantsContext);
  const redirectUri = useRedirectUri();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      saveRedirect();
      const isSignUpMode = yes(searchParameters.get(searchKeys.signUp));
      void signIn(redirectUri.href, conditional(isSignUpMode && 'signUp'));
    }
  }, [redirectUri, isAuthenticated, isLoading, searchParameters, signIn]);

  useEffect(() => {
    if (isAuthenticated && !isInitComplete) {
      const loadTenants = async () => {
        // Self-hosted multi-tenant: load the tenant list from the tenant management API exposed by
        // the admin tenant. Keep it failure-safe so a misconfigured deployment never hangs the
        // console on the loading screen.
        if (!isCloud && isMultiTenancy) {
          const data = await trySafe(async () =>
            tenantsApi.get('api/tenants').json<TenantResponse[]>()
          );

          resetTenants(data ?? []);
          return;
        }

        const data = await api.get('/api/tenants');
        resetTenants(data);
      };

      void loadTenants();
    }
  }, [api, tenantsApi, isAuthenticated, isInitComplete, resetTenants]);

  if (!isInitComplete || !isAuthenticated) {
    return <AppLoading />;
  }

  return <Outlet />;
}
