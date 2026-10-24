import { Icon, type IconProps } from './icon';

export function WasteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4h5v2.5" />
      <path d="M6 6.5l1 13.5h10l1-13.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </Icon>
  );
}
