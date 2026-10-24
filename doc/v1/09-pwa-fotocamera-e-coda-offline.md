# 09 — PWA, fotocamera e coda offline

> **Stato**: scritta 2026-10-24; riletta in modo adversariale il 2026-10-24: 24 rilievi, 7 decisioni
> (D-41, D-42, D-47, D-55, D-59, D-60, D-61). Pronta per l'implementazione.
> **Branch**: `feature/09-pwa-offline` da `main` aggiornato dopo il merge della 08. **Dipende da**:
> 08 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-9, D-28, D-39, D-41, D-42, D-47, D-55, D-59,
> D-60, D-61; scelte T-1 (serwist, dexie, sharp), T-4, T-14, T-16, T-22, T-27; contratti C-20 — lo
> crea; usa C-3, C-4, C-5, C-7, C-8, C-9, C-12, C-13, C-16, C-17, C-18, C-23, C-24.

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
6. Le route della 06 (T-22: `POST /api/extractions`, `…/uploaded`, `…/run`) sono già HTTP; la coda
   usa le prime due (l'estrazione parte solo al clic dell'owner, D-42); per le autoletture serve una
   route (le Server Action non sono chiamabili da una coda).

## 2. Obiettivo e criteri di accettazione

| # | Criterio | Prova |
|---|---|---|
| A1 | Manifest (`/manifest.webmanifest`) con nome, icone 192/512 e maskable, `display: standalone`, `start_url: '/'`, `lang: 'it'`; icona Apple 180 px; l'app si installa su Android e su iPhone. | E2E `pwa.spec.ts` (manifest e icone); collaudo § 7 F sui telefoni. |
| A2 | Service worker in produzione: API, pagine e payload RSC non vanno mai in cache (in cache solo `/_next/static/`, icone e logo, e la precache di Serwist); le navigazioni senza rete mostrano `/offline`; un aggiornamento mostra «Nuova versione disponibile — Aggiorna». | E2E `pwa.spec.ts` (offline → `/offline`; nomi e contenuto delle cache). |
| A3 | Coda offline (Dexie), per la pagina già aperta (D-60): senza rete, «Carica» di una bolletta (PDF o foto già convertite) e «Salva» di un'autolettura finiscono in coda con il messaggio «Salvata in coda: parte appena torni in rete»; tornata la rete la coda si svuota da sola (avvio, `online`, pagina di nuovo visibile, dopo l'accodamento, messaggio `drain-queue` del service worker): l'autolettura si salva; la bolletta si carica e compare `queued` in «Da rivedere» con «Estrai (circa X $)», e l'estrazione parte solo al clic (D-42). Una voce la invia e la mostra solo la sessione dell'utente che l'ha accodata. | E2E `pwa.spec.ts` (`context.setOffline` dopo l'apertura della pagina); unit `queue.test.ts`. |
| A4 | Ritentativi dopo 1, 2, 4, 8, 16 s: al massimo 5 ritentativi (6 richieste in tutto) sulle risposte 408, 429 e ≥ 500; un'eccezione di rete non consuma tentativi e riparte dopo 16 s (D-61); un 4xx definitivo → «non riuscita: <messaggio>» (401: «Accedi di nuovo e riprova») con «Riprova» ed «Elimina». | Unit. |
| A5 | Nessun doppione: un'autolettura ritentata non crea una seconda riga; una bolletta ritentata dopo la creazione dell'estrazione riprende con l'`extractionId` e i `documents` salvati nella voce, senza una nuova `POST /api/extractions`; una risposta «doppione» con `documents` riprende il caricamento su quei pathname (D-59). | Unit + integrazione. |
| A6 | La coda si vede: banner «Sei offline» quando manca la rete; in «Da rivedere» la sezione «In attesa di rete» (bollette) e in «Letture» le autoletture in coda, con stato, «Riprova» (sulle non riuscite) ed «Elimina» (mai su quelle in corso). | E2E. |
| A7 | Installazione: in Impostazioni «Installa l'app» (Android, da `beforeinstallprompt`, catturato in tutta l'app) o le istruzioni per iPhone (Safari non in standalone) con l'avviso dei 7 giorni; `navigator.storage.persist()` chiesto alla prima voce in coda. | E2E (Chromium: l'evento simulato su `/`, il pulsante compare in Impostazioni); collaudo F. |

## 3. Decisioni

- **D-9** (PWA come segnaprezzi), **D-28** (autolettura a mano: in coda anche quella), **D-39**
  (tema: i colori del manifest seguono DESIGN.md).
- **D-41** (collaudo in produzione dopo il merge): commit unico e PR prima del merge (stato
  «implementata il <data>, branch `feature/09-pwa-offline`»); dopo il merge, nella stessa sessione, il giro F sui telefoni;
  esito, gotchas e stato «in esercizio» restano in `SESSION_NOTES.md` (non tracciato) e li scrive
  una breve sessione di chiusura di soli documenti, che dichiara la v1 completa (§ 8).
- **D-42** (estrazione solo al clic): la coda carica i file, chiama `…/uploaded` e si ferma;
  l'estrazione compare `queued` in «Da rivedere» con «Estrai (circa X $)».
- **D-47** (autolettura nel futuro rifiutata): `POST /api/readings` passa
  `{ today: romeToday(Date.now()) }` a `createSelfReadings`.
- **D-55** (nessuna prova della fotocamera dal telefono in sviluppo): «Scatta foto» si prova nel
  giro F in produzione, fotografando una bolletta digitale aperta sullo schermo del computer.
- **D-59** (ripresa dei caricamenti interrotti): la voce ricorda il passo
  (`stage: 'create' | 'upload' | 'uploaded'`) e i `documents`; una risposta «doppione» con
  `documents` riprende il caricamento su quei pathname; un 404 di `…/uploaded` con lo stage già a
  `'uploaded'` conta come riuscito.
- **D-60** (coda solo per la pagina già aperta): `/offline` dice di aprire «Letture» o «Carica
  bolletta» con la rete; collaudo ed E2E aprono la pagina prima di togliere la rete; l'apertura
  dell'app a freddo senza rete va in `CLAUDE.md § Not yet present`.
- **D-61** (eccezione di rete): non consuma tentativi; la voce resta `queued` con
  `nextAttemptAt = now + 16 s`; solo 408, 429 e ≥ 500 consumano i 5 ritentativi.
