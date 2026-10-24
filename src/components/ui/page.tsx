import type { ReactNode } from 'react';

/** A page on paper: its heading, the actions beside it, then the content in one column. */
export function Page({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 pt-6 pb-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}

/** A titled section inside a page. */
export function Section({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
