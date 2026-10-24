import { Icon, type IconProps } from './icon';

export function ElectricityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3v4M15 3v4" />
      <path d="M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16v5" />
    </Icon>
  );
}
