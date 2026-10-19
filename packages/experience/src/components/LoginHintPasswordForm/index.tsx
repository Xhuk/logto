import { InteractionEvent, type SignInIdentifier } from '@logto/schemas';
import classNames from 'classnames';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import CaptchaContext from '@/Providers/CaptchaContextProvider/CaptchaContext';
import { signInWithLoginHintPassword } from '@/apis/experience';
import { PasswordInputField } from '@/components/InputFields';
import TextLink from '@/components/TextLink';
import CaptchaBox from '@/containers/CaptchaBox';
import useApi from '@/hooks/use-api';
import { type ErrorHandlers } from '@/hooks/use-error-handler';
import useErrorHandler from '@/hooks/use-error-handler';
import useGlobalRedirectTo from '@/hooks/use-global-redirect-to';
import useNavigateWithPreservedSearchParams from '@/hooks/use-navigate-with-preserved-search-params';
import useSubmitInteractionErrorHandler from '@/hooks/use-submit-interaction-error-handler';
import Button from '@/shared/components/Button';
import ErrorMessage from '@/shared/components/ErrorMessage';
import { identifierInputDescriptionMap } from '@/utils/form';

import styles from './index.module.scss';

type Props = {
  readonly className?: string;
  /** The masked identifier Core resolved from the sign-in hint; never the raw value. */
  readonly value: string;
  readonly identifierType: SignInIdentifier;
};

type FormState = {
  password: string;
};

/**
 * The password-only screen for a hinted sign-in: the client already asked for the identifier on its
 * own screen, so Katra shows the masked confirmation and nothing else.
 *
 * The submit payload carries the password alone. There is no hidden identifier field on purpose —
 * Core resolves the subject from the hint token, so the value the user typed in the client never
 * travels a second time.
 */
const LoginHintPasswordForm = ({ className, value, identifierType }: Props) => {
  const { t } = useTranslation();
  const { executeCaptcha } = useContext(CaptchaContext);
  const redirectTo = useGlobalRedirectTo();
  const handleError = useErrorHandler();
  const navigate = useNavigateWithPreservedSearchParams();
  const asyncSignIn = useApi(signInWithLoginHintPassword);
  const preSignInErrorHandler = useSubmitInteractionErrorHandler(InteractionEvent.SignIn);
  const [errorMessage, setErrorMessage] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormState>({
    reValidateMode: 'onBlur',
    defaultValues: { password: '' },
  });

  const errorHandlers: ErrorHandlers = useMemo(
    () => ({
      'session.invalid_credentials': (error) => {
        setErrorMessage(error.message);
      },
      ...preSignInErrorHandler,
    }),
    [preSignInErrorHandler]
  );

  const onSubmit = useCallback(
    async ({ password }: FormState) => {
      setErrorMessage(undefined);

      const captchaToken = await executeCaptcha();
      const [error, result] = await asyncSignIn(password, captchaToken);

      if (error) {
        await handleError(error, errorHandlers);

        return;
      }

      if (result?.redirectTo) {
        await redirectTo(result.redirectTo);
      }
    },
    [asyncSignIn, errorHandlers, executeCaptcha, handleError, redirectTo]
  );

  useEffect(() => {
    setErrorMessage(undefined);
  }, [value]);

  return (
    <form className={classNames(styles.form, className)} onSubmit={handleSubmit(onSubmit)}>
      <div className={styles.hint}>
        {t('description.enter_password_for', {
          method: t(identifierInputDescriptionMap[identifierType]),
          value,
        })}
      </div>

      <PasswordInputField
        autoFocus
        className={styles.inputField}
        autoComplete="current-password"
        label={t('input.password')}
        isDanger={!!errors.password}
        errorMessage={errors.password?.message}
        {...register('password', { required: t('error.password_required') })}
      />

      {errorMessage && <ErrorMessage className={styles.formErrors}>{errorMessage}</ErrorMessage>}

      <CaptchaBox />

      <Button title="action.continue" name="submit" htmlType="submit" isLoading={isSubmitting} />

      <TextLink
        className={styles.notYou}
        text="description.not_you"
        // Dropping the hint token is the whole point: the regular flow asks for the identifier.
        onClick={() => {
          navigate('/sign-in', { replace: true });
        }}
      />

      <input hidden type="submit" />
    </form>
  );
};

export default LoginHintPasswordForm;
