# 09 — PWA, fotocamera e coda offline

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/09-pwa-offline` da `main`. **Dipende da**: 08 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-9, D-28, D-39; scelte T-1 (serwist, dexie,
> sharp), T-4, T-14, T-22, T-27; contratti C-20 — lo crea; usa C-9, C-13, C-16, C-17.

## 1. Il problema oggi (prove)

1. Dopo la 08 l'app funziona dal browser del telefono, la fotocamera c'è già (06: `capture`), ma
   non si installa come app e senza rete non salva niente: una bolletta fotografata in cantina o
   un'autolettura del contatore in garage si perdono (tema: «È una PWA installabile sul telefono
   (foto della bolletta dalla fotocamera, coda offline per i caricamenti)»; D-9).
2. `@serwist/next` è un plugin webpack: con Turbopack (default di Next 16) non emette `sw.js` e la
   build resta verde (segnaprezzi AGENTS § 4.39; https://serwist.pages.dev/docs/next/getting-started,
   letta 2026-10-24): la serie compila con `next build --webpack` dalla 01 (T-4). La pagina offline
   va **precachata a mano**: il manifest di precache dell'App Router non contiene pagine
   (segnaprezzi § 4.40).
3. Installazione (doc lette il 2026-10-24): Chrome Android vuole `name`/`short_name`, icone 192 e
   512, `start_url`, `display` standalone, HTTPS (https://web.dev/articles/install-criteria); iOS non
   ha `beforeinstallprompt`: «Condividi → Aggiungi alla schermata Home»; Safari cancella lo storage
   scrivibile dagli script dopo 7 giorni senza interazione se l'app non è installata
   (https://webkit.org/blog/14403/updates-to-storage-policy/).
4. Background Sync solo su Chromium (MDN, letta 2026-10-24): su iOS la coda si svuota solo con l'app
   aperta → T-27: la coda si svuota **dalle pagine**.
5. La coda di segnaprezzi (Dexie, retry 1/2/4/8/16 s, 5 tentativi, Web Lock condiviso, svuotamento
   su avvio, `online`, `visibilitychange`, dopo l'accodamento) è il modello; lì accoda solo le foto
   dei cartellini, qui bollette (PDF o foto) e autoletture.
6. Le route della 06 (T-22: `POST /api/extractions`, `…/uploaded`, `…/run`) sono già HTTP e
   servono alla coda; per le autoletture serve una route (le Server Action non sono chiamabili da
   una coda).

## 2. Obiettivo e criteri di accettazione

| # | Criterio | Prova |
|---|---|---|
| A1 | Manifest (`/manifest.webmanifest`) con nome, icone 192/512 e maskable, `display: standalone`, `start_url: '/'`, `lang: 'it'`; icona Apple 180 px; l'app si installa su Android e su iPhone. | E2E `pwa.spec.ts` (manifest e icone); collaudo § 7 F sui telefoni. |
| A2 | Service worker in produzione: le API non vanno mai in cache; le navigazioni senza rete mostrano `/offline`; un aggiornamento mostra «Nuova versione disponibile — Aggiorna». | E2E `pwa.spec.ts` (offline → `/offline`). |
| A3 | Coda offline (Dexie): senza rete, «Carica» di una bolletta (PDF o foto già convertite) e «Salva» di un'autolettura finiscono in coda con il messaggio «Salvata in coda: parte appena torni in rete»; tornata la rete la coda si svuota da sola (avvio, `online`, pagina di nuovo visibile, dopo l'accodamento, messaggio del service worker). | E2E `pwa.spec.ts` (`context.setOffline`); unit `queue.test.ts`. |
| A4 | Ritentativi: 1, 2, 4, 8, 16 s, al massimo 5; errori ritentabili (rete, 408, 429, ≥ 500); un 4xx definitivo → «non riuscita: <messaggio>» con «Riprova» ed «Elimina». | Unit. |
| A5 | Nessun doppione: un'autolettura ritentata non crea una seconda riga; una bolletta ritentata dopo la creazione dell'estrazione riprende quella (`duplicateOf`). | Unit + integrazione. |
| A6 | La coda si vede: banner «Sei offline» quando manca la rete; in «Da rivedere» la sezione «In attesa di rete» (bollette) e in «Letture» le autoletture in coda, con stato, «Riprova», «Elimina». | E2E. |
| A7 | Installazione: in Impostazioni «Installa l'app» (Android, da `beforeinstallprompt`) o le istruzioni per iPhone (Safari non in standalone) con l'avviso dei 7 giorni; `navigator.storage.persist()` chiesto alla prima voce in coda. | E2E (Chromium: il pulsante compare quando l'evento arriva, simulato); collaudo F. |

## 3. Decisioni

- **D-9** (PWA come segnaprezzi), **D-28** (autolettura a mano: in coda anche quella), **D-39**
  (tema: i colori del manifest seguono DESIGN.md).
- **T-1** (`@serwist/next` e `serwist` 9.5.13, `dexie` 4.4.7, `dexie-react-hooks` 4.4.0,
  `fake-indexeddb` 6.2.6, `sharp` 0.35.5, `png-to-ico` 3.0.2), **T-4** (`--webpack`), **T-14**
  (`/offline`), **T-22**, **T-27** (svuotamento dalle pagine).
- Adottate qui, ribaltabili:
  (a) la coda elabora **una voce alla volta**, prima le autoletture poi le bollette, in ordine di
  accodamento;
  (b) una bolletta accodata, quando parte, **esegue anche l'estrazione** (come «Carica» online della
  06: il costo è quello di una bolletta e l'owner l'ha chiesto premendo «Carica»);
  (c) l'autolettura passa da `POST /api/readings` e `createSelfReadings` diventa **idempotente**:
  una riga `self` identica (fornitura, data, registro, valore) non si inserisce di nuovo e si
  restituisce quella esistente;
  (d) nessun caricamento dal service worker: l'evento `sync` (solo Chromium) manda
  `{ type: 'drain-queue' }` alle pagine aperte (T-27);
  (e) le voci riuscite si cancellano dalla coda; quelle non riuscite restano finché l'owner non le
  ritenta o le elimina;
  (f) colori del manifest: i valori sRGB esadecimali dei token di sfondo e di tema di DESIGN.md,
  copiati in `src/app/manifest.ts` con un commento di checklist (l'unico posto, con `globals.css`,
  dove compaiono colori letterali);
  (g) `start_url: '/'`, `id: '/'`, orientamento `portrait`; `short_name` «Bollette».

## 4. La soluzione

### 4.1 Dipendenze e build

```bash
pnpm add @serwist/next@9.5.13 serwist@9.5.13 dexie@4.4.7 dexie-react-hooks@4.4.0
pnpm add -D sharp@0.35.5 png-to-ico@3.0.2 fake-indexeddb@6.2.6
```

`pnpm-workspace.yaml`: `sharp: true` in `allowBuilds`. `next.config.ts`:

```ts
import { randomUUID } from 'node:crypto';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

