import { ElectricityIcon } from '@/components/icons/electricity-icon';
import { GasIcon } from '@/components/icons/gas-icon';
import type { IconProps } from '@/components/icons/icon';
import { TelecomIcon } from '@/components/icons/telecom-icon';
import { WasteIcon } from '@/components/icons/waste-icon';
import { WaterIcon } from '@/components/icons/water-icon';
import type { SupplyKind } from '@/lib/domain/types';

const ICONS = {
  electricity: ElectricityIcon,
  gas: GasIcon,
  water: WaterIcon,
  telecom: TelecomIcon,
  waste: WasteIcon,
} satisfies Record<SupplyKind, unknown>;

export function SupplyKindIcon({ kind, ...props }: IconProps & { kind: SupplyKind }) {
  const KindIcon = ICONS[kind];
  return <KindIcon {...props} />;
}
