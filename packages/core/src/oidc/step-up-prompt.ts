import {
  AuthenticationContextMode,
  loginPromptAuthenticationContextDetailsGuard,
} from '@logto/schemas';

/**
 * Whether the login prompt details carry a step-up authentication context: an authenticated
 * session that does not satisfy the requested `acr_values` / `max_age`. The details are the
 * provider's untyped prompt payload, so anything that does not parse is a regular sign-in.
 *
 * Lives next to the login prompt URL builder rather than in `utils.ts`, which is at its lint size
 * limit and should not grow for a login-only concern.
 */
export const isStepUpPrompt = (promptDetails: unknown): boolean => {
  const result = loginPromptAuthenticationContextDetailsGuard.safeParse(promptDetails ?? {});

  if (!result.success || !result.data.authenticationContext) {
    return false;
  }

  const { mode, selectedAcr, requestedAcrValues } = result.data.authenticationContext;

  return (
    mode === AuthenticationContextMode.StepUp &&
    selectedAcr !== undefined &&
    requestedAcrValues.includes(selectedAcr)
  );
};
