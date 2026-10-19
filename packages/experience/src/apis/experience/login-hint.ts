import { InteractionEvent, type SignInIdentifier } from '@logto/schemas';

import api from '../api';

import { experienceApiRoutes, type VerificationResponse } from './const';
import { identifyAndSubmitInteraction, initInteraction } from './interaction';

export type LoginHintResponse = {
  identifierType: SignInIdentifier;
  maskedIdentifier: string;
};

/**
 * The masked confirmation for the sign-in the client already started: who is signing in, in a form
 * that is safe to render. Rejects with 404 when the interaction carries no (or no longer valid)
 * login hint, which the caller treats as "ask for the identifier as usual".
 */
export const getLoginHint = async () =>
  api.get(experienceApiRoutes.loginHint).json<LoginHintResponse>();

/**
 * Finish a hinted sign-in with the password alone.
 *
 * The identifier is deliberately absent from the payload: Core already knows the subject from the
 * hint token, so the value the user typed on the client's own screen never travels again.
 */
export const signInWithLoginHintPassword = async (password: string, captchaToken?: string) => {
  await initInteraction(InteractionEvent.SignIn, captchaToken);

  const { verificationId } = await api
    .post(`${experienceApiRoutes.verification}/password`, {
      json: { password },
    })
    .json<VerificationResponse>();

  return identifyAndSubmitInteraction({ verificationId });
};