- **T-1** (`@serwist/next` e `serwist` 9.5.13, `dexie` 4.4.7, `dexie-react-hooks` 4.4.0,
  `fake-indexeddb` 6.2.6, `sharp` 0.35.5, `png-to-ico` 3.0.2), **T-4** (`--webpack`), **T-14**
  (`/offline`), **T-16** (Playwright: nuovo progetto `pwa`), **T-22**, **T-27** (svuotamento dalle
  pagine).
- (b) è fissata da D-42; le altre sono adottate qui, ribaltabili:
  (a) la coda elabora **una voce alla volta**, prima le autoletture poi le bollette, in ordine di
  accodamento;
  (b) una bolletta accodata, quando parte, **carica i file, chiama `…/uploaded` e si ferma** (D-42):
  l'estrazione compare `queued` in «Da rivedere» con «Estrai (circa X $)» e il costo si spende solo
  quando l'owner preme «Estrai», come nel caricamento online della 06;
  (c) l'autolettura passa da `POST /api/readings` e `createSelfReadings` diventa **idempotente**:
  una riga `self` identica (fornitura, data, registro, valore) non si inserisce di nuovo e si
  restituisce quella esistente;
  (d) nessun caricamento dal service worker: l'evento `sync` (solo Chromium) manda
  `{ type: 'drain-queue' }` alle pagine aperte (T-27);
  (e) le voci riuscite si cancellano dalla coda; quelle non riuscite restano finché l'owner non le
  ritenta o le elimina;
  (f) colori: i valori sRGB esadecimali dei token `--color-bg` (sfondo) e `--color-brand` (tema) di
  DESIGN.md, chiari e scuri, stanno in `src/lib/pwa/brand-colors.ts`
  (`export const BRAND_COLORS = { background, theme, backgroundDark, themeDark }`, con il commento
  `// WARNING: copied from the DESIGN.md tokens in globals.css — also update them there`); li
  leggono `src/app/manifest.ts` (i valori chiari), `viewport.themeColor` in `src/app/layout.tsx`
  (chiaro e scuro) e `scripts/generate-icons.ts` (lo sfondo chiaro): è l'unico file, con
  `globals.css`, dove compaiono colori letterali;
  (g) `start_url: '/'`, `id: '/'`, orientamento `portrait`; `short_name` «Bollette»;
  (h) ogni voce porta l'`userId` di chi l'ha accodata: la invia e la mostra solo una sessione dello
  stesso utente; «Esci» lascia le voci sul dispositivo (ripartono quando lo stesso utente rientra);
  «Elimina account» cancella dal dispositivo quelle con il suo `userId`.

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
  // The offline queue drains on 'online' by itself; a reload would drop a half-typed form and cut an upload in flight.
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  // Why: `next dev` otherwise appends a generated block to AGENTS.md on every run.
  agentRules: false,
};

export default withSerwist(nextConfig);
```

`tsconfig.json`: `"lib"` aggiunge `"webworker"`; `"types"` aggiunge `"@serwist/next/typings"`;
`exclude` aggiunge `"public/sw.js"`. `.gitignore` aggiunge `/public/sw.js*` (il worker è un prodotto
della build).

### 4.2 Service worker — `src/app/sw.ts`

```ts
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist';

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
    // Pages, RSC payloads, API responses and bill files carry the user's data: they never land in a cache.
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
    { matcher: ({ request }) => request.mode === 'navigate' || request.headers.get('RSC') === '1', handler: new NetworkOnly() },
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static/'), handler: new CacheFirst({ cacheName: 'next-static' }) },
    { matcher: ({ url, sameOrigin }) => sameOrigin && /^\/(icons|brand)\//.test(url.pathname), handler: new StaleWhileRevalidate({ cacheName: 'brand' }) },
    { matcher: () => true, handler: new NetworkOnly() },
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

Nessun `defaultCache` di `@serwist/next/worker`: contiene cache `NetworkFirst` per le pagine
(`pages`), per i payload RSC delle navigazioni client (`pages-rsc`) e per ogni altra richiesta
same-origin (`others`), che salverebbero importi e forniture dell'utente e resterebbero sul telefono
anche dopo «Esci» ed «Elimina account». Le navigazioni senza rete falliscono e `fallbacks` mostra
`/offline` (precachata, senza dati).

`src/components/pwa/service-worker-registrar.tsx` (client, montato in `AppShell`, nessuna prop):
solo con `process.env.NODE_ENV === 'production'` registra `/sw.js`; quando c'è un worker `waiting`
(subito o dopo `updatefound`) mostra il toast «Nuova versione disponibile» con «Aggiorna». Il
listener `controllerchange` → `location.reload()` si aggiunge solo dopo il tocco di «Aggiorna»,
subito prima di `postMessage({ type: 'SKIP_WAITING' })` al worker in attesa: con `clientsClaim: true`
il primo worker prende il controllo della pagina, e un listener sempre attivo la ricaricherebbe alla
prima visita. I messaggi `drain-queue` del worker li ascolta `QueueTriggers` (§ 4.4).

### 4.3 Manifest, icone, pagina offline

- `src/app/manifest.ts` (`MetadataRoute.Manifest`): `name: 'Segnabollette'`, `short_name:
  'Bollette'`, `description: 'Bollette, consumi e prezzi delle utenze di casa'`, `id: '/'`,
  `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'portrait'`, `lang: 'it'`,
  `background_color: BRAND_COLORS.background` e `theme_color: BRAND_COLORS.theme` (adottata f),
  icone `/icons/icon-192.png` (192, `any`), `/icons/icon-512.png` (512, `any`),
  `/icons/maskable-512.png` (512, `maskable`).
- `src/app/layout.tsx`: `metadata.appleWebApp = { capable: true, title: 'Bollette', statusBarStyle:
  'default' }`, `metadata.icons = { apple: '/icons/apple-touch-icon.png' }`; `viewport.themeColor =
  [{ media: '(prefers-color-scheme: light)', color: BRAND_COLORS.theme }, { media:
  '(prefers-color-scheme: dark)', color: BRAND_COLORS.themeDark }]`.
- `scripts/generate-icons.ts` (`pnpm icons`; riga di package.json:
  `"icons": "tsx scripts/generate-icons.ts"`): con sharp da `public/brand/logo.svg` (03) →
  `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` (logo all'80% su fondo pieno
  `BRAND_COLORS.background`: la zona sicura delle maskable), `apple-touch-icon.png` (180, stesso
  fondo pieno) e `public/favicon.ico` (16/32/48 con png-to-ico). Si cancella `src/app/favicon.ico`
  generato dallo scaffold della 01: i due file si scontrano (segnaprezzi § 4.48). Gli output si
  committano.
- `src/app/offline/page.tsx` (pubblica: `PUBLIC_PATHS` la contiene dalla 01): «Sei offline. Apri
  «Letture» o «Carica bolletta» quando hai rete: se poi la rete cade, quello che salvi resta in coda
  e parte da solo.» (D-60) e il pulsante «Riprova» (`location.reload()`). Nessun dato dell'utente
  nella pagina (è in cache).

### 4.4 Coda offline — `src/lib/offline/` (C-20)

`db.ts`:

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { SelfReadingInput } from '@/lib/domain/bill-input';

export type QueueStatus = 'queued' | 'working' | 'failed';
export type QueuedFileType = 'application/pdf' | 'image/jpeg';

/** Where a bill upload resumes: create the extraction, upload its files, or confirm the upload. */
export type BillUploadStage = 'create' | 'upload' | 'uploaded';

export interface PendingBillUpload {
  id: string;                 // nanoid, created at enqueue
  userId: string;             // the signed-in user who queued it: only their session sends or shows it
  supplyId: string | null;
  files: Array<{ blob: Blob; contentType: QueuedFileType; name: string }>;
  stage: BillUploadStage;
  extractionId: string | null;
  // From POST /api/extractions (a 201, or a duplicate that can be resumed), in the order of `files`.
  documents: Array<{ documentId: string; pathname: string; contentType: QueuedFileType }> | null;
  status: QueueStatus;
  attempts: number;           // retryable failures recorded so far
  nextAttemptAt: number | null;
  lastError: string | null;
  createdAt: number;
}

export interface PendingSelfReading {
  id: string;
  userId: string;
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
  pendingBillUploads: 'id, userId, status, createdAt',
  pendingSelfReadings: 'id, userId, status, createdAt',
});
```

`queue.ts` (firme ed esportazioni; i corpi seguono il comportamento descritto sotto):

```ts
import { uploadDocumentFile } from '@/lib/blob/upload-client';
import type { SelfReadingInput } from '@/lib/domain/bill-input';
import type { PendingBillUpload } from './db';