// The offline page must be precached by hand: the App Router precache manifest lists no pages.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/offline', revision }],
  disable: process.env.NODE_ENV === 'development',
  register: false,
});

const nextConfig: NextConfig = {
  // Why: `next dev` otherwise appends a generated block to AGENTS.md on every run.
  agentRules: false,
};

export default withSerwist(nextConfig);
```

`tsconfig.json`: `"lib"` aggiunge `"webworker"`; `"types"` aggiunge `"@serwist/next/typings"`;
`exclude` aggiunge `"public/sw.js"`.

### 4.2 Service worker — `src/app/sw.ts`

```ts
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, NetworkFirst, NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Authenticated data and the bill files never land in a cache.
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
    { matcher: ({ request }) => request.mode === 'navigate', handler: new NetworkFirst({ networkTimeoutSeconds: 3 }) },
    { matcher: ({ url }) => url.pathname.startsWith('/_next/static/'), handler: new CacheFirst() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Background Sync exists only on Chromium: it just wakes the open pages, which own the queue.
self.addEventListener('sync', (event) => {
  const syncEvent = event as Event & { tag: string; waitUntil(promise: Promise<unknown>): void };
  if (syncEvent.tag !== 'segnabollette-queue') return;
  syncEvent.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) client.postMessage({ type: 'drain-queue' });
    }),
  );
});

