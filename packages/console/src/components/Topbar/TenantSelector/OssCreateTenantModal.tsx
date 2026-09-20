import { TenantTag } from '@logto/schemas';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Modal from 'react-modal';

import { type TenantResponse } from '@/cloud/types/router';
import TenantEnvTag from '@/components/TenantEnvTag';
import Button from '@/ds-components/Button';
import FormField from '@/ds-components/FormField';
import ModalLayout from '@/ds-components/ModalLayout';
import RadioGroup, { Radio } from '@/ds-components/RadioGroup';
import TextInput from '@/ds-components/TextInput';
import { useTenantsApi } from '@/hooks/use-tenants-api';
import modalStyles from '@/scss/modal.module.scss';

type Props = {
  readonly isOpen: boolean;
  readonly onClose: (tenant?: TenantResponse) => void;
  /** Preset group the new tenant belongs to; used when adding an environment to an existing group. */
  readonly defaultGroup?: string;
  /** Environment tag suggested by the caller, based on what the group already has. */
  readonly defaultTag?: TenantTag;
};

/**
 * Self-hosted counterpart of the Cloud tenant creator.
 *
 * The Cloud modal is built around regions, instances and subscription plans, none of which exist on
 * a self-hosted instance. Here a tenant only needs a name, an optional group (the product it belongs
 * to) and an environment tag; the deployment generates its ID and provisions the tenant's own
 * database role, OIDC keys, sign-in experience and account center.
 */
function OssCreateTenantModal({ isOpen, onClose, defaultGroup, defaultTag }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const tenantsApi = useTenantsApi();
  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState(defaultGroup ?? '');
  const [tag, setTag] = useState<TenantTag>(defaultTag ?? TenantTag.Development);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setGroupName(defaultGroup ?? '');
    setTag(defaultTag ?? TenantTag.Development);
  };

  const onCreate = async () => {
    if (!name.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const tenant = await tenantsApi
        .post('api/tenants', {
          json: { name, tag, groupName: groupName.trim() || undefined },
        })
        .json<TenantResponse>();
      toast.success(t('tenants.create_modal.tenant_created'));
      reset();
      onClose(tenant);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
      isOpen={isOpen}
      className={modalStyles.content}
      overlayClassName={modalStyles.overlay}
      onAfterClose={reset}
      onRequestClose={() => {
        onClose();
      }}
    >
      <ModalLayout
        title="tenants.create_modal.title"
        subtitle="tenants.create_modal.subtitle"
        footer={
          <Button
            isLoading={isSubmitting}
            disabled={isSubmitting || !name.trim()}
            htmlType="submit"
            title="tenants.create_modal.create_button"
            size="large"
            type="primary"
            onClick={() => {
              void onCreate();
            }}
          />
        }
        onClose={onClose}
      >
        <FormField isRequired title="tenants.settings.tenant_name">
          <TextInput
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={name}
            disabled={isSubmitting}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
          />
        </FormField>
        <FormField title="tenants.create_modal.group">
          <TextInput
            value={groupName}
            disabled={isSubmitting}
            onChange={(event) => {
              setGroupName(event.currentTarget.value);
            }}
          />
        </FormField>
        <FormField title="tenants.create_modal.tenant_usage_purpose">
          <RadioGroup
            type="card"
            name="tag"
            value={tag}
            onChange={(value) => {
              setTag(value === TenantTag.Production ? TenantTag.Production : TenantTag.Development);
            }}
          >
            {[TenantTag.Development, TenantTag.Production].map((value) => (
              <Radio key={value} value={value}>
                <TenantEnvTag tag={value} isAbbreviated={false} />
              </Radio>
            ))}
          </RadioGroup>
        </FormField>
      </ModalLayout>
    </Modal>
  );
}

export default OssCreateTenantModal;