export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
/** A request that never reached the server uses up no attempt: the entry waits this long and goes again. */
export const NETWORK_RETRY_DELAY_MS = 16_000;
export const QUEUE_LOCK_NAME = 'segnabollette-queue';

export interface QueueDeps {
  userId: string;
  fetch: typeof fetch;
  now: () => number;
  isOnline: () => boolean;
  uploadFile: typeof uploadDocumentFile;
  sha256: (blob: Blob) => Promise<string>;
  locks: { request(name: string, options: { ifAvailable: true }, callback: (lock: unknown) => Promise<void>): Promise<void> };
  schedule: (delayMs: number, run: () => void) => void;
}

export type DrainReport = { done: number; retried: number; failed: number };

export async function enqueueBillUpload(entry: { supplyId: string | null; files: PendingBillUpload['files'] }, deps: QueueDeps): Promise<string>;
export async function enqueueSelfReading(input: SelfReadingInput, deps: QueueDeps): Promise<string>;
export async function drainQueue(deps: QueueDeps): Promise<DrainReport>;
export async function retryItem(kind: 'bill' | 'reading', id: string, deps: QueueDeps): Promise<void>;
export async function removeItem(kind: 'bill' | 'reading', id: string): Promise<void>;
/** Account deletion: this user's entries leave this device (other devices keep theirs). */
export async function clearUserQueue(userId: string): Promise<void>;

let scheduledDrain: ReturnType<typeof setTimeout> | undefined;

