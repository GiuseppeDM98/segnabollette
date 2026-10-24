import { Icon, type IconProps } from './icon';

export function TelecomIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 9.5a12 12 0 0 1 17 0" />
      <path d="M6.5 12.8a7.7 7.7 0 0 1 11 0" />
      <path d="M9.5 16a3.5 3.5 0 0 1 5 0" />
      <path d="M12 19.5h.01" />
    </Icon>
  );
}
