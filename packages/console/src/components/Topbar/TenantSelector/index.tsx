import { adminTenantId, OrganizationInvitationStatus } from '@logto/schemas';
import { useContext, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import KeyboardArrowDown from '@/assets/icons/keyboard-arrow-down.svg?react';
import PlusSign from '@/assets/icons/plus.svg?react';
import { type TenantResponse } from '@/cloud/types/router';
import CreateTenantModal from '@/components/CreateTenantModal';
import TenantEnvTag from '@/components/TenantEnvTag';
import { isCloud, isMultiTenancy } from '@/consts/env';
import { TenantsContext } from '@/contexts/TenantsProvider';
import Divider from '@/ds-components/Divider';
import Dropdown from '@/ds-components/Dropdown';
import OverlayScrollbar from '@/ds-components/OverlayScrollbar';
import useUserDefaultTenantId from '@/hooks/use-user-default-tenant-id';
import useUserInvitations from '@/hooks/use-user-invitations';
import { onKeyDownHandler } from '@/utils/a11y';

import OssCreateTenantModal from './OssCreateTenantModal';
import TenantDropdownItem from './TenantDropdownItem';
import TenantInvitationDropdownItem from './TenantInvitationDropdownItem';
import styles from './index.module.scss';

export default function TenantSelector() {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const {
    tenants,
    prependTenant,
    currentTenant: currentTenantInfo,
    currentTenantId,
    navigateTenant,
  } = useContext(TenantsContext);
  const { data: pendingInvitations } = useUserInvitations(OrganizationInvitationStatus.Pending);

  const anchorRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const { updateDefaultTenantId } = useUserDefaultTenantId();

  // Cloud and self-hosted multi-tenant instances can both create tenants; the admin tenant is the
  // internal control-plane tenant and is never a switcher target.
  const canCreateTenant = isCloud || isMultiTenancy;
  const switchableTenants = useMemo(
    () => tenants.filter(({ id }) => id !== adminTenantId),
    [tenants]
  );

  if (tenants.length === 0 || !currentTenantInfo) {
    return null;
  }

  return (
    <>
      <div
        ref={anchorRef}
        tabIndex={0}
        className={styles.currentTenantCard}
        role="button"
        onKeyDown={onKeyDownHandler(() => {
          setShowDropdown(true);
        })}
        onClick={() => {
          setShowDropdown(true);
        }}
      >
        <div className={styles.name}>{currentTenantInfo.name}</div>
        <TenantEnvTag tag={currentTenantInfo.tag} />
        {Boolean(pendingInvitations?.length) && <div className={styles.redDot} />}
        <KeyboardArrowDown className={styles.arrowIcon} />
      </div>
      <Dropdown
        hasOverflowContent
        className={styles.dropdown}
        anchorRef={anchorRef}
        isOpen={showDropdown}
        horizontalAlign="start"
        onClose={() => {
          setShowDropdown(false);
        }}
      >
        <OverlayScrollbar className={styles.scrollableContent}>
          {switchableTenants.map((tenantData) => (
            <TenantDropdownItem
              key={tenantData.id}
              tenantData={tenantData}
              isSelected={tenantData.id === currentTenantId}
              onClick={() => {
                navigateTenant(tenantData.id);
                void updateDefaultTenantId(tenantData.id);
                setShowDropdown(false);
              }}
            />
          ))}
          {isCloud &&
            pendingInvitations?.map((invitation) => (
              <TenantInvitationDropdownItem key={invitation.id} data={invitation} />
            ))}
        </OverlayScrollbar>
        {canCreateTenant && (
          <>
            <Divider />
            <button
              tabIndex={0}
              className={styles.createTenantButton}
              onClick={() => {
                setShowCreateTenantModal(true);
              }}
              onKeyDown={onKeyDownHandler(() => {
                setShowCreateTenantModal(true);
              })}
            >
              <div>{t('cloud.tenant.create_tenant')}</div>
              <PlusSign />
            </button>
          </>
        )}
      </Dropdown>
      {canCreateTenant &&
        (isCloud ? (
          <CreateTenantModal
            isOpen={showCreateTenantModal}
            onClose={async (tenant?: TenantResponse) => {
              setShowCreateTenantModal(false);
              if (tenant) {
                prependTenant(tenant);
                navigateTenant(tenant.id);
              }
            }}
          />
        ) : (
          <OssCreateTenantModal
            isOpen={showCreateTenantModal}
            onClose={(tenant?: TenantResponse) => {
              setShowCreateTenantModal(false);
              if (tenant) {
                prependTenant(tenant);
                navigateTenant(tenant.id);
              }
            }}
          />
        ))}
    </>
  );
}
