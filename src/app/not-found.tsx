import Link from 'next/link';
import { buttonClass } from '@/components/ui/styles';

/** Every notFound() lands here, a foreign id included: the page never says whether it exists. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-lg font-bold">Pagina non trovata</h1>
      <p className="text-ink-soft">Questa pagina non esiste o non è tua.</p>
      <Link href="/" className={buttonClass('primary', 'self-start')}>
        Torna a Casa
      </Link>
    </main>
  );
}
