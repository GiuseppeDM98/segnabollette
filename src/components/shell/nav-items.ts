import type { ComponentType } from 'react';
import { BillsIcon } from '@/components/icons/bills-icon';
import { HomeIcon } from '@/components/icons/home-icon';
import type { IconProps } from '@/components/icons/icon';
import { ReadingsIcon } from '@/components/icons/readings-icon';
import { SettingsIcon } from '@/components/icons/settings-icon';
import { SuppliesIcon } from '@/components/icons/supplies-icon';

export interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Casa', Icon: HomeIcon },
  { href: '/bollette', label: 'Bollette', Icon: BillsIcon },
  { href: '/letture', label: 'Letture', Icon: ReadingsIcon },
  { href: '/forniture', label: 'Forniture', Icon: SuppliesIcon },
  { href: '/impostazioni', label: 'Impostazioni', Icon: SettingsIcon },
];

/** Casa only on '/' itself (every path starts with '/'); the others on their nested pages too. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
