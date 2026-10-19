import { type SignIn, type ExperienceSocialConnector, AgreeToTermsPolicy } from '@logto/schemas';

import IdentifierSignInForm from '@/components/IdentifierSignInForm';
import LoginHintPasswordForm from '@/components/LoginHintPasswordForm';
import PasswordSignInForm from '@/components/PasswordSignInForm';
import SocialSignInList from '@/containers/SocialSignInList';
import TermsAndPrivacyCheckbox from '@/containers/TermsAndPrivacyCheckbox';
import useSignInHint from '@/hooks/use-sign-in-hint';
import useTerms from '@/hooks/use-terms';

import useIdentifierSignInMethods from '../IdentifierSignIn/use-identifier-sign-in-methods';

import styles from './index.module.scss';

type Props = {
  readonly signInMethods: SignIn['methods'];
  readonly socialConnectors: ExperienceSocialConnector[];
};

const Main = ({ signInMethods, socialConnectors }: Props) => {
  const { agreeToTermsPolicy } = useTerms();
  const { isPasswordOnly } = useIdentifierSignInMethods();
  const { hint, isLoading, hasHintToken } = useSignInHint();

  /**
   * The client already asked for the identifier, so ask for the password alone. Hold the screen
   * while the masked confirmation loads, and fall back to the regular forms when Core rejects the
   * hint (expired, consumed, or minted for another application).
   */
  if (hasHintToken && (isLoading || hint)) {
    return hint ? (
      <LoginHintPasswordForm
        className={styles.main}
        identifierType={hint.identifierType}
        value={hint.maskedIdentifier}
      />
    ) : null;
  }

  if (signInMethods.length === 0 && socialConnectors.length > 0) {
    return (
      <>
        <SocialSignInList className={styles.main} socialConnectors={socialConnectors} />
        {
          /**
           * Display agreement checkbox when only social sign-in methods are available
           * and the user needs to agree to terms manually.
           */
          agreeToTermsPolicy === AgreeToTermsPolicy.Manual && (
            <TermsAndPrivacyCheckbox className={styles.checkbox} />
          )
        }
      </>
    );
  }

  if (isPasswordOnly) {
    return (
      <PasswordSignInForm
        className={styles.main}
        signInMethods={signInMethods.map(({ identifier }) => identifier)}
      />
    );
  }

  if (signInMethods.length > 0) {
    return <IdentifierSignInForm className={styles.main} signInMethods={signInMethods} />;
  }

  return null;
};

export default Main;
