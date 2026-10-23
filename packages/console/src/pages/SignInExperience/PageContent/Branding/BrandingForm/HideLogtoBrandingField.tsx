import { useFormContext } from 'react-hook-form';

import { latestProPlanId } from '@/consts/subscriptions';
import FormField from '@/ds-components/FormField';
import Switch from '@/ds-components/Switch';

import type { SignInExperienceForm } from '../../../types';

type Props = {
  readonly variant: 'cloud' | 'oss';
  readonly isEnabledInCloud: boolean;
};

/**
 * The "hide Logto branding" switch.
 *
 * Katra (self-hosted fork) always offers it. The footer this hides is Logto's, not Katra's, and a
 * self-hosted deployment has no plan to upgrade to — the Cloud tag and the upsell note only made
 * sense while the API rejected the field outside Cloud. In Cloud the switch still honors the
 * Bring-Your-Own-UI entitlement.
 */
function HideLogtoBrandingField({ variant, isEnabledInCloud }: Props) {
  const { register } = useFormContext<SignInExperienceForm>();
  const isEntitled = variant !== 'cloud' || isEnabledInCloud;

  return (
    <FormField
      title="sign_in_exp.branding.hide_logto_branding"
      featureTag={{ isVisible: !isEntitled, plan: latestProPlanId }}
    >
      <Switch
        description="sign_in_exp.branding.hide_logto_branding_description"
        {...register('hideLogtoBranding')}
        disabled={!isEntitled}
      />
    </FormField>
  );
}

export default HideLogtoBrandingField;
