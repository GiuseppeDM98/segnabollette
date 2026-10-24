import { Icon, type IconProps } from './icon';

export function BillsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Icon>
  );
}