serwist.addEventListeners();
```

`src/components/pwa/service-worker-registrar.tsx` (client, montato in `AppShell`): solo con
`process.env.NODE_ENV === 'production'` registra `/sw.js`; quando c'è un worker `waiting` mostra il
toast «Nuova versione disponibile» con «Aggiorna» (`postMessage({ type: 'SKIP_WAITING' })`, poi
`location.reload()` su `controllerchange`); ascolta i messaggi `drain-queue` e chiama `drainQueue()`.

### 4.3 Manifest, icone, pagina offline

- `src/app/manifest.ts` (`MetadataRoute.Manifest`): `name: 'Segnabollette'`, `short_name:
  'Bollette'`, `description: 'Bollette, consumi e prezzi delle utenze di casa'`, `id: '/'`,
  `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`, `lang: 'it'`,
  `background_color` e `theme_color` (adottata f), icone `/icons/icon-192.png` (192, `any`),
  `/icons/icon-512.png` (512, `any`), `/icons/maskable-512.png` (512, `maskable`).
- `src/app/layout.tsx`: `metadata.appleWebApp = { capable: true, title: 'Bollette', statusBarStyle:
  'default' }`, `metadata.icons = { apple: '/icons/apple-touch-icon.png' }`; `viewport.themeColor`
  con i due valori chiaro/scuro (`media: '(prefers-color-scheme: dark)'`).
- `scripts/generate-icons.ts` (`pnpm icons`): con sharp da `public/brand/logo.svg` (03) →
  `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` (logo al 80% su fondo pieno del
  colore di sfondo: la zona sicura delle maskable), `apple-touch-icon.png` (180, fondo pieno) e
  `public/favicon.ico` (16/32/48 con png-to-ico). Si cancella `src/app/favicon.ico` generato dallo
  scaffold della 01: i due file si scontrano (segnaprezzi § 4.48). Gli output si committano.
- `src/app/offline/page.tsx` (pubblica: `PUBLIC_PATHS` la contiene dalla 01): «Sei offline. Le
  bollette e le letture che salvi ora restano sul telefono e partono appena torni in rete.» e il
  pulsante «Riprova» (`location.reload()`). Nessun dato dell'utente nella pagina (è in cache).

### 4.4 Coda offline — `src/lib/offline/` (C-20)

`db.ts`:

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { SelfReadingInput } from '@/lib/domain/bill-input';

export type QueueStatus = 'queued' | 'working' | 'failed';

export interface PendingBillUpload {
  id: string;                 // nanoid, created at enqueue
  supplyId: string | null;
  files: Array<{ blob: Blob; contentType: 'application/pdf' | 'image/jpeg'; name: string }>;
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  extractionId: string | null;
  createdAt: number;
}

export interface PendingSelfReading {
  id: string;
  input: SelfReadingInput;
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  createdAt: number;
}

export const offlineDb = new Dexie('segnabollette-offline') as Dexie & {
  pendingBillUploads: EntityTable<PendingBillUpload, 'id'>;
  pendingSelfReadings: EntityTable<PendingSelfReading, 'id'>;
};

// nextAttemptAt is not indexed: null cannot be an IndexedDB key.
offlineDb.version(1).stores({
  pendingBillUploads: 'id, status, createdAt',
  pendingSelfReadings: 'id, status, createdAt',
});
```

`queue.ts`:

```ts
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

export async function enqueueBillUpload(entry: { supplyId: string | null; files: PendingBillUpload['files'] }, deps: QueueDeps): Promise<string>;
export async function enqueueSelfReading(input: SelfReadingInput, deps: QueueDeps): Promise<string>;
export async function drainQueue(deps?: QueueDeps): Promise<DrainReport>;
export async function retryItem(kind: 'bill' | 'reading', id: string, deps?: QueueDeps): Promise<void>;
export async function removeItem(kind: 'bill' | 'reading', id: string): Promise<void>;

export interface QueueDeps {
  fetch: typeof fetch;
  now: () => number;
  isOnline: () => boolean;
  uploadFile: typeof uploadDocumentFile;
  sha256: (blob: Blob) => Promise<string>;
}
```

