import { TenantTag } from '@logto/schemas';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';

import Tick from '@/assets/icons/tick.svg?react';
import { type TenantResponse } from '@/cloud/types/router';
import { RegionFlag } from '@/components/Region';
import SkuName from '@/components/SkuName';
import { isCloud } from '@/consts/env';
import { DropdownItem } from '@/ds-components/Dropdown';

import TenantStatusTag from './TenantStatusTag';
import styles from './index.module.scss';

type Props = {
  readonly tenantData: TenantResponse;
  readonly isSelected: boolean;
  readonly onClick: () => void;
};

function TenantDropdownItem({ tenantData, isSelected, onClick }: Props) {
  const { name, tag } = tenantData;
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  // Self-hosted tenants have no Cloud subscription, region, or usage. Reading those fields crashes the picker.
  const planId = isCloud ? tenantData.subscription.planId : undefined;

  return (
    <DropdownItem className={styles.item} onClick={onClick}>
      <div className={styles.info}>
        <div className={styles.meta}>
          <div className={styles.name}>{name}</div>
          {isCloud && <TenantStatusTag tenantData={tenantData} className={styles.statusTag} />}
        </div>
        <div className={styles.metadata}>
          {isCloud && (
            <div className={styles.region}>
              <RegionFlag regionName={tenantData.regionName} width={12} />
              <span>{tenantData.regionName}</span>
            </div>
          )}
          <span>{t(`tenants.full_env_tag.${tag}`)}</span>
          {isCloud && tag !== TenantTag.Development && planId && <SkuName skuId={planId} />}
        </div>
      </div>
      <Tick className={classNames(styles.checkIcon, isSelected && styles.visible)} />
    </DropdownItem>
  );
}

export default TenantDropdownItem;
