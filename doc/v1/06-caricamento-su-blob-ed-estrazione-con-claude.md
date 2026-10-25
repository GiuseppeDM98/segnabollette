# 06 — Caricamento su Blob ed estrazione con Claude

> **Stato**: scritta 2026-10-24; riletta in modo adversariale il 2026-10-24: 40 rilievi, 5 decisioni
> (D-41, D-42, D-55, D-56, D-59). Pronta per l'implementazione.
> **Branch**: `feature/06-extraction` da `main` aggiornato dopo il merge della 05. **Dipende da**: 05
> (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-2, D-6, D-7, D-9, D-15, D-16, D-17, D-19,
> D-20, D-21, D-40, D-41, D-42, D-55, D-56, D-59; scelte T-2, T-6, T-11, T-17…T-23, T-33, T-34;
> contratti C-1 (variabili nuove), C-2 (`documents`, `extractions`), C-5 (codici nuovi), C-8
> (`formatUsd`), C-13 (`documentPathnames` pieni), C-16, C-17, C-18, C-24 (`reviewCount`) — li crea
> o li estende; usa C-3, C-4, C-6…C-14, C-21, C-22, C-23.

## 1. Il problema oggi (prove)

1. Dopo la 05 l'owner inserisce le bollette solo a mano, voce per voce: le bollette vere hanno da 10
   a 70 voci (indice § 2.1) e una bolletta del gas contiene il mese precedente rifatturato.
2. Il file della bolletta va **conservato** e riaperto dalla scheda (D-6), su uno store Blob
   **privato** (il PDF contiene nome, indirizzo, codice fiscale): lettura solo con
   `get(pathname, { access: 'private' })` da una route che controlla l'utente
   (https://vercel.com/docs/vercel-blob/private-storage, letta 2026-10-24).
3. Le function di Vercel rifiutano body oltre **4,5 MB** e le Server Action oltre 1 MB: il file va
   **dal browser direttamente a Blob** con `upload()` + `handleUpload()`; `handleUpload` richiede
   `BLOB_READ_WRITE_TOKEN`; `onUploadCompleted` **non arriva su localhost**
   (https://vercel.com/docs/vercel-blob/client-upload, letta 2026-10-24). segnaprezzi accettava
   5 MB attraverso la function (sopra il limite, mai notato: rapporto dell'analisi, § 5).
4. Anthropic (indice § 2.2): PDF come blocco `document` base64 (32 MB a richiesta, 600 pagine, ogni
   pagina testo + immagine, 1.500–3.000 token di testo per pagina, niente PDF cifrati); foto JPEG
   fino a 2.576 px di lato lungo, 4.784 token e 10 MB in base64 per immagine (il base64 pesa 4/3 del
   file); output strutturato senza vincoli numerici e con al massimo **16 parametri a tipo
   unione**; `temperature` → 400; con `max_tokens` oltre ~21.333 l'SDK pretende lo streaming. Nei tipi pubblicati dell'SDK `@anthropic-ai/sdk@1.3.0` (letti il
   2026-10-24): `client.beta.messages.stream(params, options)` → `finalMessage()` restituisce un
   `ParsedBetaMessage` con `content`, `parsed_output`, `stop_reason`, `stop_details:
   BetaRefusalStopDetails | null`, `usage.input_tokens`/`output_tokens`, `model`; `fallbacks?:
   Array<…> | 'default'`; `betaZodOutputFormat` in `@anthropic-ai/sdk/helpers/beta/zod` restituisce
   il formato JSON con una funzione `parse`. Nel codice dell'SDK (letto nella 0.120 di segnaprezzi,
   stesso helper) la risposta si analizza **solo se il formato passato ha `parse`**, e allora
   l'analisi avviene all'evento `message_stop`, senza guardare `stop_reason`: un JSON troncato da
   `max_tokens` fa rifiutare `finalMessage()` con un `AnthropicError` «Failed to parse structured
   output» e i token si perdono; passando il formato **senza** `parse`, `parsed_output` resta `null`
   e non si lancia nulla. Il `timeout` delle opzioni copre solo la `fetch` fino all'arrivo delle
   intestazioni: lo stream che continua dopo non si interrompe; serve un `signal` (`AbortSignal`),
   e un'interruzione dal `signal` arriva come `APIUserAbortError` (sottoclasse di `APIError`). Classi
   di errore `APIError`, `APIUserAbortError`, `APIConnectionError`, `APIConnectionTimeoutError`,
   `RateLimitError`, `InternalServerError`, `AnthropicError`, esportate anche come proprietà
   statiche di `Anthropic`.
5. Le bollette campione (indice § 2.1) fissano che cosa il prompt deve saper fare: scegliere il
   dettaglio e **non** sommare anche lo «scontrino» riassuntivo; dare a ogni voce il **periodo del
   suo blocco** (i ricalcoli); leggere le quote annuali pro rata («31/365»); riconoscere le voci
   fuori dal totale (canone TV); leggere le letture F1/F2/F3 e in mc; non fidarsi di un prezzo
   unitario 0,000000 stampato accanto a un importo; ricavare il netto quando le voci sono «IVA
   incl.» (bolletta telefonica).
6. Le foreign key non sono applicate su Turso remoto (T-34): ogni tabella nuova entra in
   `deleteAllUserData` e nelle cancellazioni di bollette, forniture e case.

## 2. Obiettivo e criteri di accettazione

Caricare una bolletta (un PDF o fino a 10 foto) su Blob privato, estrarla con Claude Opus 5.5,
rivederla e confermarla con lo stesso modulo della 03; riaprire il file dalla scheda; allegare un
file a una bolletta inserita a mano; registrare token e costo; cancellare i file con le bollette e
con l'account.

| # | Criterio | Prova |
|---|---|---|
| A1 | `/bollette/carica`: scelta della fornitura (facoltativa: «Riconosci dalla bolletta»), un PDF ≤ 10 MB o fino a 10 foto (pulsanti «Scegli PDF o foto» e «Scatta foto» con `capture="environment"`); le foto si convertono in JPEG ≤ 2.576 px e compaiono come miniature numerate con «Su», «Giù», «Rimuovi»; il PDF come riga con nome, dimensione e «Rimuovi»; poi caricamento e verifica dei file, la stima e il pulsante «Estrai (circa X $)»: la chiamata a Claude parte **solo al clic** (D-42), poi la revisione. Senza case la pagina mostra lo stato vuoto della 03. | E2E `estrazione.spec.ts` con il fake (prima del clic l'estrazione è `queued` con `started_at` nullo). |
| A2 | Il file va dal browser a Blob privato (mai attraverso una function); il server verifica esistenza, dimensione (PDF ≤ 10 MB, JPEG ≤ 5 MB, ≤ 20 MB per estrazione), tipo (magic bytes), SHA-256, cifratura e pagine (≤ 40) prima di usarlo. | Unit `verify-document.test.ts`; integrazione `extractions.test.ts`. |
| A3 | Un file già in una bolletta → `DUPLICATE_DOCUMENT` con il link alla bolletta e il suo periodo; un file di un'estrazione aperta → si riprende quella estrazione secondo il suo stato (revisione, stima ed «Estrai», «già in lavorazione», messaggio dell'errore, ripresa del caricamento interrotto, D-59), senza nuova chiamata. | Integrazione + E2E. |
| A4 | L'estrazione usa esattamente la chiamata di § 4.6 (modello, `fallbacks`, effort, `max_tokens`, formato senza `parse`, `signal` dalla scadenza); rifiuto, troncamento, output non valido, errore di rete o del servizio e scadenza diventano `failed` con un codice e un messaggio italiano, con i token quando la risposta li porta; nessun retry automatico. | Unit `anthropic-extractor.test.ts` con un client finto. |
| A5 | Ogni estrazione registra modello, token e costo in micro-dollari, sommati su tutti i tentativi («Riprova»); Impostazioni mostra la spesa del mese di calendario. | Integrazione; E2E. |
| A6 | `/bollette/revisione/[id]`: da 1024 px il documento (PDF in iframe o foto) accanto a `BillForm` precompilato da `toBillInput`; sotto i 1024 px il pulsante «Apri il PDF» (D-56) e le foto in sequenza; fornitura riconosciuta dall'identificativo o da scegliere fra tutte le forniture attive o da creare (con il tipo); avvisi aritmetici e di sovrapposizione; «Conferma» salva con `confirmBill` (`source: 'extraction'`) una volta sola e lega i file alla bolletta; «Scarta» cancella i file (riga prima, file dopo) e tiene la riga dell'estrazione per il costo. | E2E; integrazione. |
| A7 | `/bollette/da-rivedere` elenca le estrazioni in coda, in corso, estratte e fallite, con «Rivedi», «Estrai (circa X $)» (in coda), «Riprova» (fallite e in corso da più di 6 minuti), «Scarta» (non sulle in corso recenti); la voce «Bollette» di `NavBar` e `SideBar` mostra il numero delle estratte da rivedere. | E2E. |
| A8 | Scheda della bolletta, quando Blob è configurato: sezione «Documenti» con «Apri» (nuova scheda, `/api/documents/[id]`) e «Allega il file» (stesso caricamento, nessuna estrazione). | E2E. |
| A9 | Cancellare una bolletta, una fornitura o una casa cancella i file su Blob; «Elimina account» cancella tutti i file dell'utente. | Integrazione con il fake Blob; collaudo § 7 sullo store di sviluppo. |
| A10 | Isolamento: un utente non apre `/api/documents/<id altrui>` (404), non esegue, non rivede, non conferma, non scarta un'estrazione altrui, non ottiene un token di upload per un documento altrui, non allega file a una bolletta altrui; elenchi, conteggi e spesa non contano le righe altrui. | Integrazione `extractions-isolation.test.ts`; E2E `isolamento.spec.ts` esteso. |
| A11 | Le tre bollette campione dell'owner (luce, gas, telefono) estratte davvero nel collaudo, con il costo detto prima, danno totali uguali a quelli stampati e le voci di ricalcolo del gas nel mese precedente. | Collaudo § 7 C (con l'OK dell'owner). |

## 3. Decisioni

- **D-2** (chiave personale), **D-6** (file conservato, niente codici), **D-7** (conferma),
  **D-9** (fotocamera), **D-15** (Opus 5.5), **D-16** (fallback lato server), **D-17** (nessun
  tetto, costo registrato), **D-19** (allegato senza estrazione), **D-20** (storico ignorato),
  **D-21** (acqua non provata su una bolletta vera), **D-40** (file cancellati con l'account).
- **D-41** (commit e PR prima del merge, collaudo in produzione dopo il merge, esito nel commit
  di chiusura su `docs/06-in-esercizio`: § 8 e § 11), **D-42** (l'estrazione parte solo al clic su «Estrai (circa X $)»),
  **D-55** (in locale le foto si caricano dal browser del computer; «Scatta foto» si prova in
  produzione), **D-56** (revisione sul telefono con «Apri il PDF»), **D-59** (ripresa dei
  caricamenti interrotti e abbandono delle estrazioni senza file).
- **T-2** (store di sviluppo), **T-6** (script), **T-11** (SHA-256), **T-17** (container e fake),
  **T-18** (chiamata: formato senza `parse`, `signal` dalla scadenza), **T-19** (schema senza
  nullable), **T-20** (foto e PDF), **T-21** (upload dal client), **T-22** (route handler),
  **T-23** (stima), **T-33** (identificativo), **T-34**.
- Adottate qui, ribaltabili:
  (a) `ANTHROPIC_API_KEY` e `BLOB_READ_WRITE_TOKEN` **facoltative** nello schema dell'ambiente: senza
  la chiave l'app funziona e il caricamento risponde `EXTRACTION_UNAVAILABLE` («Estrazione non
  configurata su questa installazione»); senza il token Blob il caricamento, la sezione «Documenti»
  e «Allega il file» sono nascosti e le cancellazioni non toccano Blob;
  (b) la fornitura si riconosce **solo** dall'identificativo normalizzato o dalla scelta fatta prima
  del caricamento; mai «l'unica luce che c'è»;
  (c) se il documento contiene più forniture (bolletta «dual»), si estrae solo la prima e lo si
  dice negli avvisi (CLAUDE.md § Not yet present per il resto);
  (d) **niente prompt caching** (risparmio di circa 1,5 cent a bolletta; CLAUDE.md § Not yet
  present);
  (e) il costo con un fallback si calcola con il prezzo del modello di `response.model` per tutti
  i token; un modello assente dal listino si prezza come `claude-opus-5` (il più caro dei
  fallback noti) e lo si scrive nel log;
  (f) un'estrazione `running` da più di 6 minuti si può rieseguire e scartare (la function è
  morta); il risultato di un'esecuzione che finisce dopo uno scarto o dopo una ripresa si butta, il
  suo costo si somma;
  (g) le estrazioni scartate e confermate restano come righe (per la spesa del mese) senza
  risultato (`resultJson` nullo: i dati confermati vivono nella bolletta); le scartate anche senza
  file;
  (h) (D-42) dopo la verifica dei file la pagina mostra la stima e il pulsante «Estrai (circa X $)»;
  `POST /api/extractions/[id]/run` parte solo al clic; senza clic l'estrazione resta `queued` in
  «Da rivedere» con lo stesso pulsante «Estrai (circa X $)»;
  (i) `documents:prune` cancella anche le estrazioni rimaste `uploading` e i documenti allegati mai
  caricati (`uploadedAt` nullo) da più di 24 ore, con i loro file; un'estrazione `uploading` che un
  nuovo caricamento non riprende si cancella subito (D-59).

## 4. La soluzione

### 4.1 Dipendenze e ambiente

```bash
pnpm add @vercel/blob@2.8.2 @anthropic-ai/sdk@1.3.0 unpdf@1.9.1
```

`EnvSchema` (C-1) aggiunge:

```ts
ANTHROPIC_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
BLOB_READ_WRITE_TOKEN: z.string().optional().transform((v) => (v ? v : undefined)),
E2E_BLOB_DIR: z.string().default('.e2e-blob'),
```

`.env.example` aggiunge, con i commenti: `ANTHROPIC_API_KEY=""` («a key of your own Console
organization; extraction is disabled without it») e `BLOB_READ_WRITE_TOKEN=""` («the development
store's token: `vercel env pull .env.vercel-dev --environment=development`, copy only this line here,
then delete .env.vercel-dev — pulling into .env.local would overwrite the whole file»).

`playwright.config.ts` (01): `serverEnv` aggiunge `NEXT_PUBLIC_E2E_FAKE_SERVICES: '1'`. Il
`webServer` la passa a `pnpm build`, che la scrive nel bundle del client: `upload-client.ts` la legge
come `process.env.NEXT_PUBLIC_E2E_FAKE_SERVICES` letterale (l'eccezione `NEXT_PUBLIC_*` di AGENTS.md
§ 2.3) per scegliere il caricamento finto.

### 4.2 Schema — tabelle `documents` ed `extractions` (C-2)

```ts
export const extractions = sqliteTable('extractions', {
  id: id(),
  userId: userId(),
  status: text('status').$type<ExtractionStatus>().notNull(),
  supplyId: text('supply_id').references(() => supplies.id),
  batchId: text('batch_id'),
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costMicroUsd: integer('cost_micro_usd'),
  /** Runs started (the first one and every «Riprova»); tokens and cost are summed across them. */
  attempts: integer('attempts').notNull().default(0),
  resultJson: text('result_json'),
  errorCode: text('error_code').$type<ExtractionErrorCode>(),
  errorMessage: text('error_message'),
  billId: text('bill_id').references(() => bills.id),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('extractions_user_status_idx').on(t.userId, t.status),
  index('extractions_batch_idx').on(t.batchId),
]);

export const documents = sqliteTable('documents', {
  id: id(),
  userId: userId(),
  extractionId: text('extraction_id').references(() => extractions.id),
  billId: text('bill_id').references(() => bills.id),
  pathname: text('pathname').notNull().unique(),
  contentType: text('content_type').$type<DocumentContentType>().notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  pageCount: integer('page_count'),
  sha256: text('sha256').notNull(),
  position: integer('position').notNull(),
  uploadedAt: integer('uploaded_at'),
  createdAt: createdAt(),
}, (t) => [
  index('documents_user_id_idx').on(t.userId),
  index('documents_bill_id_idx').on(t.billId),
  index('documents_extraction_id_idx').on(t.extractionId),
  uniqueIndex('documents_user_sha256_uq').on(t.userId, t.sha256),
]);
```

Tipi in `src/lib/domain/types.ts`:

```ts
export type ExtractionStatus = 'uploading' | 'queued' | 'running' | 'extracted' | 'failed' | 'confirmed' | 'discarded';
export type ExtractionErrorCode = 'refusal' | 'truncated' | 'invalid_output' | 'not_a_bill' | 'unavailable' | 'api_error' | 'timeout' | 'document_invalid';
export type DocumentContentType = 'application/pdf' | 'image/jpeg';
```

Migrazione `drizzle/0002_*.sql` (`extractions` prima di `documents`).

Cancellazioni (T-34), che cambiano i servizi della 02 senza cambiarne la firma:
- `deleteBill`, `deleteSupply`, `deleteHouse`: nel batch, **prima** delle bollette,
  `UPDATE extractions SET bill_id = NULL` per quelle bollette e `DELETE FROM documents WHERE bill_id
  IN (…)`; per forniture e case anche `UPDATE extractions SET supply_id = NULL`; restituiscono in
  `documentPathnames` i pathname dei documenti cancellati (letti prima del batch).
- Le azioni che chiamano quei servizi, **dopo** il batch, chiamano
  `getBlobStore().deleteDocuments(documentPathnames)` solo se `documentPathnames` non è vuoto e
  `isBlobConfigured()` è vero, dentro un `try`/`catch` che scrive l'errore nel log e non annulla la
  cancellazione (riga prima, file dopo: un file orfano si recupera con `documents:prune`, una riga
  senza file no — segnaprezzi § 4.59).
- `deleteAllUserData`: `documents` ed `extractions` (in quest'ordine) prima di `meter_readings`.
- `src/lib/auth/auth.ts` passa `afterUserDeleted: async (userId) => { if (isBlobConfigured()) await
  getBlobStore().deleteUserDocuments(userId); }` (l'`afterDelete` della 01 ha già il suo
  `try`/`catch`: un errore di Blob finisce nel log e l'account resta cancellato; i file rimasti si
  recuperano con `documents:prune`).

### 4.3 Errori (C-5)

`DomainErrorCode` aggiunge, con i messaggi:

```ts
DUPLICATE_DOCUMENT: 'Questo file è già stato caricato.',
DOCUMENT_INVALID: 'Il file non è valido.',
EXTRACTION_UNAVAILABLE: 'L\'estrazione non è disponibile in questo momento.',
EXTRACTION_BUSY: 'Questa bolletta è già in lavorazione.',
```

`src/lib/http/error-status.ts`: `export const ERROR_STATUS: Record<DomainErrorCode, number>` =
`UNAUTHORIZED 401, NOT_FOUND 404, VALIDATION 400, OVERLAP_DECISION_REQUIRED 409, DUPLICATE_IDENTIFIER
409, DUPLICATE_DOCUMENT 409, DOCUMENT_INVALID 422, EXTRACTION_UNAVAILABLE 503, EXTRACTION_BUSY 409`
e `toErrorResponse(error)` (DomainError → JSON `{ code, message, details }` con
lo status; altro → 500 senza dettagli, con il log). Il `Record` esaustivo fa fallire il typecheck
quando un codice nuovo non ha uno status. Un'estrazione fallita non è un errore HTTP:
`runExtraction` restituisce la riga `failed` (con codice e messaggio) e la route risponde 200.

### 4.4 Blob — `src/lib/blob/` (C-16)

```ts
// src/lib/blob/types.ts
export interface BlobStore {
  /** The file's bytes, or null when the pathname does not exist. */
  readDocument(pathname: string): Promise<Uint8Array | null>;
  deleteDocuments(pathnames: readonly string[]): Promise<void>;
  /** Every file under users/{userId}/ — the account-deletion cleanup. */
  deleteUserDocuments(userId: string): Promise<void>;
  listPathnames(prefix: string): Promise<string[]>;
}

/** A PDF as stored. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** One JPEG: 6.7 MB once base64-encoded, under the API's 10 MB per image. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** All the files of one extraction: 26.7 MB once base64-encoded, under the API's 32 MB per request. */
export const MAX_EXTRACTION_BYTES = 20 * 1024 * 1024;

export function maxBytesFor(contentType: DocumentContentType): number {
  return contentType === 'application/pdf' ? MAX_DOCUMENT_BYTES : MAX_PHOTO_BYTES;
}

export function documentPathname(userId: string, documentId: string, contentType: DocumentContentType): string {
  return `users/${userId}/documents/${documentId}.${contentType === 'application/pdf' ? 'pdf' : 'jpg'}`;
}
```

`src/lib/blob/vercel-blob-store.ts` — `createVercelBlobStore(token: string): BlobStore`, l'unico file
che importa `@vercel/blob` lato server: `readDocument` con
`get(pathname, { access: 'private', useCache: false, token })` (`null` → `null`, altrimenti legge
`result.stream` fino in fondo in un `Uint8Array`); `deleteDocuments` con `del([...pathnames], { token })`
(lista vuota → niente chiamata); `listPathnames` con `list({ prefix, cursor, limit: 1000, token })` in
un ciclo sul `cursor`; `deleteUserDocuments` = `listPathnames('users/<id>/')` + `deleteDocuments` a
blocchi di 500.

`src/lib/blob/disk-blob-store.ts` — `createDiskBlobStore(dir: string): BlobStore` per Playwright:
i file stanno in `<dir>/<pathname>`; stesse semantiche.

`src/lib/blob/upload-client.ts` (client, C-16):

```ts
'use client';
import { upload } from '@vercel/blob/client';

/** Send one file straight from the browser to the private store; Playwright builds use a local fake. */
export async function uploadDocumentFile(args: { file: Blob; pathname: string; documentId: string; contentType: string }): Promise<void> {
  // Next inlines NEXT_PUBLIC_* variables at build time: only the Playwright build has it.
  if (process.env.NEXT_PUBLIC_E2E_FAKE_SERVICES === '1') {
    const query = new URLSearchParams({ documentId: args.documentId, pathname: args.pathname });
    const response = await fetch(`/api/e2e/blob?${query.toString()}`, { method: 'PUT', body: args.file });
    if (!response.ok) throw new Error(`fake upload failed: ${response.status}`);
    return;
  }
  await upload(args.pathname, args.file, {
    access: 'private',
    handleUploadUrl: '/api/documents/upload',
    clientPayload: args.documentId,
    contentType: args.contentType,
  });
}
```

`src/app/api/e2e/blob/route.ts`: `PUT ?documentId=<id>&pathname=<pathname>` che risponde 404 se
`!env.E2E_FAKE_SERVICES`, altrimenti `requireUser()` → `authorizeDocumentUpload(getDb(), user.id,
documentId, pathname)` (§ 4.8: documento dell'utente in attesa con quel pathname, `NOT_FOUND` → 404
altrimenti) → scrive i byte del corpo in `<E2E_BLOB_DIR>/<pathname>` (sovrascrivendo, come
`allowOverwrite`) → 204.

`src/app/api/documents/upload/route.ts`:

```ts
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      // The session is checked here, not first: Vercel's upload-completed request reaches this
      // route without a session and does nothing.
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await requireUser();
        const documentId = clientPayload ?? '';
        const { contentType } = await authorizeDocumentUpload(getDb(), user.id, documentId, pathname);
        return {
          allowedContentTypes: [contentType],
          maximumSizeInBytes: maxBytesFor(contentType),
          addRandomSuffix: false,
          // A resumed upload writes the same pathname again.
          allowOverwrite: true,
          tokenPayload: documentId,
        };
      },
      // Never relied upon: it does not fire on localhost, and the server verifies every file itself
      // before using it.
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

`src/app/api/documents/[id]/route.ts` (`GET`): `requireUser()` → `readDocumentFile(getDb(), user.id,
id, { blob: getBlobStore() })` (§ 4.8: `NOT_FOUND` se il documento non è dell'utente, se ha
`uploadedAt` nullo o se il file manca → 404 con `toErrorResponse`) → `new Response(bytes, { headers:
{ 'Content-Type': contentType, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store',
'X-Content-Type-Options': 'nosniff' } })`. Route e pagine non importano repository: passano dai
servizi di § 4.8.

### 4.5 Container (C-18)

```ts
export function getBlobStore(): BlobStore {
  if (env.E2E_FAKE_SERVICES) return createDiskBlobStore(env.E2E_BLOB_DIR);
  if (!env.BLOB_READ_WRITE_TOKEN) throw new DomainError('EXTRACTION_UNAVAILABLE', 'Archivio dei file non configurato su questa installazione.');
  return createVercelBlobStore(env.BLOB_READ_WRITE_TOKEN);
}

export function getBillExtractor(): BillExtractor {
  if (env.E2E_FAKE_SERVICES) return createFakeExtractor('tests/fixtures/extractions');
  if (!env.ANTHROPIC_API_KEY) throw new DomainError('EXTRACTION_UNAVAILABLE', 'Estrazione non configurata su questa installazione.');
  return createAnthropicExtractor({ apiKey: env.ANTHROPIC_API_KEY, clock: () => Date.now() });
}

export function isExtractionConfigured(): boolean {
  return env.E2E_FAKE_SERVICES || (Boolean(env.ANTHROPIC_API_KEY) && Boolean(env.BLOB_READ_WRITE_TOKEN));
}

/** Files can be stored and read without the Anthropic key: attachments need only this. */
export function isBlobConfigured(): boolean {
  return env.E2E_FAKE_SERVICES || Boolean(env.BLOB_READ_WRITE_TOKEN);
}
```

Chi chiama `getBlobStore()` fuori dal caricamento (cancellazioni, account) controlla prima
`isBlobConfigured()`: senza token Blob non c'è nessun file da cancellare.

### 4.6 Estrazione — `src/lib/extraction/` (C-17)

`schema.ts`:

```ts
/**
 * The structured output asked of Claude. No field is nullable: structured outputs allow at most
 * 16 union-typed parameters across a schema, so absence is a sentinel ("", 0, "none", -1) that
 * toBillInput turns into null.
 */
import { z } from 'zod';
import { LINE_CATEGORIES, LINE_COMPONENTS, QUANTITY_UNITS, READING_REGISTERS, SUPPLY_KINDS } from '@/lib/domain/types';

export const ExtractionLineSchema = z.object({
  description: z.string(),
  category: z.enum(LINE_CATEGORIES),
  component: z.enum(LINE_COMPONENTS),
  periodStart: z.string(),
  periodEnd: z.string(),
  quantity: z.number(),
  quantityUnit: z.enum([...QUANTITY_UNITS, 'none'] as const),
  unitPriceMicros: z.number().int(),
  amountCents: z.number().int(),
  band: z.enum(['F1', 'F2', 'F3', 'F23', 'single', 'none']),
  isRecalculation: z.boolean(),
  isEstimated: z.boolean(),
  vatRatePercent: z.number(),
});

export const ExtractionReadingSchema = z.object({
  date: z.string(),
  register: z.enum(READING_REGISTERS),
  value: z.number(),
  kind: z.enum(['actual', 'estimated']),
});

export const ExtractionSchema = z.object({
  isBill: z.boolean(),
  supplyKind: z.enum([...SUPPLY_KINDS, 'other'] as const),
  supplierName: z.string(),
  offerName: z.string(),
  supplyIdentifier: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  totalCents: z.number().int(),
  amountDueCents: z.number().int(),
  conversionFactor: z.number(),
  calorificValueGj: z.number(),
  consumptionEstimated: z.boolean(),
  lines: z.array(ExtractionLineSchema),
  readings: z.array(ExtractionReadingSchema),
  warnings: z.array(z.string()),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
```

`prompt.ts` — `EXTRACTION_SYSTEM_PROMPT` (testo esatto, in inglese con il lessico italiano delle
bollette; checklist in testa: «WARNING: keep the category list in sync with LINE_CATEGORIES in
src/lib/domain/types.ts»; e, nel verso opposto, `src/lib/extraction/prompt.ts` entra nell'elenco
del commento `WARNING` in testa a `src/lib/domain/types.ts`):

```text
You extract data from Italian utility bills (bollette) for a personal tracker. You receive one bill
as a PDF or as photos of its pages, in page order. Return only the JSON the schema describes. Never
copy personal data — names, addresses, tax codes, IBANs, invoice numbers, customer codes, phone
numbers, emails: the schema has no place for them.

HEADER
- isBill: false when the document is not a utility bill; then leave every other field empty
  ("" / 0 / false / empty lists).
- supplyKind: electricity (luce, energia elettrica), gas (gas naturale), water (acqua, servizio
  idrico), telecom (internet, telefono, fibra, linea fissa o mobile), waste (TARI, rifiuti), other.
- supplierName: the seller's brand as printed in the header. offerName: the commercial offer name,
  or "".
- supplyIdentifier: the POD for electricity (IT…E…), the PDR for gas (14 digits), the "codice
  utenza" for water; always "" for telecom and waste, and "" when not printed.
- periodStart, periodEnd: the billing period ("periodo di riferimento", "periodo di fatturazione"),
  YYYY-MM-DD. issueDate ("data emissione", "data fattura") and dueDate ("scadenza", "entro il"),
  YYYY-MM-DD or "". For waste (TARI): periodStart and periodEnd are the year or period the tax
  covers, totalCents is the whole tax and dueDate is the first instalment's due date.
- totalCents: the bill total for the supply, VAT included ("Totale bolletta", "Totale fattura"), in
  integer euro cents (100,40 € → 10040). amountDueCents: the amount to pay ("Totale da pagare");
  equal to totalCents when only one total is printed.
- conversionFactor: gas only, the "coefficiente C" (1,0172510000 → 1.017251); otherwise 0.
- calorificValueGj: gas only, the "potere calorifico superiore" in GJ/Smc; when printed in MJ/Smc
  divide by 1000 (38,81 → 0.03881); otherwise 0.
- consumptionEstimated: true when the billed consumption is estimated ("stimato", "acconto").

LINES
Use the most detailed breakdown in the document — usually the pages titled "Elementi di
dettaglio", "Dettaglio importi", "Bolletta di dettaglio". Never add the summary of the first pages
as well ("scontrino dell'energia", "quota per consumi", "di cui spesa per la rete…"): the same money
would count twice. Only when the document has no detail, use the summary and add a warning.
One line per printed line that has an amount, zero and negative amounts included:
- description: as printed.
- category, by the section the line is printed in:
  commodity — the price of the energy, gas or water itself: "Energia", "Energia F1", "Prezzo
    energia", "Gas", "Gas naturale", "Materia prima", the variable aqueduct share ("Acquedotto",
    "quota variabile", per scaglione).
  sale — every other line of the selling section ("spesa per la materia energia/gas naturale",
    "spesa per la vendita"): commercializzazione, PCV, dispacciamento (CdispD, DISPbt), PPE,
    perdite, PCS, CCR, QVD, sbilanciamento; for water the fixed aqueduct share ("quota fissa").
  network — "spesa per il trasporto e la gestione del contatore": trasporto, distribuzione,
    misura, UC3, UC6, QTV, QTt, RS, COT, DIS, MIS, ST, VR and any line printed in that section;
    for water "fognatura" and "depurazione".
  system — "spesa per oneri di sistema": ASOS, ARIM, RE, UG2, UG3, CE and any line printed in that
    section; for water the components UI1, UI2, UI3, UI4.
  excise — accise, imposta erariale, addizionale regionale, imposta di consumo.
  vat — one line per VAT rate with the VAT amount ("IVA 10%": the tax, not the taxable base).
  other — bonus sociale, interessi di mora, arrotondamenti, sconti printed outside a section, spese
    di spedizione, deposito cauzionale.
  feed_in — energy fed into the grid valued as a credit ("energia immessa", "ritiro dedicato",
    "scambio sul posto").
  outside — amounts included in the amount due but not in the bill total: "canone di abbonamento
    alla televisione", previous balances, credit carried over.
  waste (TARI) — the tax lines ("quota fissa", "quota variabile") are sale with component fixed;
    the provincial tribute ("TEFA", "tributo provinciale") is excise with component lump; the
    instalments ("rata", "F24", "scadenza rata") are never lines.
- component: variable for prices per kWh, Smc or m3; fixed for prices per day, month or year;
  power for prices per kW; lump for everything else (VAT, taxes without a unit price, one-offs).
- periodStart, periodEnd: the period of the detail block the line is printed in ("Periodo di
  riferimento: dal … al …"), YYYY-MM-DD; "" when it is the bill's own period.
- quantity, quantityUnit: the printed quantity and unit — kWh, Smc, m3, kW, day, month, year, unit.
  A pro-rata "31/365" with a price per year is quantity 0.0849315 in year. No printed quantity: 0
  and none. Negative quantities stay negative.
- unitPriceMicros: the printed unit price in integer millionths of a euro (0,099000 €/kWh → 99000;
  40,26 €/anno → 40260000); 0 when not printed. A printed unit price can be wrong (0,000000 next to
  a non-zero amount): copy it anyway — the amount is what counts.
- amountCents: the printed amount net of VAT, integer cents, with its sign. When line amounts are
  printed VAT included ("IVA incl.", common on telephone bills), compute each line's net amount as
  amount ÷ (1 + rate) rounded to the cent, add one vat line per rate with the VAT of the VAT
  summary, and add the warning "Importi stampati IVA inclusa: netto ricavato dal riepilogo IVA".
- band: F1, F2, F3 or F23 for a time-band line; single for a single-rate price; none otherwise.
- isRecalculation: true for every line marked "ricalcolo", "voce di ricalcolo", "conguaglio",
  "storno", and for every line of a detail block whose period ends before the bill's own period.
- isEstimated: true when the line's quantity is estimated.
- vatRatePercent: the VAT rate printed for the line (10, 22); -1 when not printed.

READINGS
Every meter reading of the readings table ("Letture", "Dati di lettura"): date (YYYY-MM-DD);
register — electricity: F1, F2, F3 for band registers, single for a single register, feed_in for
"energia immessa"; gas and water: single; value as printed on the meter (gas in cubic metres, not
Smc); kind actual for "rilevata", "reale", "effettiva", "autolettura", estimated for "stimata".
Never invent a reading.

IGNORE
Charts and tables of past months, annual consumption, the offer box when it repeats prices already
in the lines, advertising, payment slips.

WARNINGS
Short Italian sentences for what a reviewer must check: a document with more than one supply
(extract only the first and say which), unreadable digits, lines you could not place in a category,
totals that do not add up as printed.

EXAMPLE (invented figures)
A gas bill for September 2026 that re-bills August prints, in the August detail block, "Gas 10 Smc
× 0,500000 = 5,00" and "Gas (voce di ricalcolo) −8 Smc × 0,500000 = −4,00". Both lines:
category commodity, component variable, periodStart 2026-08-01, periodEnd 2026-08-31,
isRecalculation true, quantityUnit Smc, unitPriceMicros 500000, quantity 10 and −8, amountCents 500
and −400. The September block's "Gas 20 Smc × 0,500000 = 10,00": periodStart "", periodEnd "",
isRecalculation false, quantity 20, amountCents 1000.
```

`buildExtractionInstruction({ today, expectedKind })` (stesso file): `Today is ${today}.` più, se
`expectedKind`, `The user expects a ${expectedKind} bill.` più `Extract the bill.`

`pricing.ts`:

```ts
export const EXTRACTION_MODEL = 'claude-opus-5-5';

/** List prices in USD per million tokens (platform.claude.com pricing, read 2026-10-24). */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

/** Tokens × USD per million tokens = micro-dollars. */
export function costMicroUsd(usage: { inputTokens: number; outputTokens: number }, model: string): number {
  const price = MODEL_PRICES[model] ?? MODEL_PRICES['claude-opus-5'];
  if (!price) throw new Error('MODEL_PRICES must contain claude-opus-5');
  return Math.round(usage.inputTokens * price.input + usage.outputTokens * price.output);
}

/** A cautious figure shown before or during an extraction. */
export function estimateExtractionCost(pages: { pdfPages: number; photos: number }): number {
  const inputTokens = pages.pdfPages * 3_000 + pages.photos * 4_800 + 4_000;
  return costMicroUsd({ inputTokens, outputTokens: 10_000 }, EXTRACTION_MODEL);
}
```

`format.ts` aggiunge `formatUsd(microUsd)` → «0,31 $» (`it-IT`, 2 decimali, simbolo dopo).

`extractor.ts` — il contratto:

```ts
export interface ExtractorDocument {
  contentType: DocumentContentType;
  bytes: Uint8Array;
}

export interface ExtractorInput {
  documents: ExtractorDocument[];
  today: IsoDate;
  expectedKind: SupplyKind | null;
  /** Epoch ms by which the call must be over. */
  deadlineMs: number;
}

export type ExtractorOutcome =
  | { ok: true; extraction: Extraction; usage: TokenUsage; model: string }
  | { ok: false; code: Exclude<ExtractionErrorCode, 'not_a_bill' | 'document_invalid'>; message: string; usage: TokenUsage | null; model: string | null };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface BillExtractor {
  extract(input: ExtractorInput): Promise<ExtractorOutcome>;
}
```

`anthropic-extractor.ts` — **l'unico file che importa `@anthropic-ai/sdk`**:

```ts
/**
 * The real extractor: one streamed call to Claude per bill, structured output, server-side
 * fallback on a policy refusal. No automatic retry: a failure is shown with "Riprova", so the
 * owner decides whether to spend again.
 *
 * The output format is passed without its `parse` function. With it, the SDK parses the text as
 * soon as the stream ends, before anyone looks at stop_reason: a refusal or an answer cut by
 * max_tokens would throw "Failed to parse structured output" and the tokens paid for would be lost.
 * So stop_reason is checked first, and the JSON is parsed and validated here.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BillExtractor, ExtractorDocument, ExtractorOutcome } from './extractor';
import { EXTRACTION_MODEL } from './pricing';
import { buildExtractionInstruction, EXTRACTION_SYSTEM_PROMPT } from './prompt';
import { type Extraction, ExtractionSchema } from './schema';

const MIN_CALL_MS = 30_000;

const { parse: _sdkParse, ...EXTRACTION_FORMAT } = betaZodOutputFormat(ExtractionSchema);

export function createAnthropicExtractor(options: { apiKey: string; clock: () => number; client?: Anthropic }): BillExtractor {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
  return {
    async extract(input): Promise<ExtractorOutcome> {
      const remainingMs = input.deadlineMs - options.clock();
      if (remainingMs < MIN_CALL_MS) {
        return { ok: false, code: 'timeout', message: 'Tempo scaduto prima della chiamata.', usage: null, model: null };
      }
      try {
        const stream = client.beta.messages.stream(
          {
            model: EXTRACTION_MODEL,
            max_tokens: 32_000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: EXTRACTION_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  ...input.documents.map(toContentBlock),
                  { type: 'text', text: buildExtractionInstruction({ today: input.today, expectedKind: input.expectedKind }) },
                ],
              },
            ],
            output_config: { effort: 'high', format: EXTRACTION_FORMAT },
          },
          // The SDK timeout only covers the wait for the response headers; the signal bounds the
          // whole stream.
          { timeout: remainingMs, maxRetries: 0, signal: AbortSignal.timeout(remainingMs) },
        );
        const message = await stream.finalMessage();
        const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
        const model = message.model;
        if (message.stop_reason === 'refusal') {
          const category = message.stop_details?.category ?? 'senza categoria';
          return { ok: false, code: 'refusal', message: `Il modello ha rifiutato la richiesta (${category}).`, usage, model };
        }
        if (message.stop_reason === 'max_tokens') {
          return { ok: false, code: 'truncated', message: 'La risposta è stata troncata: bolletta troppo lunga.', usage, model };
        }
        const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
        const extraction = parseExtraction(text);
        if (!extraction) {
          return { ok: false, code: 'invalid_output', message: 'Risposta del modello non conforme allo schema.', usage, model };
        }
        return { ok: true, extraction, usage, model };
      } catch (error) {
        return toFailure(error);
      }
    },
  };
}

function parseExtraction(text: string): Extraction | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const result = ExtractionSchema.safeParse(json);
  return result.success ? result.data : null;
}

function toContentBlock(document: ExtractorDocument) {
  const data = Buffer.from(document.bytes).toString('base64');
  return document.contentType === 'application/pdf'
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } } as const);
}

function toFailure(error: unknown): ExtractorOutcome {
  const failure = (code: 'timeout' | 'unavailable' | 'api_error', message: string): ExtractorOutcome =>
    ({ ok: false, code, message, usage: null, model: null });
  // First: the deadline signal aborts the stream with an APIUserAbortError, a subclass of APIError,
  // and the connection timeout is a subclass of APIConnectionError.
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return failure('timeout', 'Il modello non ha risposto in tempo.');
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
    return failure('unavailable', 'Il servizio di Anthropic non è disponibile ora: riprova più tardi.');
  }
  if (error instanceof Anthropic.APIError) return failure('api_error', `Errore dell'API (${error.status ?? 'senza stato'}).`);
  // With the format passed without `parse`, a plain AnthropicError means the stream broke off.
  if (error instanceof Anthropic.AnthropicError) return failure('unavailable', 'La risposta si è interrotta: riprova più tardi.');
  throw error;
}
```

Un fallimento dentro `toFailure` non ha `usage`: la chiamata non è arrivata in fondo e l'API non ha
restituito i token; ogni risposta completa (rifiuto, troncamento, JSON non valido) li porta.

`fake-extractor.ts` — `createFakeExtractor(dir)`: calcola lo SHA-256 del primo documento, legge
`<dir>/<sha256>.json`, lo valida con `ExtractionSchema` e risponde `{ ok: true, extraction, usage:
{ inputTokens: 10_000, outputTokens: 5_000 }, model: 'claude-opus-5-5' }`; file mancante →
`{ ok: false, code: 'invalid_output', … }`, tranne quando il primo documento è un JPEG: allora usa
`<dir>/photo-default.json` (le foto dei test si generano al volo e non hanno uno SHA noto). Un file
`<sha256>.json` con `{ "fail": "<code>" }` produce quel fallimento (serve all'E2E di «Riprova»).

`validate.ts` — `validateExtraction(extraction): string[]` (pura): `isBill` falso → `['not_a_bill']`
gestito a parte; periodo della bolletta con date valide (`isIsoDate`) e inizio ≤ fine; ogni data non
vuota di voci e letture valida; almeno una voce; `quantityUnit === 'none'` ⇒ `quantity === 0` (una
quantità stampata 0 con la sua unità, per esempio «Energia F3 0 kWh», è valida). Ogni violazione è
una frase italiana.

`to-bill-input.ts` (C-17):

```ts
export interface ToBillInputContext {
  supplies: Array<{ id: string; kind: SupplyKind; identifier: string | null; archivedAt: number | null }>;
  preselectedSupplyId: string | null;
}

export interface ReviewDraft {
  input: BillInput;                 // supplyId is '' when no supply matched
  matchedSupplyId: string | null;
  /** Prefills «Crea una nuova fornitura» when nothing matched; kind is null for an unrecognised utility. */
  suggestedSupply: { kind: SupplyKind | null; supplierName: string | null; identifier: string | null } | null;
  warnings: string[];
}

export function toBillInput(extraction: Extraction, context: ToBillInputContext): ReviewDraft;
```

Regole: `''` → `null` per date, nomi e identificativo; una voce con `periodStart` o `periodEnd`
vuoto (anche uno solo dei due) prende tutti e due gli estremi dalla bolletta; una lettura con data
vuota si scarta con l'avviso «Lettura senza data scartata: <registro> <valore>»; `quantityUnit
'none'` → `quantity: null, quantityUnit: null`; un'unità con quantità 0 resta `quantity: 0` con
quell'unità; `unitPriceMicros 0` → `null`; `band 'none'` → `null`; `vatRatePercent < 0` → `null`,
altrimenti `Math.round(percent * 100)` punti base; `conversionFactor`/`calorificValueGj` `0` →
`null` (e `null` se il tipo non è gas); letture `actual` → `bill_actual`, `estimated` →
`bill_estimated`; `isEstimated` della bolletta = `consumptionEstimated`; `overlapDecision: null`.
Fornitura: `preselectedSupplyId` se è fra `supplies`; altrimenti la fornitura (anche archiviata)
con `identifier === normalizeSupplyIdentifier(extraction.supplyIdentifier)` e lo stesso tipo;
altrimenti nessuna (`supplyId: ''`), con `suggestedSupply` dai dati estratti (`supplyKind 'other'`
→ `suggestedSupply.kind` nullo e l'avviso «Tipo di utenza non riconosciuto»). Se la fornitura
preselezionata ha un tipo diverso da quello estratto, l'avviso «Il documento sembra una bolletta di
<tipo>». Gli `warnings` del modello passano in coda.

### 4.7 Verifica dei file — `src/lib/extraction/verify-document.ts`

```ts
export interface VerifiedDocument {
  pageCount: number | null;
}

/** Check a stored file against what the browser declared, before anyone uses it. */
export async function verifyDocument(bytes: Uint8Array, declared: { contentType: DocumentContentType; sha256: string; sizeBytes: number }): Promise<VerifiedDocument>;
```

Regole, ogni violazione → `DomainError('DOCUMENT_INVALID', <messaggio>)`: dimensione ≤
`maxBytesFor(contentType)` (PDF 10 MB, JPEG 5 MB) e uguale a quella dichiarata; magic bytes `%PDF-`
per il PDF, `FF D8 FF` per il JPEG; SHA-256 (`node:crypto`) uguale al dichiarato; PDF che contiene un
dizionario di cifratura (la sequenza di byte `/Encrypt` nel file: anche i PDF protetti solo contro
la modifica, che si aprono senza password, l'API non li legge) → «PDF protetto: carica le foto delle
pagine.»; PDF: `getDocumentProxy(bytes)` di `unpdf` → `numPages` ≤ 40 («La bolletta ha più di 40
pagine.»); un PDF che `unpdf` non apre → «PDF danneggiato.»; JPEG: `pageCount = null`.

### 4.8 Servizi — `src/lib/services/extractions.ts` (C-17)

Tutti `(db, userId, …, deps)` con `deps` esplicite (`blob`, `extractor`, `now`, `clock`); `userId`
in ogni lettura e scrittura, e un id altrui si comporta come mancante (`NOT_FOUND`). Le estrazioni
`running` si considerano morte dopo 6 minuti (`STALE_RUN_MS = 360_000`, costante del modulo).

Controlli dei file, comuni a `createExtraction` e `createAttachment` (`VALIDATION`): 1–10 file; un
PDF solo da solo; tipi `application/pdf`/`image/jpeg`; ogni file ≤ `maxBytesFor(contentType)` (PDF
10 MB, JPEG 5 MB) e la somma ≤ `MAX_EXTRACTION_BYTES` (20 MB); due file con lo stesso `sha256`
nella stessa richiesta → «Lo stesso file compare due volte.».

- `createExtraction(db, userId, input, deps: { blob, now })` con
  `input = { supplyId: string | null; batchId: string | null; files: Array<{ sha256; contentType; sizeBytes }> }`:
  controlli dei file; fornitura dell'utente se data (`NOT_FOUND`). Poi i doppioni:
  `getDocumentBySha256(db, userId, sha256)` per ogni file, e si decide in quest'ordine:
  1. un documento legato a una bolletta → `DUPLICATE_DOCUMENT` con `details: { billId, periodStart,
     periodEnd }` di quella bolletta (il primo file in ordine);
  2. un documento legato a un'estrazione `queued`, `running`, `extracted` o `failed` → restituisce
     `{ duplicateOf: extractionId, duplicateStatus: status }` senza creare nulla, con in più
     `estimatedCostMicroUsd` (calcolato come in `listPendingExtractions`) per `queued` ed
     `errorCode`, `errorMessage` per `failed`;
  3. un'estrazione `uploading` con lo stesso `batchId` della richiesta (o tutti e due nulli) i cui
     documenti hanno gli stessi SHA-256 dei file della richiesta, nello stesso ordine (`position`)
     → restituisce `{ duplicateOf, duplicateStatus: 'uploading', documents: [{ documentId, pathname,
     contentType }] }` in ordine di `position`: il client ricarica tutti i file su quei pathname e poi
     chiama `…/uploaded` (D-59);
  4. ogni altra estrazione `uploading` che contiene uno dei file (altro lotto, altri file o altro
     ordine) è abbandonata: nel batch della creazione, prima delle righe nuove, si cancellano i suoi
     documenti e poi la sua riga; dopo il batch `blob.deleteDocuments` dei suoi pathname (un errore
     di Blob va nel log: il file orfano lo recupera `documents:prune`).
  Altrimenti, nello stesso batch, una riga `extractions` (`uploading`) e una `documents` per file
  (`position` = indice, `pathname` = `documentPathname`). Restituisce `{ extractionId, documents:
  [{ documentId, pathname, contentType }] }`. Se il batch fallisce sull'indice
  `documents_user_sha256_uq` (due richieste in corsa con lo stesso file), il servizio rilegge i
  doppioni una volta e risponde come sopra; se non ne trova, rilancia.
- `createAttachment(db, userId, input: { billId; files })`: bolletta dell'utente (`NOT_FOUND`);
  controlli dei file; doppioni: un documento della **stessa** bolletta con `uploadedAt` nullo si
  riusa (stessi `documentId` e `pathname`: si riprende un allegato interrotto); un documento legato
  a una bolletta → `DUPLICATE_DOCUMENT` con `details: { billId, periodStart, periodEnd }`; legato a
  un'estrazione → `DUPLICATE_DOCUMENT` con `details: { extractionId }`. Altrimenti un batch di
  righe `documents` con `billId` (`position` dopo quelle esistenti). Stessa regola per la corsa
  sull'indice. Restituisce `{ documents: [{ documentId, pathname, contentType }] }`.
- `markExtractionUploaded(db, userId, extractionId, deps: { blob, now })`: estrazione `uploading`
  dell'utente (`NOT_FOUND` altrimenti); per ogni documento `readDocument` (`null` →
  `DOCUMENT_INVALID` «File non arrivato.») e `verifyDocument`; salva `pageCount` e `uploadedAt = now`;
  stato `queued`. Un `DOCUMENT_INVALID` porta l'estrazione a `failed` con `errorCode
  'document_invalid'` e il messaggio, e lo rilancia (i file restano fino a «Scarta»). Restituisce
  `{ pdfPages, photos, estimatedCostMicroUsd }` (`estimateExtractionCost`). Nessuna chiamata a
  Claude: l'estrazione resta `queued` finché l'owner non clicca «Estrai» (D-42).
- `markAttachmentUploaded(db, userId, billId, documentIds, deps: { blob, now })`: bolletta
  dell'utente e ogni id un documento di quella bolletta con `uploadedAt` nullo (`NOT_FOUND`
  altrimenti); stessa verifica; `uploadedAt = now`. Un `DOCUMENT_INVALID` cancella in un batch le
  righe dei documenti di quella richiesta, poi i loro file, e si rilancia.
- `runExtraction(db, userId, extractionId, deps: { blob, extractor, now, clock })`:
  1. presa atomica: `UPDATE extractions SET status='running', started_at=:now, attempts=attempts+1,
     error_code=NULL, error_message=NULL WHERE id=:id AND user_id=:userId AND (status='queued' OR
     (status='failed' AND error_code != 'document_invalid') OR (status='running' AND started_at <
     :now - 360000)) RETURNING *`; nessuna riga → `NOT_FOUND` se l'estrazione non è dell'utente,
     `EXTRACTION_BUSY` altrimenti;
  2. legge i documenti in ordine di `position` (`readDocument`); un file mancante → esito `failed`
     con `document_invalid` («File non trovato.»), senza chiamata;
  3. `extractor.extract({ documents, today: romeToday(now), expectedKind: tipo della fornitura
     preselezionata o null, deadlineMs: now + 280_000 })`;
  4. esito: `ok` e `isBill` falso → `failed` con `not_a_bill` («Il documento non sembra una
     bolletta.»); `ok` e `validateExtraction` con errori → `failed` con `invalid_output` e le frasi
     unite; `ok` → `extracted` con `resultJson`; non `ok` → `failed` con codice e messaggio;
  5. un solo `UPDATE` finale, condizionato: `WHERE id=:id AND user_id=:userId AND status='running'
     AND started_at=:startedAt` (lo `startedAt` della presa); scrive stato, `resultJson`, errore,
     `finishedAt = clock()` e, con `usage`, `model` = quello che ha risposto e i valori **sommati**:
     `input_tokens = COALESCE(input_tokens, 0) + :in`, `output_tokens = COALESCE(output_tokens, 0) +
     :out`, `cost_micro_usd = COALESCE(cost_micro_usd, 0) + :cost` (`costMicroUsd(usage, model)`);
  6. nessuna riga aggiornata (estrazione scartata nel frattempo, o ripresa da un'altra esecuzione
     dopo 6 minuti) → il risultato si butta e, con `usage`, un secondo `UPDATE` con il solo
     `WHERE id=:id AND user_id=:userId` somma token e costo; restituisce la riga riletta.
- `getExtractionReview(db, userId, extractionId)`: estrazione `extracted` dell'utente → `{
  extraction, documents, draft, supplies, houses, overlaps }` con `draft = toBillInput(result, {
  supplies: tutte le forniture dell'utente, archiviate comprese, preselectedSupplyId:
  extraction.supplyId })`, `supplies` = le forniture non archiviate (per la scelta) più quella
  riconosciuta anche se archiviata (per la prop `supply` di `BillForm`), `overlaps:
  ExistingBillPeriod[]` = `findOverlappingBills` di `draft.input` sulle bollette confermate di
  `draft.matchedSupplyId` (vuote se nullo); altrimenti `NOT_FOUND`.
- `confirmExtraction(db, userId, extractionId, payload: { input: unknown; newSupply: { houseId;
  kind: SupplyKind; label; supplierName; identifier; hasPhotovoltaic } | null })`:
  1. presa atomica: `UPDATE extractions SET status='confirmed' WHERE id=:id AND user_id=:userId AND
     status='extracted' RETURNING *`; nessuna riga → `NOT_FOUND` se l'estrazione non è
     dell'utente, `EXTRACTION_BUSY` altrimenti (un secondo «Conferma» non crea una seconda bolletta);
  2. con `newSupply` → `createSupply(db, userId, newSupply)` (il tipo è `newSupply.kind`) e una
     copia dell'input con `supplyId` = la nuova (l'input resta `unknown` fino a `confirmBill`);
  3. `confirmBill(db, userId, input, { source: 'extraction' })`; se il passo 2 o il 3 lanciano: la
     fornitura creata al passo 2 si cancella (`deleteSupply`), l'estrazione torna `extracted`, e
     l'errore si rilancia (`OVERLAP_DECISION_REQUIRED`, `VALIDATION`, `DUPLICATE_IDENTIFIER` arrivano
     al modulo);
  4. batch: `documents.bill_id` = bolletta per i documenti dell'estrazione; estrazione con `billId`
     = bolletta e `resultJson = NULL` (i dati vivono nella bolletta). Restituisce `{ billId }`.
- `discardExtraction(db, userId, extractionId, deps: { blob, now })`: estrazione dell'utente in
  `uploading`, `queued`, `extracted`, `failed`, o `running` con `startedAt` più vecchio di 6
  minuti; `running` più recente → `EXTRACTION_BUSY`; `confirmed` o `discarded` → `NOT_FOUND`. Batch:
  cancella i suoi documenti, stato `discarded`, `resultJson = NULL`; poi `blob.deleteDocuments` dei
  pathname.
- `listPendingExtractions(db, userId)` → `Array<{ id; status; supplyLabel: string | null` (con `formatSupplyLabel`, come `listBills`)`; createdAt;
  startedAt: number | null; errorCode; errorMessage; estimatedCostMicroUsd: number | null }>`: stati
  `queued`, `running`, `extracted`, `failed`, dal più vecchio; per le `queued`
  `estimatedCostMicroUsd` = `estimateExtractionCost` dai loro documenti (`pageCount` per i PDF, 1
  per foto), `null` per gli altri stati. `countExtractedToReview(db, userId)`: il numero delle
  `extracted`.
- `monthlyExtractionSpend(db, userId, month: MonthKey)`: somma di `costMicroUsd` e numero delle
  estrazioni il cui ultimo `startedAt` cade nel mese di Roma (`romeToday(startedAt).slice(0, 7) ===
  month`); il costo di tutti i tentativi di un'estrazione va nel mese dell'ultimo.
- `listBillDocuments(db, userId, billId)` → `Array<{ id: string; contentType: DocumentContentType;
  pageCount: number | null; position: number }>`: bolletta dell'utente (`NOT_FOUND` altrimenti),
  solo i documenti con `uploadedAt`, in ordine di `position`; lo legge la scheda della bolletta.
- `readDocumentFile(db, userId, documentId, deps: { blob })` → `{ bytes: Uint8Array; contentType:
  DocumentContentType }`: documento dell'utente con `uploadedAt` non nullo e file presente,
  `NOT_FOUND` altrimenti; lo usa `GET /api/documents/[id]`.
- `authorizeDocumentUpload(db, userId, documentId, pathname)` → `{ contentType: DocumentContentType
  }`: documento dell'utente in attesa (`uploadedAt` nullo) con quel pathname, allegato a una
  bolletta o di un'estrazione `uploading`; `NOT_FOUND` altrimenti; lo usano `onBeforeGenerateToken`
  e il caricamento finto.

Repository nuovi (C-12): `documents.ts` (`insertDocumentsQuery`, `getDocument`, `getPendingDocument`,
`getDocumentBySha256`, `listDocumentsOfExtraction`, `listDocumentsOfBill`, `updateDocumentQuery`,
`linkDocumentsToBillQuery`, `deleteDocumentsQuery`, `deleteDocumentsOfExtractionQuery`,
`deleteDocumentsOfBillsQuery`, `listDocumentPathnamesOfBills`), `extractions.ts`
(`insertExtractionQuery`, `getExtraction`, `claimExtractionForRun`, `finishExtractionRun` (l'`UPDATE`
condizionato del passo 5, restituisce le righe aggiornate), `addExtractionUsage`,
`claimExtractionForConfirm`, `updateExtractionQuery`, `deleteExtractionsQuery`, `listExtractions`,
`clearBillOfExtractionsQuery`, `clearSupplyOfExtractionsQuery`). Tutti `(db, userId, …)`. Le sole
query fra utenti stanno in `src/lib/db/maintenance/prune.ts` (§ 4.11).

### 4.9 Route (T-22)

| Metodo e rotta | Corpo | Servizio | Risposta |
|---|---|---|---|
| `POST /api/extractions` | `{ supplyId, batchId, files }` (zod) | `createExtraction` | 201 `{ extractionId, documents }`; 200 `{ duplicateOf, duplicateStatus }` con `documents` (`uploading` da riprendere), `estimatedCostMicroUsd` (`queued`), `errorCode` ed `errorMessage` (`failed`) |
| `POST /api/extractions/[id]/uploaded` | — | `markExtractionUploaded` | 200 `{ pdfPages, photos, estimatedCostMicroUsd }` |
| `POST /api/extractions/[id]/run` | — | `runExtraction` (`export const maxDuration = 300`) | 200 `{ status, errorCode, errorMessage }` |
| `POST /api/bills/[id]/documents` | `{ files }` | `createAttachment` | 201 `{ documents }` |
| `POST /api/bills/[id]/documents/uploaded` | `{ documentIds }` | `markAttachmentUploaded` | 204 |
| `POST /api/documents/upload` | protocollo di `handleUpload` | `authorizeDocumentUpload` (in `onBeforeGenerateToken`) | § 4.4 |
| `GET /api/documents/[id]` | — | `readDocumentFile` | il file |
| `PUT /api/e2e/blob?documentId=&pathname=` | il file | `authorizeDocumentUpload`, solo con `E2E_FAKE_SERVICES` | 204 |

Ogni route: `requireUser()` per prima cosa, tranne `POST /api/documents/upload`, che lo chiama dentro
`onBeforeGenerateToken` (la richiesta di fine upload di Vercel non ha sessione e non fa nulla); zod
sul corpo, errori con `toErrorResponse`. Le azioni della revisione (`confirmExtractionAction({
extractionId, input, newSupply })`, `discardExtractionAction(extractionId)`) sono Server Action in
`src/app/(app)/bollette/revisione/[id]/actions.ts`: `requireUser()` → il servizio dentro
`toActionResult` (`discardExtraction` con `{ blob: getBlobStore(), now: Date.now() }`) → con `ok`
`revalidatePath('/', 'layout')` (badge e pagine «Bollette», «Da rivedere», «Casa», scheda della
fornitura). «Scarta» in ogni punto dell'interfaccia (caricamento, «Da rivedere», revisione) chiama
`discardExtractionAction`.

### 4.10 Interfaccia

- **`src/components/upload/bill-uploader.tsx`** (client, C-16 lato UI): props `{ mode: 'extract' |
  'attach'; billId?: string; supplies; preselectedSupplyId?: string }`. Due ingressi: «Scegli PDF o
  foto» (`accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"`, `multiple`) e
  «Scatta foto» (`accept="image/*" capture="environment"`); un PDF esclude le foto e viceversa
  (messaggio chiaro). Le foto passano da `compressPhoto` e compaiono come miniature numerate con
  «Su», «Giù», «Rimuovi» (massimo 10); il PDF come riga con nome, dimensione e «Rimuovi». Un PDF
  oltre 10 MB o una foto che dopo la compressione supera 5 MB → messaggio sotto il campo, niente
  invio. Pulsante «Carica» → SHA-256 nel browser (`crypto.subtle.digest`) → `POST /api/extractions`
  (o `/api/bills/[id]/documents`) → `uploadDocumentFile` per ogni file (in ordine) → `…/uploaded`.
  In modalità `extract`, poi:
  - la stima e il pulsante «Estrai (circa X $)» (`formatUsd(estimatedCostMicroUsd)`), con la nota
    «La bolletta resta in «Da rivedere» finché non la estrai» e «Scarta»; **nessuna chiamata a Claude
    prima del clic** (D-42);
  - al clic: «Estrazione in corso…» e `POST …/run`; `extracted` → `router.push('/bollette/revisione/<id>')`;
    `failed` → il messaggio con «Riprova» (di nuovo `…/run`), «Inserisci a mano»
    (`/bollette/nuova?fornitura=…`) e «Scarta»; dopo ogni `…/run` `router.refresh()` (badge);
  - risposta 200 «doppione» (D-59), secondo `duplicateStatus`: `extracted` →
    `router.push('/bollette/revisione/<duplicateOf>')`; `queued` → la stima e «Estrai (circa X $)»
    di quell'estrazione, come dopo un caricamento; `failed` con `errorCode` diverso da
    `document_invalid` → `errorMessage` con «Riprova» e «Scarta»; `failed` con `document_invalid` →
    `errorMessage` con «Scarta»; `running` → «Questa bolletta è già in lavorazione» con il link a
    «Da rivedere»; `uploading` con `documents` → ricarica tutti i file su quei pathname, chiama
    `…/uploaded` di `duplicateOf` e prosegue come dopo un caricamento;
  - `DUPLICATE_DOCUMENT` → «Questo file è già nella bolletta dal <formatDate(periodStart)> al
    <formatDate(periodEnd)>» con il link a `/bollette/<billId>`;
  - `…/uploaded` che risponde `DOCUMENT_INVALID` → il messaggio della risposta con «Scarta».
  In modalità `attach`: dopo `…/documents/uploaded` `router.refresh()`; `DUPLICATE_DOCUMENT` con
  `billId` → lo stesso messaggio col link, con `extractionId` → «Questo file è già fra le bollette
  da rivedere» con il link a «Da rivedere».
- **`src/lib/upload/compress-photo.ts`** (client): `createImageBitmap(file, { imageOrientation:
  'from-image' })`; lato lungo ridotto a 2.576 px se più grande; `canvas.toBlob(…, 'image/jpeg',
  0.85)`; se `createImageBitmap` fallisce → «Formato immagine non supportato: usa JPEG o PNG.».
- **`/bollette/carica`**: titolo «Carica una bolletta». Se l'utente non ha case, la pagina mostra lo
  stato vuoto della 03 («Comincia creando la tua casa» → `/forniture`) al posto del caricamento. Se
  `!isExtractionConfigured()` spiega «Estrazione non configurata su questa installazione» e offre
  solo l'inserimento a mano. Altrimenti select della fornitura (prima voce «Riconosci dalla
  bolletta»; `?fornitura=` la preseleziona) e `BillUploader mode="extract"`.
- **Ingressi a «Carica bolletta»** (`/bollette/carica?fornitura=<id>`): nella card di ogni fornitura
  della pagina «Casa» (`data-testid="supply-card"`, D-52) accanto a «Nuova bolletta»; nella scheda
  della fornitura `/forniture/[id]`, nell'intestazione accanto a «Nuova bolletta»
  (`/bollette/nuova?fornitura=<id>`, già lì dal 2026-10-24); nell'elenco `/bollette` accanto a «Nuova
  bolletta» (senza `fornitura`). Si mostrano solo se `isExtractionConfigured()`.
- **`/bollette/revisione/[id]`** (dati da `getExtractionReview`): in cima gli avvisi di
  `draft.warnings`. Documento (D-56): da 1024 px due colonne, a sinistra il PDF in `<iframe
  src="/api/documents/<id>">` con il link «Apri in una nuova scheda» o le foto come `<img>` in
  sequenza, a destra il modulo; sotto i 1024 px niente iframe: per il PDF il pulsante «Apri il PDF»
  (link a `/api/documents/<id>` con `target="_blank"`, che il telefono apre nel suo visore), per le
  foto le `<img>` in sequenza in un riquadro richiudibile sopra il modulo.
  Fornitura: se `matchedSupplyId` c'è, la fornitura è quella (solo testo). Altrimenti «A quale
  fornitura appartiene?» (`<select>` con etichetta) elenca **tutte** le forniture non archiviate
  dell'utente, quelle del tipo estratto per prime, più la voce «Crea una nuova fornitura», che apre:
  casa (select delle case), tipo (select con `KIND_LABELS`, precompilata con
  `suggestedSupply.kind`, vuota e obbligatoria quando è nullo), etichetta (default
  `KIND_LABELS[tipo]`), fornitore e identificativo precompilati da `suggestedSupply`, «Fotovoltaico»
  solo per la luce.
  `BillForm` si monta **solo dopo la scelta**, con `key` = id della fornitura scelta o `new-<tipo>`:
  fornitura esistente → `supply` = quella riga e `initialValue = { ...draft.input, supplyId: <id> }`;
  nuova fornitura → `supply = { id: 'nuova', kind: <tipo scelto>, label: <etichetta digitata>,
  hasPhotovoltaic: <spunta> }` e `initialValue = { ...draft.input, supplyId: 'nuova' }` (segnaposto
  non vuoto: `inputFromDraft` valida `supplyId` con `min(1)`; `confirmExtraction` lo sostituisce con
  l'id della fornitura creata); `overlaps` = quelle del server solo
  se la fornitura scelta è `matchedSupplyId`, altrimenti le porta `OVERLAP_DECISION_REQUIRED` al
  primo «Conferma» (come nell'inserimento a mano: «Overlap» in `doc/guide/app.md` § 5). `submitLabel="Conferma"`;
  `onSubmit` chiama `confirmExtractionAction({ extractionId, input, newSupply })` (`newSupply` dai
  campi di «Crea una nuova fornitura», `null` per una fornitura esistente); al successo `BillForm` va
  a `/bollette/<billId>` (`BillForm` naviga da sé, `doc/guide/app.md` § 5) e il componente della revisione non naviga. Un secondo pulsante «Scarta» (→ `/bollette/da-rivedere`).
- **`/bollette/da-rivedere`**: elenco di `listPendingExtractions`: data, fornitura (o «da
  assegnare»), stato in italiano («in coda», «in corso», «da rivedere», «fallita: <messaggio>»).
  Azioni: «Rivedi» (estratte); «Estrai (circa X $)» (in coda, D-42: chiama `…/run`); «Riprova»
  (fallite non `document_invalid`, e in corso con `startedAt` più vecchio di 6 minuti: chiama
  `…/run`); «Scarta» su tutte tranne le in corso più recenti di 6 minuti. Dopo `…/run`: `extracted`
  → la revisione, altrimenti `router.refresh()`.
- **Badge** (C-24): il layout `(app)` calcola `countExtractedToReview(getDb(), user.id)` e lo passa
  ad `AppShell` come `reviewCount`; `NavBar` e `SideBar` mostrano sul tab «Bollette» il badge quando
  è > 0, con `aria-label` «N bollette da rivedere»; a 0 il badge non c'è.
- **Scheda della bolletta**: se `isBlobConfigured()` (la chiave Anthropic non serve), sezione
  «Documenti» da `listBillDocuments` (solo i documenti caricati; per ognuno «Pagina N» o «PDF, N
  pagine» e «Apri», nuova scheda su `/api/documents/<id>`) e `BillUploader mode="attach"` («Allega
  il file»); senza Blob la sezione non c'è.
- **Impostazioni**: sezione «Estrazioni con Claude»: «Questo mese: X $ in N estrazioni» (`formatUsd`),
  il modello in uso.

### 4.11 Script

- Script di `package.json` (T-6): `"fixture:bills": "tsx scripts/make-bill-fixtures.ts"`,
  `"documents:prune": "tsx --env-file-if-exists=.env.local scripts/prune-documents.ts"`.
- `scripts/make-bill-fixtures.ts` (`pnpm fixture:bills`): scrive **PDF minimi fatti a mano** (nessuna
  dipendenza: oggetti Catalog, Pages, una Page per blocco di 50 righe, font Helvetica, flusso di
  testo con `BT /F1 10 Tf 40 800 Td 13 TL (…) ' … ET`, tabella `xref` con gli offset calcolati) in
  `tests/fixtures/bills/`, con **periodi fissi del 2024** (prima di ogni finestra dei seed, che va da
  14 mesi fa al mese scorso), fornitori inventati che non compaiono nel seed e identificativi
  diversi da quelli del seed (`IT001E00000011`, `00000000000011`):
  `luce-pellicano.pdf` (01/09/2024–30/09/2024, «Pellicano Energia», POD `IT001E00000011`, letture
  F1/F2/F3, canone TV fuori totale), `gas-pellicano.pdf` («Pellicano Energia», settembre 2024 con il
  blocco di agosto 2024 rifatturato con le voci di ricalcolo, PDR `00000000000011`, C e PCS),
  `acqua-lontra.pdf` (01/07/2024–30/09/2024, «Lontra Acque», scaglioni, fognatura, depurazione, UI),
  `internet-armadillo.pdf` (settembre 2024, «Armadillo Telecomunicazioni», canone IVA inclusa);
  numeri tondi, nessun indirizzo. Per ognuna scrive anche l'estrazione attesa in
  `tests/fixtures/extractions/<sha256>.json` (costruita da un oggetto TypeScript nello script e
  validata con `ExtractionSchema`); in più `luce-pellicano-rotta.pdf` (la stessa luce con un'altra
  data di emissione, quindi un altro SHA) con `tests/fixtures/extractions/<sha256>.json` =
  `{ "fail": "unavailable" }`, e `tests/fixtures/extractions/photo-default.json` (l'estrazione
  dell'internet). Stessi byte a ogni esecuzione.
- `scripts/e2e-reset-db.mjs` (01) cancella anche la cartella del disk store, prima delle migrazioni:
  `rmSync('.e2e-blob', { recursive: true, force: true })`; ogni `pnpm test:e2e` parte senza file né
  documenti di esecuzioni precedenti.
- `scripts/prune-documents.ts` (`pnpm documents:prune [-- --prod] [-- --delete] [-- --force]`):
  legge `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` e `BLOB_READ_WRITE_TOKEN` con uno schema zod suo
  (non `EnvSchema`, che pretende anche le variabili di Better Auth). Senza `--prod` usa le variabili
  di `.env.local` e rifiuta un `TURSO_DATABASE_URL` che non comincia con `file:`. Con `--prod` prende
  il database da `loadProductionTarget()` (C-22) e il token dello store di produzione **solo** dalla
  terza riga facoltativa `BLOB_READ_WRITE_TOKEN` di `.env.turso-prod` (letta con `dotenv.parse` del
  file, mai da `process.env`, dove c'è quello di sviluppo di `.env.local`); se la riga manca esce con
  «BLOB_READ_WRITE_TOKEN missing in .env.turso-prod (see SETUP.md)». Stampa **quale database e quale
  store** confronta (host del DB e prefisso del token), elenca i pathname sotto `users/` senza riga in
  `documents`, le estrazioni `uploading` e i documenti allegati con `uploadedAt` nullo creati da più
  di 24 ore; senza `--delete` è una prova a secco; con `--delete` cancella righe (prima) e file
  (dopo); rifiuta di cancellare se il DB non ha nessun documento e manca `--force` (segnaprezzi §
  4.61: mai accoppiare un DB locale con lo store di produzione). Le query fra utenti stanno in
  `src/lib/db/maintenance/prune.ts` (`listAllDocumentPathnames(db)`, `listStaleUploads(db,
  olderThanMs)`, `deleteStaleUploadsQuery(db, ids)`), fuori da `repositories/` (quindi fuori da
  `scope.test.ts`), usate solo da questo script; nessun altro modulo le importa.

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che `@anthropic-ai/sdk` si importa solo in
  `anthropic-extractor.ts` e `@vercel/blob` (lato server) solo in `vercel-blob-store.ts`; i servizi
  ricevono `blob` ed `extractor` come dipendenze; le route li prendono dal container; pagine e route
  non importano repository (`listBillDocuments`, `readDocumentFile`, `authorizeDocumentUpload` sono
  servizi); l'unico SQL fuori da `repositories/` è `src/lib/db/maintenance/prune.ts`, solo per lo
  script.
- **AGENTS.md § 2.3 Secrets** — `ANTHROPIC_API_KEY` e `BLOB_READ_WRITE_TOKEN` mai nel client né nei
  log; `NEXT_PUBLIC_E2E_FAKE_SERVICES` è l'unica variabile pubblica, letta come
  `process.env.NEXT_PUBLIC_E2E_FAKE_SERVICES` letterale solo in `upload-client.ts`, e vale solo nelle
  build di Playwright; il token Blob lo digita l'owner, non passa dalla chat.
- **AGENTS.md § 2.4 Isolation** — il token di upload si genera solo per un documento dell'utente in
  attesa; `GET /api/documents/[id]` legge il documento con `userId`; l'estrazione si prende con
  `user_id` nel `WHERE` atomico; ogni servizio nuovo ha la coppia proprio/altrui.
- **AGENTS.md § 2.6 Foreign keys** — `documents` ed `extractions` in `deleteAllUserData`; riga prima,
  file dopo.
- **AGENTS.md § 6 Claude** (scritto in pianificazione, vale da qui): un'estrazione = una chiamata
  che parte al clic dell'owner; niente `temperature`, niente prefill, niente `tool_choice` forzato;
  `max_tokens` 32.000 con streaming; formato senza `parse`; `timeout` e `signal` dalla scadenza;
  nessun retry automatico; costo sempre registrato e sommato sui tentativi; il prompt non chiede
  ragionamenti scritti nello schema (rifiuti `reasoning_extraction`).
- **AGENTS.md § 9 Testing** — gli utenti seed sono in sola lettura per Playwright: `estrazione.spec.ts`
  e le coppie che scrivono in `isolamento.spec.ts` registrano i loro utenti con `signUpTestUser`.
- Vercel: body 4,5 MB → mai file attraverso una function; `maxDuration = 300` dichiarato sulla
  route di esecuzione; 280 s di scadenza interna, rispettata anche a stream aperto grazie al
  `signal`.
- Fotocamera (D-55): il server di sviluppo non si apre dal telefono (né https locale né tunnel); in
  locale le foto si caricano dal browser del computer, «Scatta foto» si prova in produzione.
- Blob Hobby: 2.000 operazioni avanzate al mese (upload, list) e 10.000 semplici (letture); oltre,
  Blob si blocca per 30 giorni: `documents:prune` non si lancia in un ciclo, e la pagina «da
  rivedere» non legge i file.
- iOS Safari: `capture` apre la fotocamera; HEIC dalla galleria arriva come JPEG nella maggior parte
  dei casi, altrimenti `createImageBitmap` fallisce e il messaggio lo dice.
- I PDF campione dell'owner **non entrano mai** nel repo né nei test: le fixture sono generate.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `schema.test.ts`: lo schema JSON generato da `ExtractionSchema` (`z.toJSONSchema`) non contiene `anyOf`, `oneOf` né `type` a lista; gli unici `minimum`/`maximum` ammessi sono i limiti degli interi sicuri (±9007199254740991) che `.int()` aggiunge e che l'SDK sposta nella descrizione; ogni estrazione di `tests/fixtures/extractions/*.json` (tranne i `fail`) passa lo schema. | Rendere `offerName` nullable → compare `"type": ["string", "null"]` e il test fallisce; aggiungere `.min(0)` ad `amountCents` → compare `minimum: 0` e il test fallisce. |
| Unit | `to-bill-input.test.ts`: estrazione del gas → voci di agosto col periodo di agosto e `isRecalculation`, voci di settembre col periodo della bolletta, `0` → `null` per C mancante sulla luce, letture `bill_actual`; identificativo `IT 001 E00000011` riconosce la fornitura `IT001E00000011`; preselezione di tipo diverso → avviso; `supplyKind 'other'` → `suggestedSupply.kind` nullo e l'avviso «Tipo di utenza non riconosciuto»; voce con il solo `periodEnd` vuoto → tutti e due gli estremi della bolletta; lettura con data vuota → scartata con l'avviso «Lettura senza data scartata: …»; voce `kWh` con quantità 0 → `quantity: 0`, `quantityUnit: 'kWh'`. | Usare il periodo della bolletta anche per i blocchi con un periodo → agosto sparisce; tenere `periodStart` della voce quando manca solo `periodEnd` → il caso del periodo a metà fallisce; trattare la quantità 0 come assente → il caso 0 kWh dà `null`. |
| Unit | `anthropic-extractor.test.ts` con un `client` finto il cui `beta.messages.stream(params, options)` registra i due argomenti e restituisce `{ finalMessage }`: la richiesta ha `model 'claude-opus-5-5'`, `max_tokens 32000`, `betas ['server-side-fallback-2026-07-01']`, `fallbacks 'default'`, `output_config.effort 'high'`, `output_config.format` con `type` e `schema` e **nessuna** proprietà `parse`, nessuna `temperature`, il blocco `document` prima del testo; le opzioni hanno `maxRetries 0`, `timeout` e un `signal` (`AbortSignal`); `stop_reason 'refusal'` con categoria `cyber` → `refusal` col testo «(cyber)» e `usage`; `stop_reason 'max_tokens'` con un testo JSON tagliato → `truncated` con `usage`; un JSON valido che non rispetta lo schema → `invalid_output` con `usage` e `model`; il JSON di una fixture → `ok`; un `RateLimitError` → `unavailable`; `finalMessage` che rifiuta con `APIUserAbortError` → `timeout`; un `AnthropicError` semplice → `unavailable`; scadenza a 10 s → `timeout` senza chiamata a `stream`. | Aggiungere `temperature: 0` → l'asserzione «nessuna temperature» fallisce; passare `betaZodOutputFormat(ExtractionSchema)` intero → l'asserzione «nessun `parse`» fallisce; togliere il ramo `APIUserAbortError` da `toFailure` → `api_error` e il test fallisce. |
| Unit | `pricing.test.ts`: `costMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, 'claude-opus-5-5') === 4_000_000`; modello ignoto → prezzo di `claude-opus-5`; `estimateExtractionCost({ pdfPages: 8, photos: 0 }) === 312_000`. | Invertire input e output → 20.000.000. |
| Unit | `verify-document.test.ts`: PDF delle fixture → `pageCount` giusto; byte alterati → SHA diverso; JPEG con intestazione PDF → `DOCUMENT_INVALID`; PDF da 11 MB e JPEG da 6 MB (generati nel test) → `DOCUMENT_INVALID`; `luce-pellicano.pdf` con `/Encrypt 5 0 R` inserito nel dizionario del trailer (nel test, SHA ricalcolato) → `DOCUMENT_INVALID` con il messaggio «PDF protetto: carica le foto delle pagine.». | Saltare il controllo SHA → il caso alterato passa; saltare il controllo `/Encrypt` → il messaggio non è più quello e il test fallisce; usare `MAX_DOCUMENT_BYTES` anche per il JPEG → il JPEG da 6 MB passa. |
| Unit | `validate.test.ts`: periodo invertito, data `2026-02-30`, zero voci, `quantityUnit none` con quantità 5 → errori; voce `kWh` con quantità 0 → nessun errore. | Ripristinare il «se e solo se» fra `none` e quantità 0 → il caso 0 kWh dà un errore. |
| Integrazione | `extractions.test.ts` (fake Blob su cartella temporanea; il fake extractor o un estrattore di prova che restituisce l'esito dato): creazione → file scritti nel disk store → `markExtractionUploaded` → `queued` con `started_at` nullo e la stima → `runExtraction` → `extracted` con costo e `attempts 1`; secondo `runExtraction` concorrente → `EXTRACTION_BUSY`; esito `truncated` con `usage`, poi «Riprova» riuscito → token e costo = somma dei due, `attempts 2`; uno scarto durante l'esecuzione (l'estrattore di prova, prima di rispondere, chiama `discardExtraction` con un `now` di 7 minuti dopo la presa: l'esecuzione risulta morta) → resta `discarded` con `result_json` nullo e il costo della chiamata sommato; `confirmExtraction` con `newSupply` → bolletta e fornitura, documenti legati, `result_json` nullo; estrazione `other` confermata con `newSupply.kind 'telecom'` → fornitura internet creata; `confirmBill` che fallisce (sovrapposizione senza decisione) → la fornitura nuova non resta e l'estrazione torna `extracted`; due `confirmExtraction` in parallelo → una bolletta sola, l'altra `EXTRACTION_BUSY`; `discardExtraction` → riga `discarded`, documenti e file spariti; scarto di una `running` recente → `EXTRACTION_BUSY`; doppione di una bolletta → `DUPLICATE_DOCUMENT` con `billId`, `periodStart`, `periodEnd`; doppione di una `queued` → `duplicateStatus 'queued'` con la stima; doppione di una `uploading` dello stesso lotto e degli stessi file → `documents` con gli stessi pathname e nessuna riga nuova; doppione di una `uploading` di un altro lotto → estrazione nuova, la vecchia con documenti e file sparita; due foto con lo stesso SHA, un JPEG da 6 MB, cinque foto da 4,5 MB → `VALIDATION`; allegato con un file che non rispetta lo SHA → `DOCUMENT_INVALID` e le righe dei suoi documenti sparite; allegato interrotto ricaricato → stesso `documentId`; `listPendingExtractions` con una `queued` da un PDF di 8 pagine → `estimatedCostMicroUsd 312_000`; `deleteBill` → `documentPathnames` pieno; `deleteAllUserData` con documenti ed estrazioni → nessun errore. | Assegnare token e costo invece di sommarli → il caso «Riprova» trova solo il secondo costo; togliere `status='running' AND started_at=:startedAt` dall'`UPDATE` finale → la scartata torna `extracted`; togliere `status='extracted'` dalla presa di `confirmExtraction` → due bollette; non cancellare i documenti dell'estrazione `uploading` abbandonata → il batch viola `documents_user_sha256_uq` e il caso dell'altro lotto fallisce. |
| Integrazione | `extractions-isolation.test.ts` (utenti A e B con `createTestUser`): per `createExtraction` (fornitura), `createAttachment` (bolletta), `markAttachmentUploaded` (documenti), `markExtractionUploaded`, `runExtraction`, `getExtractionReview`, `confirmExtraction` (estrazione; `newSupply.houseId`; `input.supplyId`), `discardExtraction`, `listBillDocuments`, `readDocumentFile`, `authorizeDocumentUpload` (documento in attesa: A → `{ contentType }`): la risorsa di A con A passa, la stessa con B → `NOT_FOUND` e righe di A invariate; `listPendingExtractions`, `countExtractedToReview` e `monthlyExtractionSpend` di B non contano le estrazioni di A. | Togliere `userId` dal `WHERE` di `getExtraction` → B rivede l'estrazione di A e il caso di `getExtractionReview` fallisce. |
| Integrazione | `monthly-spend.test.ts`: due estrazioni in ottobre e una a settembre (orari di confine a mezzanotte di Roma) → la somma di ottobre; un'estrazione tentata a settembre e ripresa a ottobre → tutto il suo costo in ottobre. | Usare il mese UTC → l'estrazione delle 00:30 del 1° finisce nel mese sbagliato. |
| E2E | `estrazione.spec.ts` (fake; un utente nuovo per progetto con `signUpTestUser(page, 'pellicano')`, poi `createHouse` e `createSupply` di `tests/e2e/helpers.ts` creano dalla UI «Casa Pellicano» con «Luce» `IT001E00000011` e «Gas» `00000000000011`): (1) `luce-pellicano.pdf` con «Riconosci dalla bolletta» → dopo la verifica la stima ed «Estrai (circa … $)»; una lettura di `e2e.db` (`@libsql/client`, `file:e2e.db`) trova l'estrazione `queued` con `started_at` nullo; clic → revisione con la «Luce» riconosciuta dall'identificativo, su desktop il PDF nell'iframe, su mobile il pulsante «Apri il PDF» con `href` `/api/documents/<id>`, avvisi assenti → «Conferma» → scheda con i documenti e «Apri»; (2) lo stesso file di nuovo → il messaggio di doppione col periodo della bolletta e il link; (3) `gas-pellicano.pdf` caricato senza cliccare «Estrai» → «Da rivedere» lo mostra «in coda» con «Estrai (circa … $)» → clic → «Rivedi» → agosto 2024 con le voci di ricalcolo → «Scarta» → sparisce da «Da rivedere»; (4) `luce-pellicano-rotta.pdf` → «Estrai» → «fallita» con «Riprova»; (5) una foto PNG generata nel test con un `<canvas>` e caricata con «Scegli PDF o foto» → convertita in JPEG → «Estrai» → revisione con l'estrazione di `photo-default.json` e «A quale fornitura appartiene?»; `AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()` → 0 violazioni; il badge del tab «Bollette» mostra 1; (6) Impostazioni → «Questo mese:» con una spesa > 0. | Saltare `linkDocumentsToBillQuery` → la scheda non ha documenti; chiamare `…/run` subito dopo `…/uploaded` nel `BillUploader` → la lettura di `e2e.db` trova `started_at` pieno prima del clic; mostrare l'iframe anche sotto i 1024 px → nel progetto `mobile` «Apri il PDF» manca; togliere l'etichetta della select «A quale fornitura appartiene?» → violazione axe. |
| E2E | `a11y.spec.ts` esteso a `/bollette/carica` e `/bollette/da-rivedere` (seed A, che legge soltanto; mobile e desktop, tema chiaro e scuro) → 0 violazioni. | Un `<input type="file">` senza etichetta in `BillUploader` → violazione. |
| E2E | `isolamento.spec.ts` esteso (fake): nel `beforeAll` due utenti registrati con `signUpTestUser`, P (`'isolamento-p'`) e Q (`'isolamento-q'`); con la sessione di P: `POST /api/extractions` con `internet-armadillo.pdf` → `PUT /api/e2e/blob` → `…/uploaded` → `…/run` (fake) → `extracted`. Coppie sullo stesso URL: `GET /api/documents/<documento di P>` P 200 / Q 404; `POST /api/extractions/<id di P>/run` P 409 (`EXTRACTION_BUSY`: già estratta) / Q 404; `/bollette/revisione/<id di P>` P 200 / Q 404. La coppia sul token di upload sta in `extractions-isolation.test.ts` (`authorizeDocumentUpload`): sotto Playwright non c'è un `handleUpload` vero. | Togliere `userId` dalla lettura del documento in `readDocumentFile` → Q riceve 200. |

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite precedente verde; inserimento a mano invariato.
- **B — Cambio di contesto**: `.env.local` con `ANTHROPIC_API_KEY` (chiave dell'organizzazione
  personale, D-2) e `BLOB_READ_WRITE_TOKEN` dello **store di sviluppo**: `vercel env pull
  .env.vercel-dev --environment=development`, poi l'owner copia in `.env.local` la sola riga
  `BLOB_READ_WRITE_TOKEN` e cancella `.env.vercel-dev` (i valori li digita e li copia l'owner, non
  passano dalla chat); `isExtractionConfigured()` vero; `pnpm dev`. Esito atteso: «Carica bolletta»
  compare nelle card della pagina «Casa» di seed A.
- **C — Comportamento nuovo** (con l'OK dell'owner per ogni chiamata reale; effetti dichiarati prima:
  file nello store di sviluppo, righe in `local.db`, **circa 0,30 $ a bolletta, 0,90 $ in tutto**):
  le tre bollette campione di `Downloads\bollette-campione\` (fuori dal repo), caricate con seed A
  dalla UI (in `local.db` seed A si può scrivere: il divieto vale solo per Playwright). Per ognuna
  la pagina si ferma sulla stima: l'owner preme «Estrai (circa X $)» solo dopo l'OK. In revisione si
  sceglie «Crea una nuova fornitura» nella casa di seed A (le forniture seed hanno identificativi
  inventati e bollette che si sovrapporrebbero). Esito atteso dichiarato prima, per ciascuna: tipo
  giusto; totale estratto = totale stampato; avvisi aritmetici assenti o di pochi centesimi; luce:
  letture F1/F2/F3 a due date e il canone TV in «fuori bolletta»; gas: C a 7 decimali, PCS in
  GJ/Smc, le voci del mese precedente con quel periodo e `isRecalculation`, IVA a due aliquote;
  telefono: voce netta + IVA 22% e l'avviso «Importi stampati IVA inclusa». L'owner confronta a
  colpo d'occhio con la bolletta; l'agente legge dal DB modello, token e costo registrati di ogni
  estrazione e li riporta accanto alla stima.
- **D — Sotto la UI** (scrittura su Blob dichiarata, nessuna chiamata a Claude): uno script
  Playwright usa e getta nella cartella temporanea della sessione (mai nel repo) registra su `pnpm
  dev` un utente di prova P (`collaudo-06-<data>@example.test`, password generata e mai stampata),
  crea dalla UI la casa «Casa Collaudo», carica `internet-armadillo.pdf` da `/bollette/carica` e si
  ferma sulla stima (D-42: l'estrazione resta `queued`), poi salva i cookie di P. Esito atteso
  dichiarato prima: `curl` di `/api/documents/<id del documento di P>` con la sessione di seed A →
  404; con quella di P → 200 e il PDF.
- **E — Casi negativi**: un PDF di 41 pagine (generato al volo) → «La bolletta ha più di 40
  pagine.», nessuna chiamata a Claude: sul DB l'estrazione è `failed` con `error_code
  'document_invalid'`, `started_at` e `cost_micro_usd` nulli; un PDF con `/Encrypt` nel trailer
  (generato al volo) → «PDF protetto: carica le foto delle pagine.».
- **F — Giro guidato** (al via dell'owner; D-55: il telefono non si collega al server di sviluppo):
  (1) dal browser del computer, «Scegli PDF o foto» con la foto di una pagina di
  `luce-pellicano.pdf` presa dallo schermo (o un PNG generato): la stima del pulsante è circa
  0,24 $, e «Estrai» parte solo all'OK → la revisione si legge? (2) la revisione del gas su desktop:
  documento e modulo affiancati? E con la finestra stretta sotto i 1024 px, «Apri il PDF» apre il
  documento? (3) «Da rivedere» e il badge: le righe e le azioni sono chiare? Non copre: l'acqua
  (D-21, nessuna bolletta vera), l'import multiplo (07), la coda offline (09), «Scatta foto» dal
  telefono (in produzione, § 8).
- **G — Ripristino**: le bollette campione confermate si **eliminano** dalla UI (file compresi); le
  estrazioni non confermate si scartano; le forniture create in C con l'identificativo vero si
  eliminano; l'utente di prova P si elimina da Impostazioni («Elimina account»: i suoi file se ne
  vanno con lui). Poi una query su `local.db` conferma `result_json` nullo in tutte le estrazioni,
  nessuna fornitura fuori dal seed e nessun utente P; `pnpm documents:prune` sullo store di
  sviluppo → 0 orfani. Restano solo le righe delle estrazioni (costo e stato, senza risultato).

## 8. Messa in esercizio

Ordine (D-41): gate verdi e collaudo § 7 in locale → commit dell'implementazione e PR (stato «implementata il
<data>, branch `feature/06-extraction`» nella riga «Stato» e nell'indice § 5) → migrazione e variabile di produzione → merge
→ collaudo in produzione nella stessa sessione → chiusura: esito nel commit su
`docs/06-in-esercizio` e la sua PR.

- DDL: `drizzle/0002_*.sql` con `pnpm db:migrate:prod` **prima** del merge (dopo la PR).
- Variabili, prima del merge: `vercel env add ANTHROPIC_API_KEY production` (l'owner digita la
  chiave personale; il consiglio in SETUP.md: un limite di spesa mensile sull'organizzazione
  Console); `BLOB_READ_WRITE_TOKEN` è già nel progetto di produzione (05).
- Al push di `feature/06-extraction` il deploy risulta «Canceled» (`vercel ls`): nella 05 il primo
  push di un branch era andato in produzione, forse perché era il primo deploy del progetto
  (`doc/guide/deploy.md` § 4); se succede ancora, è un difetto da fermare qui.
- Merge della PR su `main` (lo fa l'owner) → deploy di produzione; l'agente controlla che il log
  della build sia verde. Nella 05 il deploy del merge era risultato «Canceled» dall'ignore step,
  causa non trovata (`doc/guide/deploy.md` § 4): se succede ancora, `vercel redeploy <url>
  --target production` all'OK dell'owner, e la causa si cerca e si corregge nel commit di chiusura.
- Misura di chiusura in produzione, dopo il merge (D-55): dal telefono, «Scatta foto» delle pagine
  di una bolletta vera dell'owner aperta in digitale sullo schermo del computer → la stima → «Estrai
  (circa X $)» solo all'OK dell'owner, col costo detto prima → revisione leggibile sul telefono →
  «Conferma» → la scheda riapre le foto con «Apri»; la bolletta resta (è un dato vero dell'owner,
  nel suo deploy). L'isolamento in produzione non si riprova qui: le iscrizioni sono chiuse, la 05
  l'ha provato con l'account di collaudo e i test E2E coprono le route nuove.
- Esito, gotchas e stato «in esercizio il <data>, PR #N» della 06 li scrive la chiusura della
  sessione (riga «Stato» di questa spec, indice § 5, CLAUDE.md → Latest, `doc/guide/estrazione.md`
  o AGENTS.md § 11 se ci sono lezioni) in un commit su `docs/06-in-esercizio` (D-41).

## 9. Documentazione

- **`doc/guide/estrazione.md`** (nasce qui, ≤ 400 righe): il flusso (creazione, upload, verifica,
  esecuzione, revisione, conferma, scarto), lo schema e le sentinelle, il prompt e come si
  modifica (un esempio nella forma esatta del documento che fallisce, segnaprezzi § 4.54), costi e
  stima (l'estrazione parte solo al clic), errori e codici, la ripresa dei caricamenti interrotti,
  Blob privato e cancellazioni, `documents:prune`, i fake.
- `AGENTS.md`: § 6 e § 8 esistono dalla pianificazione: si allineano al codice scritto (`signal`,
  formato senza `parse`, clic su «Estrai», limiti dei file) senza duplicarli; § 2.1 e § 2.4 dicono
  che `src/lib/db/maintenance/prune.ts` è l'unico SQL fuori da `repositories/` e l'unica query fra
  utenti oltre a `reference-prices.ts`, usata solo da `documents:prune`; § 2.3 nomina già
  `NEXT_PUBLIC_E2E_FAKE_SERVICES` fra le variabili lette in modo letterale: si verifica; § 11
  Gotchas nuove con la data.
- `CLAUDE.md`: Latest; § Key Features e § Data & Integrations hanno già l'estrazione, Anthropic e
  Blob: si verifica che dicano lo stesso del codice; § Not yet present ha già bollette «dual»,
  prompt caching e acqua non provata: si controlla che dicano lo stesso.
- `SETUP.md`: sezione *Anthropic API key* (organizzazione propria, limite di spesa) e *Development
  file store* (`vercel env pull .env.vercel-dev --environment=development`, copia della sola riga
  `BLOB_READ_WRITE_TOKEN` in `.env.local`, cancellazione di `.env.vercel-dev`); in *Updating*,
  `pnpm documents:prune -- --prod` con la terza riga facoltativa `BLOB_READ_WRITE_TOKEN` di
  `.env.turso-prod` (il token dello store di produzione, che l'owner aggiunge solo per lanciare
  `documents:prune -- --prod`).
- `README.md`: § What it does (PDF e foto, revisione, file conservati), nota privacy: i file vanno
  ad Anthropic per l'estrazione e restano nello store privato del proprio deploy.
- `.env.example`: le due variabili nuove.

## 10. Fuori ambito, dichiarato

- Più bollette in coda e la stima prima di partire → **07**.
- Caricamenti senza rete → **09**.
- Bollette con più forniture nello stesso documento, prompt caching, estrazione delle autoletture da
  foto del contatore (scartata da D-28) → CLAUDE.md § Not yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **L** (due servizi esterni, schema, prompt, UI, E2E).

```
Ciao, in questa sessione implemento la spec doc/v1/06-caricamento-su-blob-ed-estrazione-con-claude.md.

Prima di tutto (`git branch --show-current` deve dire main, aggiornato con `git pull`): crea il
branch feature/06-extraction e SESSION_NOTES.md.

Contesto, prima di toccare qualsiasi altro file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), DESIGN.md, doc/guide/calcoli.md,
  doc/guide/app.md, doc/guide/deploy.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Carica la skill claude-api PRIMA di scrivere anthropic-extractor.ts e usa solo le forme che
  documenta o che la spec cita dall'SDK (formato senza `parse`, `signal`)
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 06 INTERA
- Controlla con un grep che i contratti C-1…C-14, C-18, C-21…C-24 esistano con i nomi e le firme
  dell'indice

Implementa la spec 06 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo in locale (fase per fase, esito atteso prima; ogni
chiamata reale a Claude parte solo al mio OK sul pulsante «Estrai», con il costo detto prima), § 8
la messa in esercizio (migrazione di produzione prima del merge, ANTHROPIC_API_KEY su Vercel
digitata da me, misura di chiusura dal telefono dopo il merge), § 9 la documentazione. Non decidere
nulla che la spec ha già deciso; se trovi un punto che la spec non copre, fermati e chiedimelo con
AskUserQuestion. Le etichette della serie non entrano nel codice. Le bollette vere non entrano mai
nel repo.

Ordine della chiusura: riassumi il diff; scrivi lo stato «implementata il <data>, branch `feature/06-extraction`» nella riga
«Stato» della spec e in § 5 dell'indice, aggiorna CLAUDE.md → Latest; chiedimi l'OK per il commit
dell'implementazione e apri la PR (il deploy del branch deve risultare «Canceled»); migrazione e
variabile di produzione; merge (lo faccio io; la build di main deve partire da sola); collaudo in
produzione con me; poi la chiusura della sessione: esito, gotchas e stato «in esercizio» nei loro
posti, commit su docs/06-in-esercizio e PR (D-41).
```
