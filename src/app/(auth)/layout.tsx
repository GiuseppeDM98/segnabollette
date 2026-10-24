import type { ReactNode } from 'react';

/** Sign-in and sign-up: the passbook still closed, its cover band with the name, the form below. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="cloth">
        <div className="mx-auto flex max-w-sm items-center gap-3 px-4 pt-10 pb-6">
          {/* biome-ignore lint/performance/noImgElement: a 40 px SVG needs no image optimisation */}
          <img src="/brand/logo.svg" alt="" width={40} height={40} />
          <p className="text-2xl font-extrabold">Segnabollette</p>
        </div>
      </div>
      <main className="mx-auto max-w-sm px-4 pt-6 pb-10">{children}</main>
    </div>
  );
}
