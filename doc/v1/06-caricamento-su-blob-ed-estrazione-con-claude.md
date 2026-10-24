# 06 — Caricamento su Blob ed estrazione con Claude

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/06-extraction` da `main`. **Dipende da**: 05 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-2, D-6, D-7, D-9, D-15, D-16, D-17, D-19,
> D-20, D-21, D-40; scelte T-2, T-11, T-17…T-23, T-33, T-34; contratti C-1 (variabili nuove), C-2
> (`documents`, `extractions`), C-5 (codici nuovi), C-16, C-17, C-18 — li crea o li estende; usa
> C-6…C-14.

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
   fino a 2.576 px di lato lungo e 4.784 token; output strutturato senza vincoli numerici e con al
   massimo **16 parametri a tipo unione**; `temperature` → 400; con `max_tokens` oltre ~21.333 l'SDK
   pretende lo streaming. Nei tipi pubblicati dell'SDK `@anthropic-ai/sdk@1.3.0` (letti il
   2026-10-24): `client.beta.messages.stream(params, options)` → `finalMessage()` restituisce un
   `ParsedBetaMessage` con `parsed_output`, `stop_reason`, `stop_details: BetaRefusalStopDetails |
   null`, `usage.input_tokens`/`output_tokens`, `model`; `fallbacks?: Array<…> | 'default'`;
   `betaZodOutputFormat` in `@anthropic-ai/sdk/helpers/beta/zod` (il suo `parse` lancia un
   `AnthropicError` «Failed to parse structured output» se il JSON non rispetta lo schema); classi
   di errore `APIError`, `APIConnectionError`, `APIConnectionTimeoutError`, `RateLimitError`,
   `InternalServerError`, `AnthropicError`, esportate anche come proprietà statiche di `Anthropic`.
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
| A1 | `/bollette/carica`: scelta della fornitura (facoltativa: «Riconosci dalla bolletta»), un PDF ≤ 10 MB oppure foto (pulsante «Scatta foto» con `capture="environment"` e «Scegli foto»), anteprima delle pagine con ordine e rimozione; le foto si convertono in JPEG ≤ 2.576 px; poi caricamento, estrazione e passaggio alla revisione. | E2E `estrazione.spec.ts` con il fake. |
| A2 | Il file va dal browser a Blob privato (mai attraverso una function); il server verifica esistenza, dimensione, tipo (magic bytes), SHA-256 e pagine (≤ 40) prima di usarlo. | Unit `verify-document.test.ts`; integrazione `extractions.test.ts`. |
| A3 | Un file già confermato → `DUPLICATE_DOCUMENT` con il link alla bolletta; un file di un'estrazione non scartata → si riapre quella estrazione, senza nuova chiamata. | Integrazione + E2E. |
| A4 | L'estrazione usa esattamente la chiamata di § 4.6 (modello, `fallbacks`, effort, `max_tokens`, schema); rifiuto, troncamento, output non valido, errore di rete o del servizio e scadenza diventano `failed` con un codice e un messaggio italiano; nessun retry automatico. | Unit `anthropic-extractor.test.ts` con un client finto. |
| A5 | Ogni estrazione registra modello, token e costo in micro-dollari; Impostazioni mostra la spesa del mese di calendario. | Integrazione; E2E. |
| A6 | `/bollette/revisione/[id]`: il documento (PDF o foto) accanto a `BillForm` precompilato da `toBillInput`; fornitura riconosciuta dall'identificativo o da scegliere/creare; avvisi aritmetici e di sovrapposizione; «Conferma» salva con `confirmBill` (`source: 'extraction'`) e lega i file alla bolletta; «Scarta» cancella i file (riga prima, file dopo) e tiene la riga dell'estrazione per il costo. | E2E; integrazione. |
| A7 | `/bollette/da-rivedere` elenca le estrazioni in coda, in corso, estratte e fallite, con «Rivedi», «Riprova», «Scarta»; la voce «Bollette» della navigazione mostra il numero delle estratte da rivedere. | E2E. |
| A8 | Scheda della bolletta: sezione «Documenti» con «Apri» (nuova scheda, `/api/documents/[id]`) e «Allega il file» (stesso caricamento, nessuna estrazione). | E2E. |
| A9 | Cancellare una bolletta, una fornitura o una casa cancella i file su Blob; «Elimina account» cancella tutti i file dell'utente. | Integrazione con il fake Blob; collaudo § 7 sullo store di sviluppo. |
| A10 | Isolamento: seed A non apre `/api/documents/<id di B>` (404), non esegue né rivede un'estrazione di B, non ottiene un token di upload per un documento di B. | E2E `isolamento.spec.ts` esteso; integrazione. |
| A11 | Le tre bollette campione dell'owner (luce, gas, telefono) estratte davvero nel collaudo, con il costo detto prima, danno totali uguali a quelli stampati e le voci di ricalcolo del gas nel mese precedente. | Collaudo § 7 C (con l'OK dell'owner). |

## 3. Decisioni

- **D-2** (chiave personale), **D-6** (file conservato, niente codici), **D-7** (conferma),
  **D-9** (fotocamera), **D-15** (Opus 5.5), **D-16** (fallback lato server), **D-17** (nessun
  tetto, costo registrato), **D-19** (allegato senza estrazione), **D-20** (storico ignorato),
  **D-21** (acqua non provata su una bolletta vera), **D-40** (file cancellati con l'account).
- **T-2** (store di sviluppo), **T-11** (SHA-256), **T-17** (container e fake), **T-18**
  (chiamata), **T-19** (schema senza nullable), **T-20** (foto e PDF), **T-21** (upload dal
  client), **T-22** (route handler), **T-23** (stima), **T-33** (identificativo), **T-34**.
- Adottate qui, ribaltabili:
  (a) `ANTHROPIC_API_KEY` e `BLOB_READ_WRITE_TOKEN` **facoltative** nello schema dell'ambiente: senza
  la chiave l'app funziona e il caricamento risponde `EXTRACTION_UNAVAILABLE` («Estrazione non
  configurata su questa installazione»); senza il token Blob il caricamento è nascosto;
  (b) la fornitura si riconosce **solo** dall'identificativo normalizzato o dalla scelta fatta prima
  del caricamento; mai «l'unica luce che c'è»;
  (c) se il documento contiene più forniture (bolletta «dual»), si estrae solo la prima e lo si
  dice negli avvisi (CLAUDE.md § Not yet present per il resto);
  (d) **niente prompt caching** (risparmio di circa 1,5 cent a bolletta; CLAUDE.md § Not yet
  present);
  (e) il costo con un fallback si calcola con il prezzo del modello di `response.model` per tutti
  i token; un modello assente dal listino si prezza come `claude-opus-5` (il più caro dei
  fallback noti) e lo si scrive nel log;
  (f) un'estrazione `running` da più di 6 minuti si può rieseguire (la function è morta);
  (g) le estrazioni scartate restano come righe (per la spesa del mese) senza file né risultato;
  (h) nel caricamento singolo l'estrazione parte da sola appena i file sono verificati; la stima
  del costo si mostra durante l'attesa («circa 0,30 $»);
  (i) `documents:prune` cancella anche le estrazioni rimaste `uploading` da più di 24 ore con i
  loro file.

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
organization; extraction is disabled without it») e `BLOB_READ_WRITE_TOKEN=""` («`vercel env pull
.env.local --environment=development` fills it from the development store»). Il client usa
`NEXT_PUBLIC_E2E_FAKE_SERVICES` (impostata a `'1'` dal `webServer` di Playwright **al momento della
build**) per scegliere il caricamento finto.

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
  `getBlobStore().deleteDocuments(documentPathnames)` (riga prima, file dopo: un file orfano si
  recupera con `documents:prune`, una riga senza file no — segnaprezzi § 4.59); un errore di Blob
  si scrive nel log e non annulla la cancellazione.
- `deleteAllUserData`: `documents` ed `extractions` (in quest'ordine) prima di `meter_readings`.
- `src/lib/auth/auth.ts` passa `afterUserDeleted: (userId) => getBlobStore().deleteUserDocuments(userId)`.

### 4.3 Errori (C-5)

`DomainErrorCode` aggiunge, con i messaggi:

```ts
DUPLICATE_DOCUMENT: 'Questo file è già stato caricato.',
DOCUMENT_INVALID: 'Il file non è valido.',
EXTRACTION_FAILED: 'Non sono riuscito a leggere la bolletta.',
EXTRACTION_UNAVAILABLE: 'L\'estrazione non è disponibile in questo momento.',
EXTRACTION_BUSY: 'Questa bolletta è già in lavorazione.',
```

`src/lib/http/error-status.ts`: `export const ERROR_STATUS: Record<DomainErrorCode, number>` =
`UNAUTHORIZED 401, NOT_FOUND 404, VALIDATION 400, OVERLAP_DECISION_REQUIRED 409, DUPLICATE_IDENTIFIER
409, DUPLICATE_DOCUMENT 409, DOCUMENT_INVALID 422, EXTRACTION_FAILED 422, EXTRACTION_UNAVAILABLE 503,
EXTRACTION_BUSY 409` e `toErrorResponse(error)` (DomainError → JSON `{ code, message, details }` con
lo status; altro → 500 senza dettagli, con il log). Il `Record` esaustivo fa fallire il typecheck
quando un codice nuovo non ha uno status.

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

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

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
  if (process.env.NEXT_PUBLIC_E2E_FAKE_SERVICES === '1') {
    const response = await fetch(`/api/e2e/blob?pathname=${encodeURIComponent(args.pathname)}`, { method: 'PUT', body: args.file });
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

`src/app/api/e2e/blob/route.ts`: `PUT` che risponde 404 se `!env.E2E_FAKE_SERVICES`, altrimenti
`requireUser()`, verifica che il pathname sia di un documento dell'utente e lo scrive con il disk
store.

`src/app/api/documents/upload/route.ts`:

```ts
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await requireUser();
        const document = await getPendingDocument(getDb(), user.id, clientPayload ?? '');
        if (!document || document.pathname !== pathname) throw new DomainError('NOT_FOUND');
        return {
          allowedContentTypes: [document.contentType],
          maximumSizeInBytes: MAX_DOCUMENT_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: document.id,
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

`getPendingDocument(db, userId, documentId)` (repository `documents.ts`): il documento dell'utente
con `uploadedAt` nullo.

`src/app/api/documents/[id]/route.ts` (`GET`): `requireUser()` → `getDocument(db, user.id, id)` →
404 se manca → `readDocument` → `new Response(bytes, { headers: { 'Content-Type': document.contentType,
'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options':
'nosniff' } })`.

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
```

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
src/lib/domain/types.ts»):

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
  YYYY-MM-DD or "".
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
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BillExtractor, ExtractorDocument, ExtractorOutcome } from './extractor';
import { EXTRACTION_MODEL } from './pricing';
import { buildExtractionInstruction, EXTRACTION_SYSTEM_PROMPT } from './prompt';
import { ExtractionSchema } from './schema';

const MIN_CALL_MS = 30_000;

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
            output_config: { effort: 'high', format: betaZodOutputFormat(ExtractionSchema) },
          },
          { timeout: remainingMs, maxRetries: 0 },
        );
        const message = await stream.finalMessage();
        const usage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
        if (message.stop_reason === 'refusal') {
          const category = message.stop_details?.category ?? 'senza categoria';
          return { ok: false, code: 'refusal', message: `Il modello ha rifiutato la richiesta (${category}).`, usage, model: message.model };
        }
        if (message.stop_reason === 'max_tokens') {
          return { ok: false, code: 'truncated', message: 'La risposta è stata troncata: bolletta troppo lunga.', usage, model: message.model };
        }
        if (!message.parsed_output) {
          return { ok: false, code: 'invalid_output', message: 'Risposta del modello non leggibile.', usage, model: message.model };
        }
        return { ok: true, extraction: message.parsed_output, usage, model: message.model };
      } catch (error) {
        return toFailure(error);
      }
    },
  };
}

function toContentBlock(document: ExtractorDocument) {
  const data = Buffer.from(document.bytes).toString('base64');
  return document.contentType === 'application/pdf'
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } } as const);
}

function toFailure(error: unknown): ExtractorOutcome {
  const failure = (code: 'timeout' | 'unavailable' | 'api_error' | 'invalid_output', message: string): ExtractorOutcome =>
    ({ ok: false, code, message, usage: null, model: null });
  if (error instanceof Anthropic.APIConnectionTimeoutError) return failure('timeout', 'Il modello non ha risposto in tempo.');
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
    return failure('unavailable', 'Il servizio di Anthropic non è disponibile ora: riprova più tardi.');
  }
  if (error instanceof Anthropic.APIError) return failure('api_error', `Errore dell'API (${error.status ?? 'senza stato'}).`);
  // betaZodOutputFormat throws a plain AnthropicError when the JSON does not match the schema.
  if (error instanceof Anthropic.AnthropicError) return failure('invalid_output', 'Risposta del modello non conforme allo schema.');
  throw error;
}
```

`fake-extractor.ts` — `createFakeExtractor(dir)`: calcola lo SHA-256 del primo documento, legge
`<dir>/<sha256>.json`, lo valida con `ExtractionSchema` e risponde `{ ok: true, extraction, usage:
{ inputTokens: 10_000, outputTokens: 5_000 }, model: 'claude-opus-5-5' }`; file mancante →
`{ ok: false, code: 'invalid_output', … }`, tranne quando il primo documento è un JPEG: allora usa
`<dir>/photo-default.json` (le foto dei test si generano al volo e non hanno uno SHA noto). Un file
`<sha256>.json` con `{ "fail": "<code>" }` produce quel fallimento (serve all'E2E di «Riprova»).

`validate.ts` — `validateExtraction(extraction): string[]` (pura): `isBill` falso → `['not_a_bill']`
gestito a parte; periodo della bolletta con date valide (`isIsoDate`) e inizio ≤ fine; ogni data non
vuota di voci e letture valida; almeno una voce; `quantityUnit === 'none'` ⇔ `quantity === 0`.
Ogni violazione è una frase italiana.

`to-bill-input.ts` (C-17):

```ts
export interface ToBillInputContext {
  supplies: Array<{ id: string; kind: SupplyKind; identifier: string | null; archivedAt: number | null }>;
  preselectedSupplyId: string | null;
}