Comportamento di `drainQueue` (le dipendenze di default sono quelle del browser):
1. esce subito se `!isOnline()`;
2. prende il lock `navigator.locks.request('segnabollette-queue', { ifAvailable: true }, …)` (senza
   lock disponibile esce: un altro svuotamento è in corso);
3. elabora, una alla volta, le autoletture `queued` con `nextAttemptAt` nullo o passato, poi le
   bollette, in ordine di `createdAt`;
4. autolettura: `POST /api/readings` con l'`input`; 2xx → voce cancellata;
5. bolletta: se `extractionId` è nullo, calcola lo SHA-256 dei file e chiama `POST /api/extractions`
   (`{ supplyId, batchId: null, files }`); `duplicateOf` → `extractionId = duplicateOf` e stop
   (l'estrazione esiste già: la si trova in «Da rivedere»), voce cancellata; `DUPLICATE_DOCUMENT` →
   `failed` con «Già presente nella bolletta del …»; altrimenti salva `extractionId`, carica i file
   con `uploadFile`, `POST …/uploaded`, `POST …/run`; risposta 2xx (anche con l'estrazione `failed`,
   che si vede in «Da rivedere») → voce cancellata;
6. errore: ritentabile (eccezione di rete, 408, 429, ≥ 500) → `attempts + 1`, `nextAttemptAt = now +
   RETRY_DELAYS_MS[attempts]`, `status 'queued'`, oltre `MAX_ATTEMPTS` → `failed`; non ritentabile
   (altri 4xx) → `failed` con il `message` della risposta;
7. alla fine arma **un solo** timer per il `nextAttemptAt` più vicino;
8. restituisce `{ done, retried, failed }`.

`enqueue*` scrivono la voce, chiedono una volta `navigator.storage.persist()`, registrano il
Background Sync se c'è (`registration.sync.register('segnabollette-queue')`) e chiamano
`drainQueue()`.

`src/components/offline/use-queue.ts`: `useLiveQuery` delle due tabelle → conteggi e voci per la UI;
`useQueueTriggers()` (in `AppShell`): `drainQueue()` all'avvio, su `online`, su `visibilitychange`
visibile.

### 4.5 Route nuova — `POST /api/readings`

`requireUser()` → zod `SelfReadingInputSchema` → `createSelfReadings(db, user.id, input)` (adottata
c: idempotente) → 201 `{ readingIds }`; errori con `toErrorResponse` (06).

`createSelfReadings` (02) cambia così, senza cambiare firma: per ogni valore, se esiste già una
lettura `self` della stessa fornitura, data, registro e valore, la riutilizza invece di inserirne
una nuova.

### 4.6 Interfaccia

- `BillUploader` (06): se `navigator.onLine === false`, oppure se `POST /api/extractions` fallisce
  per un errore di rete, «Carica» → `enqueueBillUpload` (con i file già convertiti) → messaggio
  «Salvata in coda: parte appena torni in rete» e link a «Da rivedere».
- `SelfReadingForm` (03): stessa logica con `enqueueSelfReading`; online continua a usare la Server
  Action.
- `src/components/offline/offline-banner.tsx`: sotto l'intestazione, `role="status"`, «Sei offline:
  quello che salvi resta in coda sul telefono.» finché `navigator.onLine` è falso.
- `/bollette/da-rivedere`: sezione «In attesa di rete» con le bollette in coda (n. file, data,
  stato «in coda», «in corso», «non riuscita: …», prossimo tentativo) e «Riprova», «Elimina».
- `/letture`: in cima, le autoletture in coda con gli stessi controlli.
- Impostazioni, sezione «App»: Android — pulsante «Installa l'app» quando è arrivato
  `beforeinstallprompt` (salvato da `src/components/pwa/install-prompt.tsx`); iPhone/iPad in Safari
  e non in standalone (`navigator.standalone !== true` e `display-mode` diverso da `standalone`) —
  istruzioni «Tocca Condividi, poi Aggiungi alla schermata Home» e l'avviso «Finché l'app non è
  installata, Safari può cancellare dopo 7 giorni le bollette in coda.»; già installata — «App
  installata».

### 4.7 Playwright

- `playwright.config.ts`: i progetti `mobile`, `desktop`, `closed` aggiungono `serviceWorkers:
  'block'` (il worker in cache confonderebbe gli altri test); nuovo progetto `pwa` (Chromium mobile,
  `serviceWorkers: 'allow'`, `testMatch: /pwa\.spec/`, `storageState` di seed A).
- `tests/e2e/pwa.spec.ts`: (1) `GET /manifest.webmanifest` → JSON con `display: 'standalone'` e le
  tre icone che rispondono 200; (2) dopo il primo caricamento `navigator.serviceWorker.ready`;
  (3) `context.setOffline(true)` → navigazione a `/forniture` → contenuto di `/offline`;
  (4) offline, autolettura su «Luce» di seed A → «Salvata in coda»; `setOffline(false)` → entro 20 s
  la voce sparisce dalla coda e la lettura è in `e2e.db` (letta con `createDb`); ripetendo il
  salvataggio identico online → una sola riga; (5) offline, carica `gas-fenicottero.pdf` → in coda;
  online → in «Da rivedere» come estratta (fake). Nessuna intercettazione di rete con `page.route`
  (Playwright non vede le richieste che passano da un worker attivo: segnaprezzi bloccava il worker
  nel suo progetto della coda proprio per questo); qui bastano i fake lato server.

## 5. Vincoli e trappole

- **AGENTS.md § 8 PWA** (si completa qui): `next build --webpack` obbligatorio, `sw.js` solo nelle
  build di produzione, pagina offline precachata a mano, `/api/*` sempre `NetworkOnly`, nessun dato
  dell'utente nelle cache.
- **AGENTS.md § 2.3 Secrets** — le voci in coda contengono le bollette (dati personali)
  nell'IndexedDB del telefono dell'owner: si cancellano appena riuscite; «Elimina account» non può
  svuotare l'IndexedDB di altri dispositivi (dichiarato in `doc/guide/pwa.md`).
- **AGENTS.md § 2.4 Isolation** — la coda chiama le stesse route con la sessione dell'utente; una
  coda di un utente uscito dalla sessione riceve 401 → `failed` con «Accedi di nuovo e riprova».
- iOS: niente Background Sync; lo storage si cancella dopo 7 giorni senza installazione; il permesso
  `persist()` lo decide il browser senza chiedere.
- Dexie su Safari 15–18: risvegli instabili delle schede (doc Dexie): la coda si riprova a ogni
  `visibilitychange`.
- Test: in Vitest la coda gira in node con `fake-indexeddb/auto` (`vitest.setup.ts`, nuovo, in
  `setupFiles` del progetto `unit`) e
  `vi.useFakeTimers({ toFake: ['Date'] })` soltanto (segnaprezzi § 4.43: fingere anche i timer
  blocca Dexie).

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `queue.test.ts` (fake-indexeddb, `fetch` finto): offline → niente richieste; autolettura → `POST /api/readings`, voce cancellata; 503 tre volte poi 201 → tre ritentativi con `nextAttemptAt` a +1, +2, +4 s, poi cancellata; 422 → `failed` col messaggio, nessun ritentativo; sesto fallimento → `failed`; bolletta → sequenza `extractions` → upload → `uploaded` → `run`; `duplicateOf` → nessun upload, voce cancellata; ripresa con `extractionId` già salvato → nessuna nuova `POST /api/extractions`; due `drainQueue` concorrenti → una sola elabora (lock finto). | Ritentare anche sui 4xx → il caso 422 ritenta. |
| Integrazione | `readings.test.ts` esteso: due `createSelfReadings` identici → una riga, gli stessi id. | Togliere il controllo → due righe. |
| E2E | `pwa.spec.ts` come in § 4.7. | `register: false` senza registrar → (2) fallisce. |
| E2E | `a11y.spec.ts` esteso a `/offline` e alle sezioni nuove. | — |

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite precedente verde con i service worker bloccati nei progetti esistenti.
- **C — Comportamento nuovo**: suite verde; `pnpm build` produce `public/sw.js` (controllo: il file
  esiste ed è più grande di 1 KB).
- **D — Sotto la UI**: `curl` a `POST /api/readings` con la sessione di seed A e il `supplyId` di una
  fornitura di seed B → 404; con la propria → 201.
- **F — Giro guidato sui telefoni** (al via dell'owner, in **produzione** dopo il merge, perché
  servono HTTPS e il dominio vero):
  1. Android (Chrome): Impostazioni → «Installa l'app» → icona sulla home; aprirla: si apre a tutto
     schermo con il nome «Bollette»?
  2. iPhone (Safari): le istruzioni in Impostazioni; «Aggiungi alla schermata Home»; l'icona e il
     nome giusti?
  3. Su uno dei due, modalità aereo: autolettura del contatore → «Salvata in coda»; foto di una
     bolletta di carta → «Salvata in coda»; togliere la modalità aereo e riaprire l'app → la lettura
     compare in «Letture», la bolletta in «Da rivedere» (estrazione reale: **costo detto prima,
     circa 0,30 $**, parte solo all'OK).
  4. Pagina offline: con la modalità aereo, aprire una pagina mai visitata → il testo di `/offline`.
  5. Un deploy nuovo (anche solo documentazione) → toast «Nuova versione disponibile» → «Aggiorna».
  Che cosa NON copre: notifiche (non previste nella v1), sincronizzazione in background su iOS (non
  esiste).
- **G — Ripristino**: la bolletta del collaudo, se l'owner non la vuole, si elimina dalla UI (file
  compresi); la coda del telefono è vuota.

## 8. Messa in esercizio

- Nessuna migrazione; nessuna variabile.
- Dopo il merge il deploy di produzione pubblica `sw.js`, manifest e icone; misura di chiusura: il
  collaudo F sui due telefoni.

## 9. Documentazione

- **`doc/guide/pwa.md`** (nasce qui, ≤ 250 righe): build con webpack, il service worker e le sue
  regole di cache, la pagina offline, la coda (forma, ritentativi, lock, inneschi, idempotenza),
  iOS e Android, i test con `fake-indexeddb` e il progetto `pwa`.
- `AGENTS.md` § 8: stub che rimanda a `doc/guide/pwa.md`; § 11 Gotchas nuove con la data.
- `CLAUDE.md`: Latest (la v1 è completa: lo si dice); § Key Features (PWA e coda); § Not yet present
  aggiornato (notifiche push, sincronizzazione in background su iOS).
- `SETUP.md`: sezione *Install on your phone*.
- `README.md`: § What it does (installabile, offline) e lo stato «v1 completa».
- `WORKFLOW.md` § 3: la riga `pnpm icons` è vera; il progetto `pwa` nella riga dei browser test.

## 10. Fuori ambito, dichiarato

- Notifiche push (scadenze delle bollette, estrazione pronta) → CLAUDE.md § Not yet present.
- Modifiche offline di bollette già salvate, dashboard offline con dati in cache → CLAUDE.md § Not
  yet present (scelta: nessun dato dell'utente nelle cache).
- Badge dell'app e Web Share Target (aprire un PDF «con Segnabollette» dalla mail) → CLAUDE.md § Not
  yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **M**.

```
Ciao, in questa sessione implemento la spec doc/v1/09-pwa-fotocamera-e-coda-offline.md.

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), DESIGN.md, doc/guide/app.md, doc/guide/estrazione.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 09 INTERA
- Controlla con un grep che i contratti C-9, C-13, C-16, C-17 esistano con i nomi e le firme
  dell'indice (in particolare le route di T-22 e uploadDocumentFile)

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/09-pwa-offline. Crea SESSION_NOTES.md.

Implementa la spec 09 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima; la fase F sui telefoni
la faccio io in produzione dopo il merge, e l'estrazione reale parte solo al mio OK), § 9 la
documentazione. Non decidere nulla che la spec ha già deciso; se trovi un punto che la spec non
copre, fermati e chiedimelo con AskUserQuestion. Le etichette della serie non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
