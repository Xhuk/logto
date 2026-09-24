import { type LocalePhrase } from '@logto/phrases-experience';

import { type SignInExperience } from '../db-entries/index.js';

import { type FullSignInExperience } from './sign-in-experience.js';

/**
 * The server-side rendering data type for **experience**.
 */
export type SsrData = {
  /**
   * Outer URL mount when the experience is not at the host root (`/auth` or
   * `/{tenantId}`). The React router and Experience API clients must use this
   * as basename / path prefix so cookies with `Path=/auth` still apply.
   */
  pathPrefix?: string;
  signInExperience: {
    appId?: string;
    organizationId?: string;
    uiLocales?: string;
    data: FullSignInExperience;
  };
  phrases: {
    lng: string;
    data: LocalePhrase;
  };
};

/**
 * The server-side rendering data type for **account center**. Only sign-in experience color/theme
 * data is needed for theme flash prevention.
 */
export type AccountCenterSsrSignInExperience = Pick<SignInExperience, 'color'>;

export type AccountCenterSsrData = {
  signInExperience: {
    data: AccountCenterSsrSignInExperience;
  };
};

/**
 * Variable placeholder for **experience** server-side rendering. The value should be replaced by
 * the server.
 *
 * CAUTION: The value should be kept in sync with {@link file://./../../../experience/src/index.html}.
 *
 * @see {@link SsrData} for the data structure to replace the placeholders.
 */
export const ssrPlaceholder = '"__LOGTO_SSR__"';