export interface ReviewDraft {
  input: BillInput;                 // supplyId is '' when no supply matched
  matchedSupplyId: string | null;
  suggestedSupply: { kind: SupplyKind; supplierName: string | null; identifier: string | null } | null;
  warnings: string[];
}

export function toBillInput(extraction: Extraction, context: ToBillInputContext): ReviewDraft;
```

Regole: `''` → `null` per date, nomi e identificativo; voce con periodo vuoto → periodo della
bolletta; `quantityUnit 'none'` → `quantity: null, quantityUnit: null`; `unitPriceMicros 0` →
`null`; `band 'none'` → `null`; `vatRatePercent < 0` → `null`, altrimenti
`Math.round(percent * 100)` punti base; `conversionFactor`/`calorificValueGj` `0` → `null` (e
`null` se il tipo non è gas); letture `actual` → `bill_actual`, `estimated` → `bill_estimated`;
`isEstimated` della bolletta = `consumptionEstimated`; `overlapDecision: null`. Fornitura:
`preselectedSupplyId` se è fra `supplies`; altrimenti la fornitura (anche archiviata) con
`identifier === normalizeSupplyIdentifier(extraction.supplyIdentifier)` e lo stesso tipo; altrimenti
nessuna, con `suggestedSupply` dai dati estratti (`supplyKind 'other'` → nessun suggerimento e
l'avviso «Tipo di utenza non riconosciuto»). Se la fornitura preselezionata ha un tipo diverso da
quello estratto, l'avviso «Il documento sembra una bolletta di <tipo>». Gli `warnings` del modello
passano in coda.

### 4.7 Verifica dei file — `src/lib/extraction/verify-document.ts`

```ts
export interface VerifiedDocument {
  pageCount: number | null;
}

