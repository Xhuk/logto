import { adminTenantId, OrganizationInvitationStatus, TenantTag } from '@logto/schemas';
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

/**
 * The control plane returns `groupName`, but the console types derive from the Cloud route schema,
 * which does not carry it. The extra field is only used for the picker grouping below.
 */
type TenantWithGroup = TenantResponse & { readonly groupName?: string | undefined };

const getMissingEnvironmentTag = (groupTenants: readonly TenantWithGroup[]) => {
  const hasDevelopment = groupTenants.some(({ tag }) => tag === TenantTag.Development);
  const hasProduction = groupTenants.some(({ tag }) => tag === TenantTag.Production);

  if (!hasDevelopment) {
    return TenantTag.Development;
  }

  return hasProduction ? undefined : TenantTag.Production;
};

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
  const [createTenantArgs, setCreateTenantArgs] = useState<
    { group?: string; tag?: TenantTag } | undefined
  >();
  const { updateDefaultTenantId } = useUserDefaultTenantId();

  // Cloud and self-hosted multi-tenant instances can both create tenants. On Katra the signed-in
  // admin's home is the admin tenant, so that row stays in the switcher. Cloud still hides it.
  const canCreateTenant = isCloud || isMultiTenancy;
  const showAdminTenant = !isCloud && isMultiTenancy;

  const switchableTenants = useMemo(
    () =>
      // eslint-disable-next-line no-restricted-syntax -- the control plane returns groupName at runtime
      (tenants as TenantWithGroup[]).filter(({ id }) => showAdminTenant || id !== adminTenantId),
    [showAdminTenant, tenants]
  );

  const [ungroupedTenants, groups] = useMemo(() => {
    const ungrouped = switchableTenants.filter(({ groupName }) => !groupName);
    const map = new Map<string, TenantWithGroup[]>();

    for (const tenant of switchableTenants) {
      if (tenant.groupName) {
        map.set(tenant.groupName, [...(map.get(tenant.groupName) ?? []), tenant]);
      }
    }

    return [ungrouped, [...map.entries()]] as const;
  }, [switchableTenants]);

  const closeCreateModal = (tenant?: TenantResponse) => {
    setCreateTenantArgs(undefined);
    if (tenant) {
      prependTenant(tenant);
      navigateTenant(tenant.id);
    }
  };

  const labelFor = (tenantData: TenantWithGroup) =>
    showAdminTenant && tenantData.id === adminTenantId ? 'Admin' : tenantData.name;

  const renderTenantItem = (tenantData: TenantWithGroup) => (
    <TenantDropdownItem
      key={tenantData.id}
      tenantData={{ ...tenantData, name: labelFor(tenantData) }}
      isSelected={tenantData.id === currentTenantId}
      onClick={() => {
        navigateTenant(tenantData.id);
        void updateDefaultTenantId(tenantData.id);
        setShowDropdown(false);
      }}
    />
  );

  const adminRows = ungroupedTenants.filter(({ id }) => id === adminTenantId);
  const otherRows = ungroupedTenants.filter(({ id }) => id !== adminTenantId);
  const orderedUngroupedTenants = [...adminRows, ...otherRows];

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
        <div className={styles.name}>{labelFor(currentTenantInfo)}</div>
        {currentTenantId !== adminTenantId && <TenantEnvTag tag={currentTenantInfo.tag} />}
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
          {orderedUngroupedTenants.map((tenantData) => renderTenantItem(tenantData))}
          {groups.map(([groupName, groupTenants]) => {
            const missingTag = getMissingEnvironmentTag(groupTenants);

            return (
              <div key={groupName} className={styles.group}>
                <div className={styles.groupHeader}>
                  <div className={styles.groupLabel}>{groupName}</div>
                  {canCreateTenant && !isCloud && missingTag && (
                    <button
                      type="button"
                      className={styles.groupAddButton}
                      onClick={() => {
                        setCreateTenantArgs({ group: groupName, tag: missingTag });
                      }}
                    >
                      <PlusSign />
                    </button>
                  )}
                </div>
                {groupTenants.map((tenantData) => renderTenantItem(tenantData))}
              </div>
            );
          })}
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
                setCreateTenantArgs({});
              }}
              onKeyDown={onKeyDownHandler(() => {
                setCreateTenantArgs({});
              })}
            >
              <div>{t('cloud.tenant.create_tenant')}</div>
              <PlusSign />
            </button>
          </>
        )}
      </Dropdown>
      {canCreateTenant &&
        createTenantArgs !== undefined &&
        (isCloud ? (
          <CreateTenantModal isOpen onClose={closeCreateModal} />
        ) : (
          <OssCreateTenantModal
            isOpen
            defaultGroup={createTenantArgs.group}
            defaultTag={createTenantArgs.tag}
            onClose={closeCreateModal}
          />
        ))}
    </>
  );
}
