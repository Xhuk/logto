import { type SignInIdentifier } from '@logto/schemas';
import { type Optional } from '@silverhand/essentials';
import { useContext, useMemo } from 'react';

import UserInteractionContext from '@/Providers/UserInteractionContextProvider/UserInteractionContext';
import {
  type IdentifierInputType,
  type IdentifierInputValue,
} from '@/shared/components/InputFields/SmartInputField';

/**
 * Retrieves the cached identifier input value that the user has inputted based on enabled types.
 * The value will be used to pre-fill the identifier input field in experience pages.
 *
 * @param {IdentifierInputValue} identifierInputValue - The identifier input value to be checked
 * @param {IdentifierInputType[]} enabledTypes - Array of enabled identifier types
 * @returns {IdentifierInputValue | undefined} The identifier input value object or undefined
 *
 * The function checks if the type of identifierInputValue is in the `enabledTypes` array,
 * if the type matches, it returns `identifierInputValue`; otherwise, it returns `undefined`
 *
 * Example:
 * ```ts
 * const value = getIdentifierInputValueByTypes(['email', 'phone']);
 * // Returns `identifierInputValue` if its type is 'email' or 'phone'
 * // Returns `undefined` otherwise
 * ```
 */
const getIdentifierInputValueByTypes = (
  identifierInputValue: IdentifierInputValue,
  enabledTypes: IdentifierInputType[]
): Optional<IdentifierInputValue> => {
  const { type } = identifierInputValue;
  /**
   * Check if the type is included in the enabledTypes array
   * If it is, return identifierInputValue; otherwise, return undefined
   */
  return type && enabledTypes.includes(type) ? identifierInputValue : undefined;
};

type Options = {
  enabledIdentifiers?: SignInIdentifier[];
  /**
   * Whether the current page is the forgot password page
   *
   * Note: since a user may not use the same identifier to sign in and reset password,
   * we need to distinguish between the two scenarios.
   * E.g. the user may only use username to sign in, but only email or phone number can be used to reset password.
   */
  isForgotPassword?: boolean;
};

const usePrefilledIdentifier = ({ enabledIdentifiers, isForgotPassword = false }: Options = {}) => {
  const { identifierInputValue, forgotPasswordIdentifierInputValue } =
    useContext(UserInteractionContext);

  const cachedInputIdentifier = useMemo(() => {
    const identifier = isForgotPassword ? forgotPasswordIdentifierInputValue : identifierInputValue;
    /**
     * If there's no identifier input value or no limitations for enabled identifiers,
     * return the identifier input value as is (which might be undefined)
     */
    if (!identifier || !enabledIdentifiers) {
      return identifier;
    }

    return getIdentifierInputValueByTypes(identifier, enabledIdentifiers);
  }, [
    enabledIdentifiers,
    forgotPasswordIdentifierInputValue,
    identifierInputValue,
    isForgotPassword,
  ]);

  /**
   * The prefill only comes from what the user already typed in this session.
   *
   * `login_hint` is deliberately **not** a source any more: it is a plain URL parameter, so anyone
   * who can send a link chooses the identifier that would appear on the real sign-in screen (a
   * phishing amplifier, not a credential leak). A client that already knows the user sends an
   * unforgeable `login_hint_token` instead, and Core answers the masked confirmation for it.
   */
  return cachedInputIdentifier ?? { value: '' };
};

export default usePrefilledIdentifier;