/** Check a stored file against what the browser declared, before anyone uses it. */
export async function verifyDocument(bytes: Uint8Array, declared: { contentType: DocumentContentType; sha256: string; sizeBytes: number }): Promise<VerifiedDocument>;
```

Regole, ogni violazione → `DomainError('DOCUMENT_INVALID', <messaggio>)`: dimensione ≤
`MAX_DOCUMENT_BYTES` e uguale a quella dichiarata; magic bytes `%PDF-` per il PDF, `FF D8 FF` per il
JPEG; SHA-256 (`node:crypto`) uguale al dichiarato; PDF: `getDocumentProxy(bytes)` di `unpdf` →
`numPages` ≤ 40 («La bolletta ha più di 40 pagine.»); un PDF cifrato o illeggibile → «PDF protetto o
danneggiato.»; JPEG: `pageCount = null`.

### 4.8 Servizi — `src/lib/services/extractions.ts` (C-17)

Tutti `(db, userId, …, deps)` con `deps` esplicite (`blob`, `extractor`, `now`, `clock`).

- `createExtraction(db, userId, input, deps: { now })` con
  `input = { supplyId: string | null; batchId: string | null; files: Array<{ sha256; contentType; sizeBytes }> }`:
  1–10 file; un PDF solo da solo; dimensioni ≤ 10 MB; tipi `application/pdf`/`image/jpeg`
  (`VALIDATION`); fornitura dell'utente se data (`NOT_FOUND`). Doppioni per `sha256` fra i documenti
  dell'utente: legato a una bolletta → `DUPLICATE_DOCUMENT` con `details: { billId }`; legato a
  un'estrazione non `discarded` → restituisce `{ duplicateOf: extractionId }` senza creare nulla.
  Altrimenti, in un batch, una riga `extractions` (`uploading`) e una `documents` per file
  (`position` = indice, `pathname` = `documentPathname`). Restituisce
  `{ extractionId, documents: [{ documentId, pathname, contentType }] }`.
- `createAttachment(db, userId, input: { billId; files })`: come sopra ma senza estrazione: i
  documenti hanno `billId`; doppione legato a qualsiasi cosa → `DUPLICATE_DOCUMENT`.
- `markExtractionUploaded(db, userId, extractionId, deps: { blob })`: estrazione `uploading`
  dell'utente (`NOT_FOUND` altrimenti); per ogni documento `readDocument` (`null` →
  `DOCUMENT_INVALID` «File non arrivato.») e `verifyDocument`; salva `pageCount` e `uploadedAt`;
  stato `queued`. Un `DOCUMENT_INVALID` porta l'estrazione a `failed` con `errorCode
  'document_invalid'` e lo rilancia. Restituisce `{ pdfPages, photos, estimatedCostMicroUsd }`.
- `markAttachmentUploaded(db, userId, billId, documentIds, deps: { blob })`: stessa verifica per i
  documenti allegati.
- `runExtraction(db, userId, extractionId, deps: { blob, extractor, now, clock })`:
  1. presa atomica: `UPDATE extractions SET status='running', started_at=:now, error_code=NULL,
     error_message=NULL WHERE id=:id AND user_id=:userId AND (status IN ('queued','failed') OR
     (status='running' AND started_at < :now - 360000)) RETURNING *` (con `failed` solo se
     `error_code != 'document_invalid'`); nessuna riga → `NOT_FOUND` se l'estrazione non è
     dell'utente, `EXTRACTION_BUSY` altrimenti;
  2. legge i documenti in ordine di `position` (`readDocument`);
  3. `extractor.extract({ documents, today: romeToday(now), expectedKind: tipo della fornitura
     preselezionata o null, deadlineMs: now + 280_000 })`;
  4. con `usage`: `model`, token e `costMicroUsd` (sempre, anche sui fallimenti);
  5. `ok` e `isBill` falso → `failed` con `not_a_bill` («Il documento non sembra una bolletta.»);
     `ok` e `validateExtraction` con errori → `failed` con `invalid_output` e le frasi unite;
     `ok` → `extracted` con `resultJson`; non `ok` → `failed` con codice e messaggio;
  6. `finishedAt = clock()`; restituisce la riga.
- `getExtractionReview(db, userId, extractionId)`: estrazione `extracted` dell'utente → `{
  extraction, documents, draft: toBillInput(...), supplies, houses }`; altrimenti `NOT_FOUND`.
- `confirmExtraction(db, userId, extractionId, payload: { input: unknown; newSupply: { houseId;
  label; supplierName; identifier; hasPhotovoltaic } | null })`: estrazione `extracted` dell'utente;
  con `newSupply` → `createSupply` (tipo = `supplyKind` estratto) e `input.supplyId` = la nuova;
  `confirmBill(db, userId, input, { source: 'extraction' })`; se `confirmBill` lancia e la fornitura
  è stata creata ora → `deleteSupply` e rilancia; poi batch: `documents.bill_id` = bolletta per i
  documenti dell'estrazione, estrazione `confirmed` con `billId`. Restituisce `{ billId }`.
- `discardExtraction(db, userId, extractionId, deps: { blob })`: estrazione dell'utente non
  `confirmed`; batch: cancella i suoi documenti, stato `discarded`, `resultJson = NULL`; poi
  `deleteDocuments` dei pathname.
- `listPendingExtractions(db, userId)`: stati `queued`, `running`, `extracted`, `failed`, dal più
  vecchio; `countExtractedToReview(db, userId)`.
- `monthlyExtractionSpend(db, userId, month: MonthKey)`: somma di `costMicroUsd` e numero delle
  estrazioni con `startedAt` nel mese di Roma (`romeToday(startedAt).slice(0, 7) === month`).

Repository nuovi (C-12): `documents.ts` (`insertDocumentsQuery`, `getDocument`, `getPendingDocument`,
`listDocumentsOfExtraction`, `listDocumentsOfBill`, `findDocumentBySha256`, `updateDocumentQuery`,
`linkDocumentsToBillQuery`, `deleteDocumentsOfExtractionQuery`, `deleteDocumentsOfBillsQuery`,
`listDocumentPathnamesOfBills`), `extractions.ts` (`insertExtractionQuery`, `getExtraction`,
`claimExtractionForRun`, `updateExtractionQuery`, `listExtractions`, `clearBillOfExtractionsQuery`,
`clearSupplyOfExtractionsQuery`). Tutti `(db, userId, …)`.

### 4.9 Route (T-22)

| Metodo e rotta | Corpo | Servizio | Risposta |
|---|---|---|---|
| `POST /api/extractions` | `{ supplyId, batchId, files }` (zod) | `createExtraction` | 201 `{ extractionId, documents }` o 200 `{ duplicateOf }` |
| `POST /api/extractions/[id]/uploaded` | — | `markExtractionUploaded` | 200 `{ pdfPages, photos, estimatedCostMicroUsd }` |
| `POST /api/extractions/[id]/run` | — | `runExtraction` (`export const maxDuration = 300`) | 200 `{ status, errorCode, errorMessage }` |
| `POST /api/bills/[id]/documents` | `{ files }` | `createAttachment` | 201 `{ documents }` |
| `POST /api/bills/[id]/documents/uploaded` | `{ documentIds }` | `markAttachmentUploaded` | 200 |
| `POST /api/documents/upload` | protocollo di `handleUpload` | — | § 4.4 |
| `GET /api/documents/[id]` | — | `getDocument` | il file |
| `PUT /api/e2e/blob` | il file | solo con `E2E_FAKE_SERVICES` | 204 |

Ogni route: `requireUser()` per prima cosa, zod sul corpo, errori con `toErrorResponse`. Le azioni
della revisione (`confirmExtractionAction`, `discardExtractionAction`) sono Server Action in
`src/app/(app)/bollette/revisione/[id]/actions.ts`.

### 4.10 Interfaccia

- **`src/components/upload/bill-uploader.tsx`** (client, C-16 lato UI): props `{ mode: 'extract' |
  'attach'; billId?: string; supplies; preselectedSupplyId?: string }`. Due ingressi: «Scegli PDF o
  foto» (`accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"`, `multiple`) e
  «Scatta foto» (`accept="image/*" capture="environment"`); un PDF esclude le foto e viceversa
  (messaggio chiaro). Le foto passano da `compressPhoto` e compaiono come miniature numerate con
  «Su», «Giù», «Rimuovi» (massimo 10). Pulsante «Carica» → SHA-256 nel browser
  (`crypto.subtle.digest`) → `POST /api/extractions` (o `/api/bills/[id]/documents`) →
  `uploadDocumentFile` per ogni file (in ordine) → `…/uploaded` → in modalità `extract` mostra
  «Estrazione in corso… (costo stimato circa X $)» e chiama `…/run`; `extracted` →
  `router.push('/bollette/revisione/<id>')`; `failed` → il messaggio con «Riprova», «Inserisci a
  mano» (`/bollette/nuova?fornitura=…`) e «Scarta»; `duplicateOf` → `router.push` alla revisione di
  quell'estrazione; `DUPLICATE_DOCUMENT` → «Questo file è già nella bolletta del …» con il link.
