/**
 * A state printed on an entry line («stimata», «sostituita»), in violet stamp ink. It lands with
 * the one authored motion of the app; with reduced motion it simply appears, already tilted.
 */
export function Stamp({ children }: { children: string }) {
  return (
    <span className="inline-block shrink-0 rounded-xs border-2 border-stamp px-1.5 py-0.5 text-2xs font-extrabold uppercase leading-none tracking-widest text-stamp [transform:rotate(var(--stamp-tilt,-6deg))] motion-safe:animate-stamp">
      {children}
    </span>
  );
}
