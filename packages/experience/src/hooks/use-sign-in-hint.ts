import { ExtraParamsKey } from '@logto/schemas';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getLoginHint, type LoginHintResponse } from '@/apis/experience';
import useApi from '@/hooks/use-api';

/**
 * Read the masked confirmation for a sign-in the client already started, if the sign-in URL carries
 * a `login_hint_token`.
 *
 * The token itself is opaque, so the only thing this returns is who is signing in, in a form that is
 * safe to render. `isLoading` keeps the caller from flashing the identifier form while the answer
 * arrives; a hint that Core rejects (expired, consumed, minted for another app) resolves to `hint:
 * undefined`, which sends the caller back to the regular sign-in flow.
 */
const useSignInHint = () => {
  const [searchParams] = useSearchParams();
  const hasHintToken = Boolean(searchParams.get(ExtraParamsKey.LoginHintToken));
  const [hint, setHint] = useState<LoginHintResponse>();
  const [isLoading, setIsLoading] = useState(hasHintToken);
  const asyncGetLoginHint = useApi(getLoginHint, { silent: true });

  useEffect(() => {
    if (!hasHintToken) {
      return;
    }

    const load = async () => {
      const [error, result] = await asyncGetLoginHint();

      if (!error && result) {
        setHint(result);
      }

      setIsLoading(false);
    };

    void load();
  }, [asyncGetLoginHint, hasHintToken]);

  return { hint, isLoading: hasHintToken && isLoading, hasHintToken };
};

export default useSignInHint;
