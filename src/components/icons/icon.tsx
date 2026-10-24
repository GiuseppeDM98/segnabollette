import type { ReactNode, SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

/**
 * The frame every icon shares: a 24-unit grid, one 1.75 stroke, the colour of the text around it.
 * Icons are decoration next to a visible label, so they are hidden from assistive technology.
 */
export function Icon({ children, className, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'size-5'}
      {...props}
    >
      {children}
    </svg>
  );
}
