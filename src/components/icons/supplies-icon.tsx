import { Icon, type IconProps } from './icon';

export function SuppliesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5h16v4H4z" />
      <path d="M4 14.5h16v4H4z" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </Icon>
  );
}
