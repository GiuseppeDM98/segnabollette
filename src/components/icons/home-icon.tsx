import { Icon, type IconProps } from './icon';

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </Icon>
  );
}