- **`src/lib/upload/compress-photo.ts`** (client): `createImageBitmap(file, { imageOrientation:
  'from-image' })`; lato lungo ridotto a 2.576 px se più grande; `canvas.toBlob(…, 'image/jpeg',
  0.85)`; se `createImageBitmap` fallisce → «Formato immagine non supportato: usa JPEG o PNG.».
- **`/bollette/carica`**: titolo «Carica una bolletta», select della fornitura (prima voce
  «Riconosci dalla bolletta»; `?fornitura=` la preseleziona), `BillUploader mode="extract"`. Se
  `!isExtractionConfigured()` la pagina spiega «Estrazione non configurata su questa installazione»
  e offre solo l'inserimento a mano. Il riepilogo «Casa» (03) e la scheda della fornitura aggiungono
  il pulsante «Carica bolletta» accanto a «Nuova bolletta».
- **`/bollette/revisione/[id]`**: due colonne da 1024 px (documento a sinistra, modulo a destra),
  una sopra l'altra su mobile (documento in un riquadro richiudibile). Documento: PDF in `<iframe
  src="/api/documents/<id>">` con il link «Apri in una nuova scheda»; foto come `<img>` in
  sequenza. In cima gli avvisi di `draft.warnings`. Se `matchedSupplyId` è nullo: «A quale fornitura
  appartiene?» con le forniture dello stesso tipo e «Crea una nuova fornitura» (casa, etichetta
  default `KIND_LABELS[kind]`, fornitore e identificativo precompilati, fotovoltaico per la luce).
  Poi `BillForm` con `initialValue = draft.input`, `overlaps` calcolate dal server per la fornitura
  scelta, `submitLabel="Conferma"`; un secondo pulsante «Scarta».
- **`/bollette/da-rivedere`**: elenco di `listPendingExtractions`: data, fornitura (o «da
  assegnare»), stato in italiano («in coda», «in corso», «da rivedere», «fallita: <messaggio>»),
  azioni «Rivedi» (estratte), «Riprova» (fallite non `document_invalid`), «Scarta». La `NavBar`
  mostra sul tab «Bollette» il numero di `countExtractedToReview` (badge con `aria-label`).
- **Scheda della bolletta**: sezione «Documenti» (per ogni documento «Pagina N» o «PDF, N pagine» e
  «Apri») e `BillUploader mode="attach"`.
- **Impostazioni**: sezione «Estrazioni con Claude»: «Questo mese: X $ in N estrazioni» (`formatUsd`),
  il modello in uso.

### 4.11 Script

- `scripts/make-bill-fixtures.ts` (`pnpm fixture:bills`): scrive **PDF minimi fatti a mano** (nessuna
  dipendenza: oggetti Catalog, Pages, una Page per blocco di 50 righe, font Helvetica, flusso di
  testo con `BT /F1 10 Tf 40 800 Td 13 TL (…) ' … ET`, tabella `xref` con gli offset calcolati) in
  `tests/fixtures/bills/`: `luce-fenicottero.pdf` (mensile, letture F1/F2/F3, canone TV fuori
  totale), `gas-fenicottero.pdf` (settembre con il blocco di agosto rifatturato con le voci di
  ricalcolo, C e PCS), `acqua-ornitorinco.pdf` (trimestrale, scaglioni, fognatura, depurazione,
  UI), `internet-quokka.pdf` (canone IVA inclusa); tutte con fornitori e numeri inventati e tondi,
  nessun indirizzo. Per ognuna scrive anche l'estrazione attesa in
  `tests/fixtures/extractions/<sha256>.json` (costruita da un oggetto TypeScript nello script e
  validata con `ExtractionSchema`); in più `luce-fenicottero-rotta.pdf` (la stessa luce con un'altra
  data di emissione, quindi un altro SHA) con `tests/fixtures/extractions/<sha256>.json` =
  `{ "fail": "unavailable" }`, e `tests/fixtures/extractions/photo-default.json` (l'estrazione
  dell'internet). Stessi byte a ogni esecuzione.
- `scripts/prune-documents.ts` (`pnpm documents:prune [-- --delete] [-- --force]`): legge le
  variabili come gli altri script (`EnvSchema`), stampa **quale database e quale store** confronta
  (host del DB e prefisso del token), elenca i pathname sotto `users/` senza riga in `documents` e le
  estrazioni `uploading` più vecchie di 24 ore; senza `--delete` è una prova a secco; rifiuta di
  cancellare se il DB non ha nessun documento e manca `--force` (segnaprezzi § 4.61: mai accoppiare
  un DB locale con lo store di produzione).

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che `@anthropic-ai/sdk` si importa solo in
  `anthropic-extractor.ts` e `@vercel/blob` (lato server) solo in `vercel-blob-store.ts`; i servizi
  ricevono `blob` ed `extractor` come dipendenze; le route li prendono dal container.
- **AGENTS.md § 2.3 Secrets** — `ANTHROPIC_API_KEY` e `BLOB_READ_WRITE_TOKEN` mai nel client né nei
  log; `NEXT_PUBLIC_E2E_FAKE_SERVICES` è l'unica variabile pubblica e vale solo nelle build di
  Playwright.
- **AGENTS.md § 2.4 Isolation** — il token di upload si genera solo per un documento dell'utente in
  attesa; `GET /api/documents/[id]` legge il documento con `userId`; l'estrazione si prende con
  `user_id` nel `WHERE` atomico.
- **AGENTS.md § 2.6 Foreign keys** — `documents` ed `extractions` in `deleteAllUserData`; riga prima,
  file dopo.
- **AGENTS.md § 6 Claude** (nasce qui): un'estrazione = una chiamata; niente `temperature`, niente
  prefill, niente `tool_choice` forzato; `max_tokens` 32.000 con streaming; timeout dalla scadenza;
  nessun retry automatico; costo sempre registrato; il prompt non chiede ragionamenti scritti nello
  schema (rifiuti `reasoning_extraction`).
- Vercel: body 4,5 MB → mai file attraverso una function; `maxDuration = 300` dichiarato sulla
  route di esecuzione; 280 s di scadenza interna.
- Blob Hobby: 2.000 operazioni avanzate al mese (upload, list) e 10.000 semplici (letture); oltre,
  Blob si blocca per 30 giorni: `documents:prune` non si lancia in un ciclo, e la pagina «da
  rivedere» non legge i file.
- iOS Safari: `capture` apre la fotocamera; HEIC dalla galleria arriva come JPEG nella maggior parte
  dei casi, altrimenti `createImageBitmap` fallisce e il messaggio lo dice.
- I PDF campione dell'owner **non entrano mai** nel repo né nei test: le fixture sono generate.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `schema.test.ts`: lo schema JSON generato da `ExtractionSchema` (`z.toJSONSchema`) non contiene `anyOf`, `oneOf`, `type` a lista, `minimum`, `maximum`; ogni estrazione di `tests/fixtures/extractions/*.json` (tranne i `fail`) passa lo schema. | Rendere `offerName` nullable → compare un `anyOf` e il test fallisce. |
| Unit | `to-bill-input.test.ts`: estrazione del gas → voci di agosto col periodo di agosto e `isRecalculation`, voci di settembre col periodo della bolletta, `0` → `null` per C mancante sulla luce, letture `bill_actual`; identificativo `IT 001 E00000001` riconosce la fornitura `IT001E00000001`; preselezione di tipo diverso → avviso; `supplyKind 'other'` → nessun suggerimento. | Usare il periodo della bolletta anche per i blocchi con un periodo → agosto sparisce. |
| Unit | `anthropic-extractor.test.ts` con un `client` finto che espone `beta.messages.stream()` → `{ finalMessage }`: la richiesta ha `model 'claude-opus-5-5'`, `max_tokens 32000`, `betas ['server-side-fallback-2026-07-01']`, `fallbacks 'default'`, `output_config.effort 'high'`, nessuna `temperature`, il blocco `document` prima del testo; `stop_reason 'refusal'` con categoria `cyber` → `refusal` col testo «(cyber)»; `max_tokens` → `truncated`; un `RateLimitError` → `unavailable`; un `AnthropicError` semplice → `invalid_output`; scadenza a 10 s → `timeout` senza chiamata. | Aggiungere `temperature: 0` → l'asserzione «nessuna temperature» fallisce. |
| Unit | `pricing.test.ts`: `costMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, 'claude-opus-5-5') === 4_000_000`; modello ignoto → prezzo di `claude-opus-5`; `estimateExtractionCost({ pdfPages: 8, photos: 0 }) === 312_000`. | Invertire input e output → 20.000.000. |
| Unit | `verify-document.test.ts`: PDF delle fixture → `pageCount` giusto; byte alterati → SHA diverso; JPEG con intestazione PDF → `DOCUMENT_INVALID`; 11 MB → `DOCUMENT_INVALID`. | Saltare il controllo SHA → il caso alterato passa. |
| Unit | `validate.test.ts`: periodo invertito, data `2026-02-30`, zero voci, `quantityUnit none` con quantità 5 → errori. | — (ogni caso è un ramo). |
| Integrazione | `extractions.test.ts` (fake Blob su cartella temporanea, fake extractor): creazione → upload simulato → `markExtractionUploaded` → `runExtraction` → `extracted` con costo; secondo `runExtraction` concorrente → `EXTRACTION_BUSY`; `confirmExtraction` con `newSupply` → bolletta e fornitura, documenti legati; `confirmBill` che fallisce (sovrapposizione senza decisione) → la fornitura nuova non resta; `discardExtraction` → riga `discarded`, documenti e file spariti; doppione confermato → `DUPLICATE_DOCUMENT`; doppione non confermato → `duplicateOf`; utente B su estrazione di A → `NOT_FOUND`; `deleteBill` → `documentPathnames` pieno; `deleteAllUserData` con documenti ed estrazioni → nessun errore. | Togliere `user_id` dal `WHERE` della presa → B esegue l'estrazione di A. |
| Integrazione | `monthly-spend.test.ts`: due estrazioni in ottobre e una a settembre (orari di confine a mezzanotte di Roma) → la somma di ottobre. | Usare il mese UTC → l'estrazione delle 00:30 del 1° finisce nel mese sbagliato. |
| E2E | `estrazione.spec.ts` (seed A, fake): carica `luce-fenicottero.pdf` con «Riconosci dalla bolletta» → revisione con la fornitura «Luce» riconosciuta dall'identificativo, il PDF nell'iframe, avvisi assenti → «Conferma» → scheda con i documenti; ricarica dello stesso file → messaggio di doppione con il link; `gas-fenicottero.pdf` → agosto con le voci di ricalcolo; `luce-fenicottero-rotta.pdf` → «fallita» con «Riprova»; «Scarta» → sparisce da «da rivedere»; una foto PNG generata nel test con un `<canvas>` e caricata con «Scegli PDF o foto» → convertita in JPEG, revisione con l'estrazione di `photo-default.json`; badge sul tab «Bollette»; Impostazioni → spesa del mese > 0. | Saltare `linkDocumentsToBillQuery` → la scheda non ha documenti. |
| E2E | `isolamento.spec.ts` esteso: seed A → `GET /api/documents/<id di B>` 404 (B 200); `POST /api/extractions/<id di B>/run` 404; `/bollette/revisione/<id di B>` 404; `POST /api/documents/upload` con `clientPayload` di un documento di B → errore. | Togliere `userId` da `getDocument` → A scarica il file di B. |

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite precedente verde; inserimento a mano invariato.
- **B — Cambio di contesto**: `.env.local` con `ANTHROPIC_API_KEY` (chiave dell'organizzazione
  personale, D-2) e `BLOB_READ_WRITE_TOKEN` dello **store di sviluppo** (`vercel env pull .env.local
  --environment=development`); `isExtractionConfigured()` vero; `pnpm dev`.
- **C — Comportamento nuovo** (con l'OK dell'owner per ogni chiamata reale; costo dichiarato prima:
  **circa 0,30 $ a bolletta, 0,90 $ in tutto**): le tre bollette campione di
  `Downloads\bollette-campione\` (fuori dal repo), caricate con seed A dalla UI. Esito atteso
  dichiarato prima, per ciascuna: tipo giusto; totale estratto = totale stampato; avvisi aritmetici
  assenti o di pochi centesimi; luce: letture F1/F2/F3 a due date e il canone TV in «fuori
  bolletta»; gas: C a 7 decimali, PCS in GJ/Smc, le voci del mese precedente con quel periodo e
  `isRecalculation`, IVA a due aliquote; telefono: voce netta + IVA 22% e l'avviso «Importi
  stampati IVA inclusa». L'owner confronta a colpo d'occhio con la bolletta; l'agente legge dal DB
  il costo registrato di ogni estrazione e lo riporta.
- **D — Sotto la UI**: `curl` con la sessione di seed A su `/api/documents/<id>` di un documento di
  seed B → 404.
- **E — Casi negativi**: un PDF di 41 pagine (generato al volo) → «La bolletta ha più di 40
  pagine.», nessuna chiamata a Claude (costo 0 registrato).
- **F — Giro guidato** (al via dell'owner): (1) dal telefono, sulla rete locale, «Scatta foto» di una
  bolletta di carta qualsiasi dell'owner (resta nello store di sviluppo, cancellata in G) → la
  revisione si legge? (2) la revisione del gas su desktop: documento e modulo affiancati? (3) «da
  rivedere» e il badge. Non copre: l'acqua (D-21, nessuna bolletta vera), l'import multiplo (07),
  la coda offline (09).
- **G — Ripristino**: le bollette campione confermate si **eliminano** dalla UI (che cancella anche i
  file dallo store di sviluppo); le estrazioni scartate restano come righe senza file;
  `pnpm documents:prune` sullo store di sviluppo → 0 orfani. Nessun dato delle bollette vere resta
  in `local.db` oltre alle righe delle estrazioni (costo e stato, senza risultato).

## 8. Messa in esercizio

- DDL: `drizzle/0002_*.sql` con `pnpm db:migrate:prod` **prima** del merge.
- Variabili: `vercel env add ANTHROPIC_API_KEY production` (l'owner, chiave personale; il
  consiglio in SETUP.md: un limite di spesa mensile sull'organizzazione Console); 
  `BLOB_READ_WRITE_TOKEN` è già nello store di produzione (05).
- Misura di chiusura in produzione: dal telefono, una bolletta vera dell'owner caricata, estratta
  (costo detto prima), confermata e riaperta dalla scheda; la bolletta resta (è un dato vero
  dell'owner, nel suo deploy). L'isolamento in produzione non si riprova qui: le iscrizioni sono
  chiuse, la 05 l'ha provato con l'account di collaudo e i test E2E coprono le route nuove.

## 9. Documentazione

- **`doc/guide/estrazione.md`** (nasce qui, ≤ 400 righe): il flusso (creazione, upload, verifica,
  esecuzione, revisione, conferma, scarto), lo schema e le sentinelle, il prompt e come si
  modifica (un esempio nella forma esatta del documento che fallisce, segnaprezzi § 4.54), costi e
  stima, errori e codici, Blob privato e cancellazioni, `documents:prune`, i fake.
- `AGENTS.md`: § 6 Claude (stub: le regole di § 5 e il rimando alla guida); § 8 Blob (riga prima,
  file dopo; due store); § 11 Gotchas nuove con la data.
- `CLAUDE.md`: Latest; § Key Features (estrazione); § Data & Integrations (Anthropic, Blob); § Not
  yet present: bollette «dual», prompt caching, acqua non provata su una bolletta vera.
- `SETUP.md`: sezione *Anthropic API key* (organizzazione propria, limite di spesa) e *Development
  file store* (`vercel env pull`).
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

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), DESIGN.md, doc/guide/calcoli.md, doc/guide/app.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Carica la skill claude-api PRIMA di scrivere anthropic-extractor.ts e usa solo le forme che
  documenta o che la spec cita dai tipi dell'SDK 1.3.0
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 06 INTERA
- Controlla con un grep che i contratti C-1…C-14 e C-18 esistano con i nomi e le firme dell'indice

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/06-extraction. Crea SESSION_NOTES.md.

Implementa la spec 06 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima; ogni chiamata reale a
Claude parte solo al mio OK, con il costo detto prima), § 9 la documentazione. Non decidere nulla
che la spec ha già deciso; se trovi un punto che la spec non copre, fermati e chiedimelo con
AskUserQuestion. Le etichette della serie non entrano nel codice. Le bollette vere non entrano mai
nel repo.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
