import { Icon, type IconProps } from './icon';

export function ReadingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M7 10h2.5M11 10h2.5M15 10h2" />
      <path d="M7 14.5h10" />
    </Icon>
  );
}