export function browserQueueDeps(userId: string): QueueDeps {
  return {
    userId,
    fetch: window.fetch.bind(window),
    now: () => Date.now(),
    isOnline: () => navigator.onLine,
    uploadFile: uploadDocumentFile,
    sha256: async (blob) => {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    },
    locks: {
      request: async (name, options, callback) => {
        await navigator.locks.request(name, options, callback);
      },
    },
    // One timer per page: a new schedule replaces the previous one.
    schedule: (delayMs, run) => {
      clearTimeout(scheduledDrain);
      scheduledDrain = setTimeout(run, delayMs);
    },
  };
}
```

Comportamento di `drainQueue(deps)` (nessuna dipendenza implicita: i test passano `fetch`, lock e
`schedule` finti, mai `navigator.locks` né un timer vero):
1. se `!deps.isOnline()` restituisce `{ done: 0, retried: 0, failed: 0 }` senza richieste;
2. `deps.locks.request(QUEUE_LOCK_NAME, { ifAvailable: true }, …)`: una callback con `lock === null`
   esce con il rapporto a zero (un altro svuotamento è in corso, in questa scheda o in un'altra);
3. tenendo il lock, riporta a `queued` ogni voce di `deps.userId` in stato `working`, senza toccare
   `attempts`: nessun altro svuotamento può averla in mano, perché il lock Web è unico per origine e
   si libera alla chiusura della scheda (una PWA sospesa o chiusa durante l'invio la lascia
   `working`);
4. elabora, una alla volta, le voci con `userId === deps.userId`, `status 'queued'` e
   `nextAttemptAt` nullo o ≤ `deps.now()`: prima le autoletture, poi le bollette, in ordine di
   `createdAt`; la voce passa a `working` prima della sua prima richiesta;
5. autolettura: `POST /api/readings` con `input` come corpo JSON; 201 → voce cancellata;
6. bolletta, dal suo `stage`:
   - `'create'`: SHA-256 di ogni file (`deps.sha256`), poi `POST /api/extractions` con
     `{ supplyId, batchId: null, files: files.map((file, i) => ({ sha256: hashes[i], contentType:
     file.contentType, sizeBytes: file.blob.size })) }`. 201 `{ extractionId, documents }` → salva
     nella voce, in una sola scrittura e prima di qualsiasi caricamento, `extractionId`, `documents`
     (stesso ordine di `files`) e `stage 'upload'`. 200 `{ duplicateOf, duplicateStatus, documents }`
     (estrazione `uploading` senza lotto e con gli stessi file, D-59) → la stessa scrittura con
     `extractionId = duplicateOf`: il caricamento riprende. 200 `{ duplicateOf, duplicateStatus }`
     senza `documents` → voce cancellata (l'estrazione esiste già e si trova in «Da rivedere»);
   - `'upload'`: per ogni `i`, `deps.uploadFile({ file: files[i].blob, pathname:
     documents[i].pathname, documentId: documents[i].documentId, contentType:
     documents[i].contentType })` (la route di upload della 06 permette di sovrascrivere: un file
     arrivato a metà si ricarica intero); poi `stage 'uploaded'`;
   - `'uploaded'`: `POST /api/extractions/<extractionId>/uploaded`; 200 → voce cancellata; 404 →
     riuscito anche questo (la richiesta precedente era arrivata e l'estrazione non è più
     `uploading`), voce cancellata; 422 → voce cancellata (l'estrazione è `failed` con il messaggio e
     si vede in «Da rivedere»);
   - la coda non chiama mai `…/run` (D-42): l'estrazione resta `queued` in «Da rivedere» con
     «Estrai (circa X $)»;
   - una voce `'create'` riparte da `POST /api/extractions`; una `'upload'` o `'uploaded'` riparte
     dal suo passo con l'`extractionId` e i `documents` salvati, senza una nuova
     `POST /api/extractions`;
7. errori, con `attempts` = fallimenti ritentabili già registrati:
   - eccezione di rete (`deps.fetch` che lancia, oppure `deps.uploadFile` che lancia mentre
     `deps.isOnline()` è falso) → nessun tentativo consumato: `status 'queued'`,
     `nextAttemptAt = deps.now() + NETWORK_RETRY_DELAY_MS`, `attempts` invariato (D-61);
   - ritentabile (risposta 408, 429 o ≥ 500, oppure `deps.uploadFile` che lancia con la rete
     presente): se `attempts < MAX_ATTEMPTS` → `nextAttemptAt = deps.now() +
     RETRY_DELAYS_MS[attempts]`, poi `attempts = attempts + 1`, `status 'queued'`, `lastError` = il
     messaggio; altrimenti (sesto fallimento) → `failed` con il messaggio. Le richieste sono al
     massimo 6: la prima e 5 ritentativi;
   - non ritentabile: 401 → `failed` con «Accedi di nuovo e riprova»; gli altri 4xx, compreso
     `DUPLICATE_DOCUMENT` (409, «Questo file è già stato caricato.»), → `failed` con il `message`
     della risposta;
   - il messaggio di una risposta è il `message` del suo corpo JSON (`toErrorResponse`, 06), oppure
     «Errore del server (HTTP <status>)» quando il corpo non lo ha; quello di un caricamento non
     riuscito è «Caricamento del file non riuscito.»;
8. alla fine, se restano voci di `deps.userId` `queued` con `nextAttemptAt` non nullo, chiama
   `deps.schedule(Math.max(0, nearest - deps.now()), () => void drainQueue(deps))`, dove `nearest` è
   il `nextAttemptAt` più vicino, con le stesse `deps`;
9. restituisce `{ done, retried, failed }` (voci cancellate, riprogrammate, passate a `failed`).

`enqueueBillUpload` e `enqueueSelfReading` scrivono la voce (`userId: deps.userId`, `status
'queued'`, `attempts 0`, `nextAttemptAt null`, `lastError null`, `createdAt: deps.now()`; la
bolletta con `stage 'create'`, `extractionId null`, `documents null`); alla prima voce accodata dopo
il caricamento della pagina chiedono `navigator.storage.persist()` (solo se
`navigator.storage?.persist` esiste); registrano il
Background Sync solo se `'serviceWorker' in navigator` e `await
navigator.serviceWorker.getRegistration()` restituisce una registrazione con `'sync' in
registration` (`registration.sync.register('segnabollette-queue')`; mai
`navigator.serviceWorker.ready`, che senza worker, cioè in sviluppo, non si risolve; un errore della
registrazione si ignora); poi chiamano `drainQueue(deps)` senza aspettarla e restituiscono l'id.

`retryItem(kind, id, deps)`: solo su una voce `failed` di `deps.userId`: `status 'queued'`,
`attempts 0`, `nextAttemptAt null`, `lastError null` (stage, `extractionId` e `documents` restano),
poi `drainQueue(deps)`. `removeItem(kind, id)` cancella la voce; un'estrazione `uploading` rimasta da
una voce cancellata la abbandona la creazione successiva (D-59) o la elenca `documents:prune` (06).

`src/components/offline/queue-user.tsx` (client): `QueueUserProvider({ userId, children })` e
`useQueueDeps(): QueueDeps` (`browserQueueDeps(userId)` memorizzato); lo leggono `BillUploader`,
`SelfReadingForm`, le sezioni della coda e `delete-account.tsx`.

`src/components/offline/use-queue.ts`: `useQueueItems(userId)` = `useLiveQuery` delle due tabelle
con `where('userId').equals(userId)` → conteggi e voci per la UI; `useQueueTriggers(userId)`:
`drainQueue(deps)` (con `deps = browserQueueDeps(userId)`) all'avvio, su `online`, su
`visibilitychange` visibile e sui messaggi `{ type: 'drain-queue' }` di
`navigator.serviceWorker` (se c'è); quando uno svuotamento restituisce `done > 0` chiama
`router.refresh()`, così le pagine server («Letture», «Da rivedere», «Casa») mostrano quello che la
coda ha appena salvato.

`src/components/offline/queue-triggers.tsx` (client, nessun markup): `QueueTriggers({ userId })`
chiama `useQueueTriggers(userId)`.

`AppShell` (03, C-24) aggiunge la prop `userId: string` (il layout `(app)` la passa da
`getSessionUser()`, accanto a `reviewCount` della 06), monta `<ServiceWorkerRegistrar />`,
`<QueueTriggers userId={userId} />`, `<InstallPromptCatcher />` e `<OfflineBanner />`, e avvolge
`children` in `<QueueUserProvider userId={userId}>`.

`src/components/settings/delete-account.tsx` (03): al successo di `authClient.deleteUser`, prima di
`router.replace('/accedi')`, `await clearUserQueue(userId)` (`userId` da `useQueueDeps()`). «Esci»
lascia le voci.

### 4.5 Route nuova — `POST /api/readings`

`src/app/api/readings/route.ts` (`POST`): `requireUser()` (senza sessione → 401) →
`request.json()` (un JSON non valido → `DomainError('VALIDATION')`) →
`createSelfReadings(getDb(), user.id, body, { today: romeToday(Date.now()) })` (adottata c:
idempotente; valida con `SelfReadingInputSchema` e lancia `VALIDATION`, cioè 400; una fornitura
altrui o inesistente → `NOT_FOUND`, 404; una data dopo oggi → `VALIDATION` «La lettura non può
essere nel futuro.», D-47) → `revalidatePath('/letture')`, `revalidatePath('/forniture/[id]',
'page')`, `revalidatePath('/')` → 201 `{ readingIds }`; errori con `toErrorResponse` (06). Un corpo
non valido non diventa mai un 500, che la coda ritenterebbe.

Il repository `src/lib/db/repositories/readings.ts` (02) aggiunge
`listSelfReadingsOn(db: Db, userId: string, supplyId: string, readOn: IsoDate): Promise<ReadingRow[]>`
(`WHERE user_id = :userId AND supply_id = :supplyId AND read_on = :readOn AND source = 'self'`).
`createSelfReadings(db, userId, rawInput, options: { today })` (02) cambia così, senza cambiare
firma: dopo i controlli esistenti legge `listSelfReadingsOn`; per ogni valore di `input.values` riusa
l'id della riga con lo stesso `register` e lo stesso `value`, altrimenti la inserisce; restituisce
`readingIds` nell'ordine di `input.values`; se non c'è niente da inserire non chiama
`insertReadingsQuery` (oggi la inserisce con un `await` diretto, senza `db.batch`, e Drizzle rifiuta
`insert().values([])`).

### 4.6 Interfaccia

- `BillUploader` (06): se `navigator.onLine === false`, oppure se la `fetch` di
  `POST /api/extractions` lancia (errore di rete), «Carica» → `enqueueBillUpload({ supplyId, files },
  useQueueDeps())` (con i file già convertiti) → messaggio «Salvata in coda: parte appena torni in
  rete» e link a «Da rivedere». Online il percorso resta quello della 06 (stima e «Estrai (circa
  X $)»). Vale solo in modalità `extract`: in modalità `attach` (un allegato a una bolletta già
  salvata) senza rete «Carica» mostra «Serve la rete per allegare il file.» e non accoda nulla.
- `SelfReadingForm` (03): l'avviso del valore più basso (D-50) e la sua conferma vengono prima;
  poi, se `navigator.onLine === false` o la Server Action lancia per un errore di rete, il
  `SelfReadingInput` già costruito va a `enqueueSelfReading(input, useQueueDeps())` con lo stesso
  messaggio; online continua a usare `createReadingsAction`.
- `src/components/offline/offline-banner.tsx` (`OfflineBanner`, montato in `AppShell` sotto
  l'intestazione): `role="status"`, «Sei offline: quello che salvi resta in coda sul telefono.»
  finché `navigator.onLine` è falso.
- `/bollette/da-rivedere`: sezione «In attesa di rete» con le bollette in coda di `useQueueItems`.
  Per ogni voce: «N file», data di accodamento `formatDate(romeToday(createdAt))`, stato «in coda»
  (con «nuovo tentativo automatico» se `nextAttemptAt` non è nullo), «in corso», «non riuscita:
  <lastError>». «Riprova» (`retryItem`) solo sulle `failed`; «Elimina» (`removeItem`) sulle `queued`
  e sulle `failed`; nessun controllo sulle `working`.
- `/letture`: in cima, le autoletture in coda con gli stessi stati e controlli; per ogni voce la
  fornitura (dall'elenco della pagina), la data della lettura `formatDate(input.readOn)` e i registri.
- Impostazioni, sezione «App»: `src/components/pwa/install-prompt.tsx` esporta
  `InstallPromptCatcher` (montato in `AppShell`: l'evento arriva una volta per caricamento di pagina,
  anche su una pagina diversa da Impostazioni), che su `beforeinstallprompt` chiama
  `preventDefault()` e salva l'evento in un piccolo store del modulo, e `useInstallPrompt()`, che la
  sezione legge e che restituisce l'evento salvato. Android — pulsante «Installa l'app» quando
  l'evento c'è (al tocco `prompt()`, poi l'evento si azzera; `appinstalled` → «App installata»);
  iPhone/iPad in Safari e non in standalone (`navigator.standalone !== true` e `display-mode`
  diverso da `standalone`) — istruzioni «Tocca Condividi, poi Aggiungi alla schermata Home» e
  l'avviso «Finché l'app non è installata, Safari può cancellare dopo 7 giorni le bollette in
  coda.»; già installata — «App installata».

### 4.7 Playwright

- `playwright.config.ts`: i progetti `mobile` e `desktop` passano a
  `testIgnore: /signup-closed|pwa\.spec/` e, con `closed`, aggiungono `serviceWorkers: 'block'` (il
  worker in cache confonderebbe gli altri test, e lì il caso (2) non si risolverebbe mai); nuovo
  progetto `{ name: 'pwa', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 },
  baseURL: OPEN, serviceWorkers: 'allow' }, testMatch: /pwa\.spec/ }`, senza `storageState`: i seed
  restano in sola lettura.
- `tests/e2e/pwa.spec.ts` registra il suo utente con `signUpTestUser(page, 'pwa')` (03, C-23) e crea
  dalla UI «Casa Pangolino» con le forniture «Luce» e «Gas». Casi:
  (1) `GET /manifest.webmanifest` → JSON con `display: 'standalone'` e le tre icone che rispondono
  200;
  (2) dopo il primo caricamento `navigator.serviceWorker.ready` si risolve;
  (3) `context.setOffline(true)` → navigazione a `/forniture` → il testo di `/offline`;
  (4) aperta `/letture` con la rete (D-60), `setOffline(true)`, autolettura sulla «Luce» con la data
  di oggi → «Salvata in coda» e la voce nella sezione delle autoletture in coda; axe sulla pagina
  con la voce in coda → 0 violazioni; `setOffline(false)` → entro 20 s la voce sparisce dalla coda,
  la lettura compare nell'elenco della pagina ed è in `meter_readings` di `e2e.db` (letta con
  `createDb`); ripetendo online il salvataggio identico → ancora una sola riga;
  (5) aperte con la rete `/bollette/carica` e, in una seconda scheda dello stesso contesto,
  `/bollette/da-rivedere`; `setOffline(true)`; una foto PNG generata nel test con un `<canvas>` che
  contiene la parola spia del file («pangolino»), scelta con «Scegli PDF o foto» e la fornitura
  «Riconosci dalla bolletta» → convertita, «Carica» → «Salvata in coda»; nella seconda scheda la
  voce compare in «In attesa di rete» (axe → 0 violazioni); `setOffline(false)` → entro 20 s la
  voce sparisce; ricaricata la seconda scheda, in «Da rivedere» c'è un'estrazione nuova `queued`
  con «Estrai (circa X $)» e `started_at` nullo in `e2e.db`; il test clicca «Estrai» → `extracted`
  (fake, `photo-default.json`), letto anche in `e2e.db`;
  (6) dopo aver aperto online `/` e `/forniture`, `caches.keys()` contiene solo la precache di
  Serwist (nome che comincia con `serwist-precache`), `next-static` e `brand`, e nessuna voce di
  nessuna cache ha l'URL di una pagina (`/`, `/forniture`);
  (7) su `/` il test lancia un `beforeinstallprompt` sintetico (un `Event` con `prompt` e
  `userChoice` finti), poi va in Impostazioni con il link della navigazione (navigazione client) →
  il pulsante «Installa l'app» è visibile.
  Nessuna intercettazione di rete con `page.route` (Playwright non vede le richieste che passano da
  un worker attivo: segnaprezzi bloccava il worker nel suo progetto della coda proprio per questo);
  qui bastano i fake lato server.
- `tests/e2e/isolamento.spec.ts` (esteso): un utente registrato nel test con `signUpTestUser`, con
  «Casa Ibis» e la sua «Luce», fa `POST /api/readings` con la data di oggi: con il `supplyId` della
  propria «Luce» → 201; con il `supplyId` della «Luce» di seed B (letto da `e2e.db`) → 404 e nessuna
  riga nuova in `meter_readings`. Seed B si legge soltanto.
- `tests/e2e/a11y.spec.ts` (esteso): `/offline` (pubblica), mobile e desktop, tema chiaro e scuro.

## 5. Vincoli e trappole

- **AGENTS.md § 8 PWA** (si completa qui) — qui vuol dire: `next build --webpack` obbligatorio,
  `sw.js` solo nelle build di produzione, pagina offline precachata a mano, `reloadOnOnline: false`;
  nessun dato dell'utente nelle cache: `/api/*`, navigazioni e payload RSC sempre `NetworkOnly`, in
  cache solo la precache di Serwist, `next-static` e `brand`, mai `defaultCache`.
- **AGENTS.md § 7 UI** — qui vuol dire: i colori letterali stanno solo in `globals.css` e in
  `src/lib/pwa/brand-colors.ts` (manifest, `themeColor`, icone li leggono da lì).
- **AGENTS.md § 2.3 Secrets** — le voci in coda contengono le bollette (dati personali)
  nell'IndexedDB del telefono: si cancellano appena riuscite; «Elimina account» cancella da questo
  dispositivo le voci con il suo `userId` (`clearUserQueue`), ma non può svuotare l'IndexedDB di
  altri dispositivi (dichiarato in `doc/guide/pwa.md`).
- **AGENTS.md § 2.4 Isolation** — qui vuol dire: ogni voce porta l'`userId` di chi l'ha accodata, e
  `drainQueue`, `retryItem` e `useQueueItems` considerano solo le voci di quell'utente: su un
  telefono condiviso la sessione di B non invia né mostra le voci di A (una bolletta di A con
  «Riconosci dalla bolletta» finirebbe nell'account di B). La coda chiama le stesse route con la
  sessione dell'utente; una sessione scaduta riceve 401 → `failed` con «Accedi di nuovo e riprova».
- iOS: niente Background Sync; lo storage si cancella dopo 7 giorni senza installazione; il permesso
  `persist()` lo decide il browser senza chiedere; una PWA mandata in background durante un invio
  viene sospesa o chiusa (la voce rimasta `working` la riprende lo svuotamento successivo).
- Dexie su Safari 15–18: risvegli instabili delle schede (doc Dexie): la coda si riprova a ogni
  `visibilitychange`.
- Test: in Vitest la coda gira in node con `fake-indexeddb/auto`: `vitest.setup.ts` (nuovo) entra con
  `setupFiles: ['./vitest.setup.ts']` nel solo progetto `unit` della 07; `vi.useFakeTimers({ toFake:
  ['Date'] })` soltanto (segnaprezzi § 4.43: fingere anche i timer blocca Dexie); lock e timer
  arrivano da `QueueDeps` (`locks`, `schedule`) finti.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `src/lib/offline/queue.test.ts` — ritentativi (fake-indexeddb, `fetch`, `locks` e `schedule` finti, `Date` finto): offline → nessuna richiesta; autolettura → `POST /api/readings`, voce cancellata; 503 tre volte poi 201 → `nextAttemptAt` a +1, +2, +4 s (`attempts` 1, 2, 3), poi voce cancellata; sei 503 di fila → 6 richieste in tutto, poi `failed` e nessuna settima; `fetch` che lancia → `attempts` resta 0, `status 'queued'`, `nextAttemptAt` = +16 s; 422 → `failed` col `message` della risposta, nessun ritentativo; 401 → `failed` con «Accedi di nuovo e riprova»; 409 `DUPLICATE_DOCUMENT` → `failed` con «Questo file è già stato caricato.»; alla fine `schedule` riceve il ritardo del `nextAttemptAt` più vicino. | Ritentare anche sui 4xx → il caso 422 ritenta; `attempts <= MAX_ATTEMPTS` al posto di `<` → 7 richieste; contare l'eccezione di rete come un 503 → `attempts` 1; usare `RETRY_DELAYS_MS[attempts]` dopo l'incremento → +2 s al primo ritentativo. |
| Unit | `queue.test.ts` — bollette: sequenza `POST /api/extractions` (con `sha256`, `contentType`, `sizeBytes` per file) → un upload per file sui pathname della risposta → `…/uploaded`, e nessuna chiamata a `…/run`, voce cancellata; dopo il 201, con il primo upload che lancia a rete presente, la voce ha già `extractionId`, `documents` e `stage 'upload'`; ripresa di una voce `'upload'` → nessuna nuova `POST /api/extractions`, upload sui pathname salvati; 200 con `duplicateOf` e `documents` → upload su quei pathname, poi `…/uploaded`; 200 con `duplicateOf` senza `documents` → nessun upload, voce cancellata; voce `'uploaded'` e 404 di `…/uploaded` → voce cancellata, `done` 1; 422 di `…/uploaded` → voce cancellata. | Chiamare `…/run` dopo `…/uploaded` → la sequenza attesa fallisce; salvare `extractionId` e `documents` dopo gli upload → il caso del primo upload che lancia fallisce; trattare il 404 o il 422 di `…/uploaded` come un 4xx qualsiasi → la voce va in `failed`. |
| Unit | `queue.test.ts` — lock, utente, voci bloccate: due `drainQueue` concorrenti con un lock finto che concede il nome una volta sola → la seconda riceve `null`, una sola richiesta per voce; voce lasciata `working` → il `drainQueue` successivo la invia; voce dell'utente A con `deps.userId` = A → inviata, con `deps.userId` = B → nessuna richiesta e voce intatta; `retryItem` su una `failed` → `attempts 0`, inviata; `clearUserQueue(A)` → restano solo le voci di B. | Ignorare `lock === null` → due richieste per la stessa voce; non riportare le `working` a `queued` → la voce non parte; togliere il filtro su `userId` → B invia la voce di A. |
| Integrazione | `src/lib/services/readings.test.ts` esteso: due `createSelfReadings` identici → una riga, gli stessi id nello stesso ordine di `input.values`; lo stesso giorno con un valore diverso → una riga nuova; coppia sul repository: `listSelfReadingsOn` con l'`userId` del proprietario → la riga, con l'`userId` di un altro utente → `[]`. | Togliere il controllo → due righe; togliere `user_id` dal `WHERE` di `listSelfReadingsOn` → l'altro utente vede la riga. |
| E2E | `pwa.spec.ts` come in § 4.7, casi (1)–(7). | `register: false` senza registrar → (2) fallisce; rimettere `...defaultCache` in testa a `runtimeCaching` → compaiono `pages`/`pages-rsc` e (6) fallisce; la coda chiama anche `…/run` → l'estrazione è già `extracted` prima del clic e (5) fallisce; `InstallPromptCatcher` montato solo in Impostazioni → (7) fallisce; `useQueueTriggers` senza `router.refresh()` → in (4) la lettura non compare nell'elenco. |
| E2E | `isolamento.spec.ts` esteso con `POST /api/readings` come in § 4.7. | Togliere `userId` dal `WHERE` di `getSupply` → l'utente del test scrive una lettura sulla fornitura di seed B. |
| E2E | `a11y.spec.ts` esteso a `/offline`; axe in `pwa.spec.ts` sulle sezioni della coda (casi 4 e 5). | Il pulsante «Riprova» di `/offline` ridotto a un'icona senza testo né `aria-label` → violazione `button-name`. |

## 7. Collaudo guidato (WORKFLOW.md § 2)

In locale, prima del commit (A, C, D); in produzione, dopo il merge (F, G; F5 nella sessione di
chiusura, § 8). La fotocamera del telefono non si prova in sviluppo (D-55).

- **A — Invarianza**: atteso: suite precedente verde con i service worker bloccati nei progetti
  `mobile`, `desktop`, `closed`, e `pwa.spec.ts` assente da `mobile` e `desktop` (l'elenco dei test
  di `pnpm test:e2e --list` lo mostra solo sotto `pwa`).
- **C — Comportamento nuovo**: atteso: suite verde; `pnpm build` produce `public/sw.js` più grande di
  1 KB e `grep -c "pages-rsc" public/sw.js` → 0 (nessun `defaultCache`).
- **D — Sotto la UI**: in `local.db` (in locale seed A si può scrivere), con uno script usa e getta
  che accede come seed A: `POST /api/readings` con il `supplyId` di una fornitura di seed B e la data
  di oggi → atteso 404 e nessuna riga nuova; con la «Luce» di seed A → 201; lo stesso corpo una
  seconda volta → 201 con gli stessi `readingIds` e nessuna riga in più; con la data di domani → 400
  «La lettura non può essere nel futuro.».
- **F — Giro guidato sui telefoni** (al via dell'owner, in **produzione** dopo il merge, perché
  servono HTTPS e il dominio vero):
  1. Android (Chrome): Impostazioni → «Installa l'app» → icona sulla home; aprirla: si apre a tutto
     schermo con il nome «Bollette»?
  2. iPhone (Safari): le istruzioni in Impostazioni; «Aggiungi alla schermata Home»; l'icona e il
     nome giusti?
  3. Su uno dei due, con l'app installata: (a) con la rete aprire «Letture», attivare la modalità
     aereo, salvare un'autolettura del contatore → atteso «Salvata in coda»; togliere la modalità
     aereo → la lettura compare in «Letture»; (b) con la rete aprire «Carica bolletta», attivare la
     modalità aereo, «Scatta foto» di una bolletta digitale aperta sullo schermo del computer
     (D-55), «Carica» → atteso «Salvata in coda»; togliere la modalità aereo → la bolletta compare in
     «Da rivedere» «in coda» con «Estrai (circa X $)». Estrazione reale: prima l'agente dice il costo
     (circa 0,30 $ a bolletta) e solo al suo OK l'owner preme «Estrai» → la revisione si apre.
  4. Pagina offline: con la modalità aereo, toccare una voce della navigazione → atteso il testo di
     `/offline` (D-60: l'app aperta a freddo senza rete mostra la stessa pagina).
  5. Nella sessione di chiusura, dopo il merge della sua PR (un deploy nuovo cambia `sw.js`): aprire
     l'app installata → atteso il toast «Nuova versione disponibile» → «Aggiorna» → la pagina si
     ricarica una volta sola.
  Che cosa NON copre: notifiche (non previste nella v1), sincronizzazione in background su iOS (non
  esiste), apertura dell'app a freddo senza rete con la coda (D-60).
- **G — Ripristino**: l'autolettura di prova di D in `local.db` si elimina dalla UI; la bolletta del
  collaudo F, se l'owner non la vuole, si elimina dalla UI (file compresi); la coda del telefono è
  vuota (nessuna voce in «In attesa di rete» né in «Letture»).

## 8. Messa in esercizio

- Nessuna migrazione; nessuna variabile.
- Ordine (D-41): gate verdi e collaudo locale (A, C, D), commit unico e PR (stato «implementata il
  <data>, branch `feature/09-pwa-offline`» nella riga Stato, nell'indice § 5 e in CLAUDE.md → Latest); merge dall'owner → il
  deploy di produzione pubblica `sw.js`, manifest e icone; nella stessa sessione il giro F1–F4 sui
  due telefoni (misura di chiusura) e G; esito, gotchas e stato «in esercizio» in `SESSION_NOTES.md`,
  che resta (non tracciato).
- La 09 è l'ultima della serie: una breve **sessione di chiusura di soli documenti** (branch
  `docs/v1-chiusura` da `main` aggiornato, prompt in § 11) scrive l'esito del giro F (stato «in
  esercizio» nella riga Stato e nell'indice § 5, CLAUDE.md → Latest «v1 completa», README.md lo
  stato «v1 completa», lezioni in `doc/guide/pwa.md` e AGENTS.md § 11), fa il suo commit e la sua PR;
  dopo il merge, F5 con l'owner. L'esito di F5 resta in `SESSION_NOTES.md` per la prima sessione
  dopo la v1 (se il toast non compare, quella sessione lo scrive in CLAUDE.md § Known Issues).

## 9. Documentazione

Nella sessione della 09:
- **`doc/guide/pwa.md`** (nasce qui, ≤ 250 righe): build con webpack, il service worker e le sue
  regole di cache (perché niente `defaultCache`, `reloadOnOnline: false`, il listener
  `controllerchange` solo dopo «Aggiorna»), la pagina offline, la coda (forma, `userId`, `stage` e
  ripresa, nessuna estrazione dalla coda, ritentativi ed eccezioni di rete, lock, voci `working`,
  inneschi, idempotenza delle autoletture), iOS e Android, i test con `fake-indexeddb`, `locks` e
  `schedule` finti e il progetto `pwa`.
- `AGENTS.md` § 8: stub che rimanda a `doc/guide/pwa.md` (con le regole di cache di § 5); § 7:
  l'eccezione documentata ai colori letterali diventa `src/lib/pwa/brand-colors.ts`; § 11 Gotchas
  nuove con la data.
- `CLAUDE.md`: Latest («09 implementata»); § Key Features (PWA e coda); § Not yet present
  aggiornato: restano notifiche push, dashboard offline, Web Share Target e badge; si aggiungono
  «modifiche offline di bollette già salvate», «sincronizzazione in background su iOS (non esiste)»
  e «apertura dell'app a freddo senza rete (la coda vale per la pagina già aperta)» (D-60).
- `SETUP.md`: sezione *Install on your phone*.
- `README.md`: § What it does (installabile, offline).
- `WORKFLOW.md` § 3: la riga `pnpm icons` è vera; il progetto `pwa` nella riga dei browser test.

Nella sessione di chiusura (§ 8): stato «in esercizio» della 09 (riga Stato e indice § 5),
CLAUDE.md → Latest «v1 completa», README.md lo stato «v1 completa», lezioni del giro F.

## 10. Fuori ambito, dichiarato

- Notifiche push (scadenze delle bollette, estrazione pronta) → CLAUDE.md § Not yet present.
- Modifiche offline di bollette già salvate, dashboard offline con dati in cache → CLAUDE.md § Not
  yet present (scelta: nessun dato dell'utente nelle cache).
- Apertura dell'app a freddo senza rete: mostra `/offline`, la coda vale per la pagina già aperta
  (D-60) → CLAUDE.md § Not yet present.
- Badge dell'app e Web Share Target (aprire un PDF «con Segnabollette» dalla mail) → CLAUDE.md § Not
  yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **M**.

```
Ciao, in questa sessione implemento la spec doc/v1/09-pwa-fotocamera-e-coda-offline.md.

Prima di tutto: scrivi l'esito del collaudo in produzione della spec precedente (08) da
SESSION_NOTES.md (stato «in esercizio» nella sua riga Stato e nell'indice § 5, CLAUDE.md → Latest,
doc/guide e AGENTS.md se ci sono lezioni), su `main` aggiornato dopo il merge della 08
(`git switch main`, `git pull`; `git branch --show-current` deve dire main), poi crea il branch
feature/09-pwa-offline. Poi svuota SESSION_NOTES.md e usalo per questa sessione.

Contesto, prima di toccare qualsiasi altro file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), DESIGN.md, doc/guide/app.md, doc/guide/estrazione.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 09 INTERA
- Controlla con un grep che i contratti C-3, C-4, C-5, C-7, C-8, C-9, C-12, C-13, C-16, C-17, C-18,
  C-23, C-24 esistano con i nomi e le firme dell'indice (in particolare: le route di T-22 con la
  risposta doppione `{ duplicateOf, duplicateStatus, documents? }`, uploadDocumentFile,
  createSelfReadings(db, userId, rawInput, { today }), AppShell con reviewCount, SelfReadingForm
  che invia un SelfReadingInput, delete-account.tsx, signUpTestUser, il progetto Vitest `unit`)

Implementa la spec 09 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima; A, C, D in locale prima
del commit), § 9 la documentazione. Non decidere nulla che la spec ha già deciso; se trovi un punto
che la spec non copre, fermati e chiedimelo con AskUserQuestion. Le etichette della serie non
entrano nel codice.

Alla fine, in quest'ordine: gate verdi; riassumi il diff; scrivi lo stato «implementata il <data>,
branch `feature/09-pwa-offline`» nella riga «Stato» della spec e in § 5 dell'indice, aggiorna CLAUDE.md → Latest; chiedimi
l'OK per il commit (uno solo) e apri la PR. Dopo il mio merge e il deploy di produzione facciamo
insieme il giro F1–F4 di § 7 sui telefoni e G (l'estrazione reale la avvio io con «Estrai» solo
dopo che mi hai detto il costo, circa 0,30 $, e ti ho dato l'OK). Esito, gotchas e stato «in
esercizio» vanno in SESSION_NOTES.md, che resta (non tracciato) per la sessione di chiusura.
```

Sessione di chiusura (soli documenti, dopo il giro F). Modello: Claude Opus 5.5, effort medium.
Taglia: **S**.

```
Ciao, in questa sessione chiudo la serie v1: è la sessione di soli documenti di
doc/v1/09-pwa-fotocamera-e-coda-offline.md § 8.

Prima di tutto: scrivi l'esito del collaudo in produzione della spec 09 da SESSION_NOTES.md (stato
«in esercizio» nella sua riga Stato e nell'indice § 5, CLAUDE.md → Latest «v1 completa», README.md
lo stato «v1 completa», doc/guide/pwa.md e AGENTS.md § 11 se ci sono lezioni), su `main` aggiornato
(`git switch main`, `git pull`; `git branch --show-current` deve dire main), poi crea il branch
docs/v1-chiusura. Poi svuota SESSION_NOTES.md e usalo per questa sessione.

Leggi WORKFLOW.md e la spec 09 § 7 (F5) e § 8. Nessun codice. Controlla con
`grep -n "Stato" doc/v1/*.md` che stato e indice dicano la stessa cosa, e la misura dei caratteri di
CLAUDE.md (indice § 7 regola 3).

Alla fine: riassumi il diff, chiedimi l'OK per il commit (uno solo) e apri la PR. Dopo il mio merge
facciamo F5 di § 7 (il toast «Nuova versione disponibile» dell'app installata); il suo esito va in
SESSION_NOTES.md, che resta per la prima sessione dopo la v1.
```
