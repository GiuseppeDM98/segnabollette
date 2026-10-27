# 07 — Import multiplo

> **Stato**: scritta 2026-10-24; riletta in modo adversariale il 2026-10-24: 19 rilievi, 2 decisioni
> (D-41, D-57). Implementata il 2026-10-26, branch `feature/07-bulk-import`. In esercizio il
> 2026-10-27, PR #18: collaudo F in produzione su un lotto di 12 bollette della luce (12 estratte,
> 0 fallite, 12 confermate dalla revisione del lotto), costo reale 2,00 $ contro una stima di
> 3,74 $. Per scelta dell'owner le altre bollette passate di una casa non sono passate dall'import:
> lette in locale, controllate con lo schema e i controlli dell'app, confermate dall'owner su una
> tabella in chat e scritte in produzione con `confirmBill` da uno script usa e getta (senza
> file allegati); un'altra casa è rimasta fuori.
> **Branch**: `feature/07-bulk-import` da `main` aggiornato dopo il merge della 06. **Dipende da**: 06
> (ritirata il 2026-10-26).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-7, D-15, D-17, D-18, D-24, D-41, D-42,
> D-57, D-59; scelte T-14, T-17, T-22, T-23; contratti: usa C-4, C-5, C-7, C-8 (`formatUsd` della
> 06), C-14, C-16, C-18, C-22 (`loadProductionTarget`), C-23 (`signUpTestUser`); estende C-1
> (aggiunge `E2E_EXTRACTOR_DELAY_MS`), C-12 (due repository nuovi in `extractions.ts`; riusa
> `listDocumentsOfExtractions` di `documents.ts`), C-17 (servizi nuovi in `extractions.ts` e l'opzione `delayMs` di
> `createFakeExtractor`).

## 1. Il problema oggi (prove)

1. Dopo la 06 una bolletta si carica una alla volta. L'owner ha anni di bollette passate da
   portare dentro (tema: «Un import multiplo carica N bollette in coda (l'import delle mie bollette
   passate lo faremo insieme nella sessione della spec che lo implementa)»).
2. D-18: **coda con la stima del costo prima di partire**, 2 estrazioni in parallelo, ogni bolletta
   in «Da rivedere», confermata una per una (D-7).
3. Su Vercel Hobby non c'è un lavoro in background lungo: una function vive al massimo 300 s
   (indice § 2.3) e il cron è giornaliero. La coda deve quindi essere **guidata dal browser**:
   ogni estrazione è una chiamata a `POST /api/extractions/[id]/run` (06), e lo stato vive nel DB
   (`extractions.status`, `batch_id`), così una pagina chiusa si riprende.
4. Una estrazione con Opus 5.5 dura da decine di secondi a un paio di minuti: 50 bollette con 2 in
   parallelo sono 30–60 minuti con la pagina aperta; sul telefono lo schermo si spegne → la Screen
   Wake Lock API (`navigator.wakeLock.request('screen')`, Chromium e Safari ≥ 16.4) dove c'è.
5. I conguagli e le sovrapposizioni (D-24) si decidono meglio confermando **dalla più vecchia alla
   più recente**.

## 2. Obiettivo e criteri di accettazione

| # | Criterio | Prova |
|---|---|---|
| A1 | `/bollette/importa`: scelta della fornitura (facoltativa; archiviate comprese) e di fino a 50 file (PDF o immagini, gli stessi formati del caricamento singolo: ogni file è una bolletta); un file uguale a un altro della stessa scelta è segnato «doppione di <nome>», un file già confermato «già presente», un file già caricato e non scartato «già caricata»: tutti e tre si saltano. | E2E `import.spec.ts`. |
| A2 | Dopo il caricamento (3 file alla volta) la pagina mostra: numero di bollette, pagine PDF, foto e **costo stimato totale** (`estimateExtractionCost` per estrazione, sommato); nessuna chiamata a Claude prima di «Avvia estrazione». | E2E (sul DB: nessuna estrazione del lotto con `started_at` prima del clic). |
| A3 | «Avvia estrazione» esegue la coda con **2 in parallelo**; ogni riga mostra lo stato («in coda», «in corso», «da rivedere», «fallita: <messaggio>»); un fallimento `unavailable` (servizio giù, limite di frequenza, rete, sessione scaduta, errore 5xx) ferma le partenze con «Anthropic non risponde: riprendi più tardi» e il pulsante «Riprendi». | Unit `queue-runner.test.ts`; E2E variante «pausa». |
| A4 | Chiudendo la pagina a metà, `/bollette/importa` mostra il lotto in «Lotti in sospeso» con «Riprendi (N in coda, circa X $)», dove N = le estrazioni del lotto ancora in coda più le fallite `unavailable`. | Integrazione `batches.test.ts`; E2E variante «ricarica». |
| A5 | `/bollette/da-rivedere?lotto=<id>` elenca le estrazioni del lotto **dalla più vecchia** (inizio periodo estratto); nella revisione di una bolletta del lotto l'unico pulsante del modulo è «Conferma e passa alla prossima» (D-57), che porta alla successiva da rivedere del lotto e, dopo l'ultima, all'elenco del lotto. | E2E. |
| A6 | Con la Wake Lock disponibile, lo schermo resta acceso mentre la coda gira e la si rilascia alla fine. | Unit `use-wake-lock.dom.test.ts` con un `navigator.wakeLock` finto. |
| A7 | Le bollette passate dell'owner sono importate in produzione **dopo il merge**, con la stima detta prima e confermata dall'owner. | Collaudo § 7 F. |
| A8 | Isolamento: i lotti, le righe di un lotto, la prossima da rivedere e le forniture dell'importatore sono solo dell'utente; il `?lotto=` di un altro utente dà un elenco vuoto. | Integrazione `batches.test.ts`; E2E `isolamento.spec.ts`. |
| A9 | `/bollette/importa` e l'elenco di un lotto senza violazioni axe. | E2E `a11y.spec.ts`, `import.spec.ts`. |

## 3. Decisioni

- **D-7**, **D-15**, **D-17** (nessun tetto, ma la stima), **D-18**, **D-24**.
- **D-41** (collaudo in produzione dopo il merge): la sessione fa il commit dell'implementazione e la PR
  (stato «implementata il <data>, branch `feature/07-bulk-import`»); dopo il merge, nella stessa sessione, il collaudo F in produzione (l'import
  vero); il suo esito e lo stato «in esercizio» entrano nel commit di chiusura su
  `docs/07-in-esercizio`.
- **D-42** (estrazione solo al clic): qui il clic è «Avvia estrazione» o «Riprendi», che mostrano la
  stima; la bolletta caricata da sola nell'E2E passa da «Estrai (circa X $)» della 06.
- **D-57**: nelle bollette di un lotto il pulsante di `BillForm` si chiama «Conferma e passa alla
  prossima» (`submitLabel`), senza un «Conferma» semplice; `BillForm` non cambia;
  `confirmExtractionAction` restituisce anche `nextPath` (la prossima bolletta del lotto), che
  `BillForm` (03) segue dopo il salvataggio.
- **D-59** (ripresa dei caricamenti interrotti): un doppione `uploading` dello stesso lotto e dello
  stesso file riprende il caricamento; uno di un altro lotto il server lo abbandona e crea
  l'estrazione nuova.
- **T-14** (rotta `/bollette/importa`), **T-17** (fake), **T-22** (route usate dalla coda), **T-23**
  (stima).
- Adottate qui, ribaltabili:
  (a) massimo **50 file** per lotto; nel lotto ogni immagine è una bolletta intera (le bollette
  fotografate a più pagine si caricano una alla volta da `/bollette/carica`);
  (b) l'id del lotto è un `nanoid()` generato dal browser e validato dal server (21 caratteri
  `[A-Za-z0-9_-]`): un lotto non ha una tabella, è il `batch_id` delle sue estrazioni;
  (c) caricamento 3 file alla volta, estrazione 2 alla volta; la coda smette di far partire
  estrazioni al primo `unavailable` (limite di frequenza, servizio giù, rete, sessione scaduta,
  errore 5xx), non ai fallimenti di una singola bolletta;
  (d) l'ordine della coda è quello dei file scelti; l'ordine della revisione è per inizio periodo
  estratto (le estrazioni senza periodo in fondo), poi data di creazione, poi id;
  (e) una fornitura scelta per il lotto vale per tutte le sue bollette; senza scelta ognuna si
  riconosce dall'identificativo, come nella 06;
  (f) un lotto si riprende solo con un clic che mostra la stima: «Riprendi (N in coda, circa X $)»
  apre il lotto, e la coda riparte solo con il «Riprendi» della pagina del lotto; aprire o
  ricaricare una pagina non fa mai partire un'estrazione.

## 4. La soluzione

### 4.1 Servizi — in `src/lib/services/extractions.ts`

Le estrazioni «aperte» di un lotto sono quelle in stato `queued`, `running`, `extracted` o
`failed`; le `uploading` non contano (le abbandona la creazione successiva, D-59, o le pulisce
`documents:prune` dopo 24 ore), `confirmed` e `discarded` sono chiuse. Le «riprendibili» sono le
`queued` più le `failed` con `errorCode = 'unavailable'`. La stima di un'estrazione è
`estimateExtractionCost({ pdfPages, photos })` sui suoi documenti (`pageCount` per i PDF, 1 foto per
ogni immagine).

- `listBatches(db, userId)` → `Array<{ batchId: string; createdAt: number; counts: Record<'queued' |
  'running' | 'extracted' | 'failed', number>; resumableCount: number; resumableEstimateMicroUsd:
  number }>`: i lotti con almeno un'estrazione aperta, dal più recente; `createdAt` = il `createdAt`
  più vecchio fra le estrazioni aperte del lotto; `resumableEstimateMicroUsd` = la somma delle stime
  delle riprendibili.
- `listBatchExtractions(db, userId, batchId)` → `BatchExtractionRow[]`, le estrazioni aperte del
  lotto:

  ```ts
  export interface BatchExtractionRow {
    id: string;
    status: 'queued' | 'running' | 'extracted' | 'failed';
    errorCode: string | null;
    errorMessage: string | null;
    /** "PDF, 3 pagine", "PDF" when the page count is unknown, or "Foto". */
    fileLabel: string;
    /** The extracted billing period start; null until extracted. */
    periodStart: IsoDate | null;
    createdAt: number;
    startedAt: number | null;
    /** Only for queued and failed rows, the ones that can still be run. */
    estimatedCostMicroUsd: number | null;
  }
  ```

  `periodStart` dal `resultJson` (`''` o `resultJson` nullo → `null`); ordine: `periodStart`
  crescente (le righe con `null` in fondo), poi `createdAt`, poi `id`. Un `batchId` di un altro
  utente o inesistente → `[]`.
- `nextExtractionToReview(db, userId, { batchId, afterExtractionId }: { batchId: string;
  afterExtractionId: string })` → `Promise<string | null>`: l'id della prima `extracted` del lotto
  nell'ordine di `listBatchExtractions`, diversa da `afterExtractionId`; `null` se non ce n'è.
- `listImportSupplies(db, userId)` → `Array<{ id: string; kind: SupplyKind; label: string;
  houseName: string; archived: boolean }>`: tutte le forniture dell'utente, archiviate comprese
  (`listSupplies(db, userId, { includeArchived: true })` e `listHouses`), prima le attive poi le
  archiviate, ognuna per nome della casa ed etichetta. La pagina non importa repository (AGENTS.md
  § 2.1).
- `createExtraction` (06) accetta già `batchId` e, con D-59, riprende o abbandona le estrazioni
  `uploading`; qui si aggiunge la validazione del formato di (b): un `batchId` che non rispetta
  `/^[A-Za-z0-9_-]{21}$/` → `VALIDATION` «Identificativo del lotto non valido.».

Repository nuovi (C-12), tutti `(db, userId, …)`: in `extractions.ts`
`listExtractionsOfBatch(db, userId, batchId)` (le estrazioni aperte del lotto) e
`listBatchedExtractions(db, userId)` (le estrazioni aperte con `batch_id` non nullo). Le stime e le
etichette di tutti i lotti leggono i documenti con `listDocumentsOfExtractions(db, userId,
extractionIds)` di `documents.ts`, che esiste dal 2026-10-26 (lo usa già `listPendingExtractions`):
una sola query, mai una per estrazione.

Nessuna migrazione: `batch_id` esiste dalla 06 (indice `extractions_batch_idx`).

### 4.2 Motore della coda — `src/lib/import/queue-runner.ts` (puro, senza React)

```ts
/**
 * A browser-driven queue: at most `concurrency` runs at a time, stopping new starts on the first
 * failure that means "the service is down" so a rate limit does not burn through the whole batch.
 */
export interface QueueItemResult {
  status: 'extracted' | 'failed';
  /** An extraction error code, a domain error code, or 'unavailable' for anything that must pause. */
  errorCode: string | null;
  errorMessage: string | null;
}

export interface QueueRunnerOptions {
  ids: readonly string[];
  concurrency: number;
  run: (id: string) => Promise<QueueItemResult>;
  onUpdate: (id: string, state: 'running' | QueueItemResult) => void;
}

export interface QueueRunOutcome {
  completed: string[];
  failed: string[];
  notStarted: string[];
  pausedBecauseUnavailable: boolean;
}

export async function runQueue(options: QueueRunnerOptions): Promise<QueueRunOutcome> {
  const pending = [...options.ids];
  const outcome: QueueRunOutcome = { completed: [], failed: [], notStarted: [], pausedBecauseUnavailable: false };

  async function worker(): Promise<void> {
    while (pending.length > 0 && !outcome.pausedBecauseUnavailable) {
      const id = pending.shift();
      if (!id) return;
      options.onUpdate(id, 'running');
      // A fetch that throws (network down, page leaving) pauses the queue like an unavailable service.
      const result = await options
        .run(id)
        .catch((): QueueItemResult => ({ status: 'failed', errorCode: 'unavailable', errorMessage: 'Connessione interrotta.' }));
      options.onUpdate(id, result);
      if (result.status === 'extracted') outcome.completed.push(id);
      else {
        outcome.failed.push(id);
        if (result.errorCode === 'unavailable') outcome.pausedBecauseUnavailable = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, () => worker()));
  outcome.notStarted = pending;
  return outcome;
}

/**
 * Translate the HTTP answer of POST /api/extractions/<id>/run. Every answer that means "try again
 * later" (expired session, server errors, a body that is not JSON such as a platform timeout page)
 * becomes 'unavailable', which pauses the queue; a busy or missing extraction fails on its own.
 */
export function toQueueItemResult(httpStatus: number, body: unknown): QueueItemResult {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  const text = (key: string): string | null => {
    const value = fields?.[key];
    return typeof value === 'string' ? value : null;
  };
  const status = fields?.status;
  if (httpStatus === 200 && (status === 'extracted' || status === 'failed')) {
    return { status, errorCode: text('errorCode'), errorMessage: text('errorMessage') };
  }
  if (httpStatus === 401) {
    return { status: 'failed', errorCode: 'unavailable', errorMessage: 'Sessione scaduta: accedi di nuovo e riprendi.' };
  }
  if (httpStatus >= 500 || fields === null) {
    return { status: 'failed', errorCode: 'unavailable', errorMessage: text('message') ?? 'Servizio non raggiungibile.' };
  }
  return { status: 'failed', errorCode: text('code'), errorMessage: text('message') };
}
```

La traduzione, caso per caso: 200 → il corpo `{ status, errorCode, errorMessage }` di `runExtraction`;
401 → `unavailable` («Sessione scaduta: accedi di nuovo e riprendi.»); 409 `EXTRACTION_BUSY` →
fallita con quel codice e il `message` del corpo, **senza pausa** (l'estrazione gira già, o è ferma
da meno di 6 minuti); ogni 5xx (503 `EXTRACTION_UNAVAILABLE`, 504 di Vercel) e ogni corpo non JSON
→ `unavailable` con il `message` del corpo o «Servizio non raggiungibile.»; ogni altro 4xx (404
`NOT_FOUND`) → fallita con `code` e `message` del corpo. La riga mostra «fallita: <errorMessage>».

### 4.3 Interfaccia

- `src/components/import/use-wake-lock.ts`: `useWakeLock(active: boolean)` — con `active` chiede
  `navigator.wakeLock.request('screen')` se esiste, lo richiede di nuovo su `visibilitychange`
  quando la pagina torna visibile, e lo rilascia quando `active` diventa falso o il componente
  sparisce; senza API non fa niente; un rifiuto di `request` (permesso negato, risparmio
  energetico) si ignora: la coda gira lo stesso.
- `src/components/import/bulk-importer.tsx` (client), in quattro passi sulla stessa pagina:
  1. **Scelta**: select «Fornitura» (prima voce «Riconosci dalla bolletta»; poi le forniture di
     `listImportSupplies`, le archiviate in fondo con «(archiviata)», perché le bollette passate
     possono essere di una fornitura cessata), input file `multiple` con l'etichetta «File delle
     bollette» (`accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"`, gli stessi
     formati del caricamento singolo), elenco dei file (nome, dimensione) con «Rimuovi»; oltre 50 →
     «Al massimo 50 file per volta: tengo i primi 50.» e i primi 50.
  2. **Caricamento** («Carica N file»): `batchId = nanoid()`. Prima, per ogni file: immagine →
     `compressPhoto` (un errore → riga «non caricato: <messaggio>»); SHA-256 nel browser
     (`crypto.subtle.digest`); fra i file con lo stesso SHA-256 si tiene il primo e gli altri
     diventano «doppione di <nome del primo>», senza chiamate. Poi, 3 file alla volta,
     `POST /api/extractions` con `{ supplyId, batchId, files: [uno] }`:
     - 201 `{ extractionId, documents }` → `uploadDocumentFile` → `POST
       /api/extractions/<id>/uploaded` → riga «pronta» («PDF, N pagine» o «Foto»);
     - 200 `{ duplicateOf, duplicateStatus: 'uploading', documents }` (lo stesso lotto e lo stesso
       file: un caricamento interrotto, D-59) → `uploadDocumentFile` sui `pathname` ricevuti e
       `…/uploaded` su `duplicateOf`, come per il 201;
     - 200 `{ duplicateOf, duplicateStatus }` con un altro stato → riga «già caricata» con il link a
       `/bollette/da-rivedere` (l'estrazione può essere in coda, in corso, estratta o fallita) e stop
       per quel file;
     - 409 `DUPLICATE_DOCUMENT` → riga «già presente» con il link a `/bollette/<details.billId>`;
     - 422 `DOCUMENT_INVALID` da `…/uploaded` → riga «file non valido: <messaggio>» (l'estrazione è
       `failed` con `document_invalid` e si scarta da «Da rivedere»);
     - ogni altro errore (rete, upload, altri status) → riga «non caricato: <messaggio>» con
       «Riprova», che ripete il passo per quel file con lo stesso `batchId` (se la creazione era
       arrivata, il server risponde con il doppione `uploading` e il caricamento riprende).
  3. **Stima**, quando nessun caricamento è in corso: «N bollette pronte · P pagine PDF · F foto ·
     costo stimato circa X $» (`formatUsd` della somma degli `estimatedCostMicroUsd` restituiti da
     `…/uploaded`) e il pulsante «Avvia estrazione»; il testo sotto: «Tieni aperta questa pagina: le
     estrazioni girano dal tuo browser.». Con N = 0: «Nessuna bolletta da estrarre.» e nessun
     pulsante.
  4. **Estrazione**: `runQueue` con `concurrency: 2` sugli id delle righe «pronte», nell'ordine dei
     file scelti, e `run = async (id) => { const response = await fetch('/api/extractions/' + id +
     '/run', { method: 'POST' }); return toQueueItemResult(response.status, await
     response.json().catch(() => null)); }`;
     `useWakeLock(running)`; stato per riga; alla fine «Estratte N, fallite M» con «Rivedi le
     bollette» → `/bollette/da-rivedere?lotto=<batchId>`; in pausa: il messaggio di A3 e «Riprendi»,
     che riesegue `runQueue` con le `notStarted` e poi le fallite `unavailable`, in quest'ordine.
- `/bollette/importa` (pagina server): `listBatches`, `listImportSupplies` e `isExtractionConfigured()`
  (falso → «Estrazione non configurata su questa installazione» e nessun importatore, come la 06).
  Sopra l'importatore, quando `listBatches` non è vuoto, «Lotti in sospeso»: per lotto la data
  (`formatDate(romeToday(createdAt))`), i conteggi («2 in coda · 1 in corso · 3 da rivedere · 1
  fallite», solo i numeri > 0), il link «Riprendi (N in coda, circa X $)» solo con N =
  `resumableCount` > 0 (X = `formatUsd(resumableEstimateMicroUsd)`) verso
  `/bollette/importa?lotto=<id>`, e «Rivedi» verso `/bollette/da-rivedere?lotto=<id>` quando ci sono
  estratte o fallite. Link a questa pagina da «Bollette» («Importa più bollette») e da «Carica una
  bolletta».
- `/bollette/importa?lotto=<id>`: la pagina legge `listBatchExtractions` e apre l'importatore al
  passo 4 con tutte le righe del lotto e i loro stati, la stima delle riprendibili («N in coda ·
  costo stimato circa X $», somma dei loro `estimatedCostMicroUsd`) e il pulsante «Riprendi», che
  esegue `runQueue` sulle riprendibili nell'ordine di `listBatchExtractions` (lo stesso insieme del
  «Riprendi» in pagina). Aprire la pagina non fa partire niente. Senza riprendibili: «Niente da
  riprendere in questo lotto.» e il link «Rivedi»; senza righe (lotto chiuso o di un altro utente):
  «Nessuna bolletta in questo lotto.».
- `/bollette/da-rivedere?lotto=<id>`: al posto di `listPendingExtractions` usa
  `listBatchExtractions`, nello stesso ordine; ogni riga mostra `fileLabel`, «dal <gg/mm/aaaa>»
  (`formatDate(periodStart)`) quando c'è il periodo, lo stato in italiano della 06 e le azioni della
  06 per stato («Rivedi», «Estrai (circa X $)», «Riprova», «Scarta»); sopra, il link «Tutte le
  bollette da rivedere» (`/bollette/da-rivedere`). Senza righe: «Nessuna bolletta da rivedere in
  questo lotto.».
- Revisione (06), `/bollette/revisione/[id]` di un'estrazione con `batchId`: `BillForm` riceve
  `submitLabel="Conferma e passa alla prossima"` (D-57: nessun «Conferma» semplice; `BillForm` non
  cambia). `confirmExtractionAction` restituisce `ActionResult<{ billId: string; nextPath?: string }>`
  (la forma di `onSubmit` di C-14): con un `batchId`, dopo la conferma, `next =
  nextExtractionToReview(getDb(), user.id, { batchId, afterExtractionId: id })` e `nextPath` =
  `/bollette/revisione/<next>` o, se `next` è `null`, `/bollette/da-rivedere?lotto=<batchId>`; senza
  lotto `nextPath` manca e `BillForm` va alla scheda della bolletta, come nella 06. `BillForm` segue
  `nextPath` da sé: il componente della revisione non naviga. In un lotto «Scarta» porta a
  `/bollette/da-rivedere?lotto=<batchId>`.

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che `/bollette/importa` e `/bollette/da-rivedere`
  chiamano solo i servizi di § 4.1 (anche per le forniture: `listImportSupplies`), mai
  `listSupplies` o i repository nuovi.
- **AGENTS.md § 2.4 Isolation** — `listBatches`, `listBatchExtractions`, `nextExtractionToReview`
  e `listImportSupplies` filtrano per `userId`, e i due repository nuovi hanno la firma `(db,
  userId, …)` (`scope.test.ts`); un `batchId` di un altro utente dà un elenco vuoto, mai le sue righe.
- **AGENTS.md § 6 Claude** — nessuna estrazione parte senza il clic su «Avvia estrazione» o
  «Riprendi», che mostrano la stima; aprire o ricaricare `/bollette/importa?lotto=` non fa partire
  niente; nessun retry automatico (la pausa è l'opposto di un retry).
- Vercel Hobby: ogni `/run` è una function separata da 300 s; il browser non deve tenere aperte più
  di 2 richieste di estrazione alla volta (6 connessioni per origine nei browser).
- Blob Hobby: 50 upload sono 50 operazioni avanzate (su 2.000 al mese).
- La Wake Lock cade quando la pagina va in background: si richiede di nuovo al ritorno.
- Lo stesso file due volte nella stessa scelta: senza il controllo dello SHA-256 nel browser, due
  `POST /api/extractions` in parallelo con lo stesso SHA-256 si contenderebbero l'indice unico
  `documents_user_sha256_uq`; il browser li toglie prima di caricare.
- Una richiesta `/run` interrotta dalla ricarica della pagina continua sul server: dopo la ricarica
  quell'estrazione è `running` e non è riprendibile; finisce da sola, e se la function muore la presa
  della 06 la riaccetta dopo 6 minuti (un «Riprendi» prima riceve 409 `EXTRACTION_BUSY`, che non mette
  in pausa).

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `queue-runner.test.ts`, `runQueue`: 5 id, `concurrency 2`, `run` finto con ritardi → mai più di 2 in corso (contatore), 5 completati; il terzo risponde `unavailable` → `pausedBecauseUnavailable` e almeno un id in `notStarted`; un `failed` con `invalid_output` non ferma la coda; un `run` che lancia → `unavailable` con «Connessione interrotta.». | `concurrency` ignorata (`Array.from({ length: options.ids.length }, …)`, un worker per id) → il contatore arriva a 5. |
| Unit | `queue-runner.test.ts`, `toQueueItemResult`: 200 `{ status: 'extracted', errorCode: null, errorMessage: null }` → estratta; 200 `failed` con `invalid_output` → fallita con quel codice; 401 → `unavailable` con «Sessione scaduta: accedi di nuovo e riprendi.»; 409 `{ code: 'EXTRACTION_BUSY', message }` → `EXTRACTION_BUSY`; 503 `{ code: 'EXTRACTION_UNAVAILABLE', message }` → `unavailable` con quel messaggio; 504 con corpo `null` (pagina HTML non leggibile come JSON) → `unavailable` con «Servizio non raggiungibile.»; 404 `{ code: 'NOT_FOUND', message }` → `NOT_FOUND`. | Trattare come `unavailable` solo gli status oltre il 503 (`httpStatus > 503`) → il caso 503 dà `EXTRACTION_UNAVAILABLE` e non `unavailable`. |
| Unit | `use-wake-lock.dom.test.ts` (happy-dom, vedi sotto): con un `navigator.wakeLock` finto, `active` vero → `request` chiamato una volta con `'screen'`; `active` falso → `release` chiamato; un `request` che rifiuta → nessuna eccezione non gestita. | Non chiamare `release` alla disattivazione → l'asserzione su `release` fallisce. |
| Integrazione | `batches.test.ts` (`createTestDb`, estrazioni e documenti inseriti con i repository della 06): lotto di A con 2 `queued` (un PDF da 8 pagine, una foto), 1 `failed` `unavailable` (PDF da 2 pagine), 1 `failed` `invalid_output`, 1 `extracted` → `counts` `{ queued: 2, running: 0, extracted: 1, failed: 2 }`, `resumableCount` 3, `resumableEstimateMicroUsd` = stima(8,0) + stima(0,1) + stima(2,0), `createdAt` = il più vecchio; un lotto con sole `uploading` e uno con sole `confirmed`/`discarded` non compaiono. Ordine: in un secondo lotto di A, create in quest'ordine, una `queued`, poi una `extracted` con `periodStart` `2026-09-01`, poi una `extracted` con `2026-07-01` → `listBatchExtractions` mette luglio, settembre e la `queued` (senza periodo) in fondo; `nextExtractionToReview(…, { batchId, afterExtractionId: <id della queued> })` → luglio; con `afterExtractionId` = luglio → settembre. `listImportSupplies` di A con una fornitura archiviata → presente, ultima, `archived: true`. `batchId` di 5 caratteri → `VALIDATION`. | Ordinare per `createdAt` invece che per `periodStart` → `nextExtractionToReview` restituisce settembre. |
| Integrazione | `batches.test.ts`, isolamento: lo stesso `batchId` letto da B → `listBatches` di B non lo contiene, `listBatchExtractions` di B → `[]`, `nextExtractionToReview` di B → `null`, `listImportSupplies` di B senza le forniture di A; letto da A → le sue righe. | Togliere la condizione su `user_id` dal `where` di `listExtractionsOfBatch` → B vede le righe di A. |
| E2E | `import.spec.ts` (fake; ogni test registra il suo utente con `signUpTestUser(page, 'import')` e crea da `/forniture` la casa «Casa Gazza», parola spia di questo file, così i progetti `mobile` e `desktop` e gli altri file non condividono documenti né SHA-256; seed A e B non si toccano): (1) da `/bollette/carica` sceglie `internet-armadillo.pdf` con «Riconosci dalla bolletta», «Carica», poi «Estrai (circa X $)», nella revisione «Crea una nuova fornitura» in «Casa Gazza» e «Conferma»; (2) `/bollette/importa`: sceglie `luce-pellicano.pdf`, `gas-pellicano.pdf`, `acqua-castoro.pdf`, una copia di `internet-armadillo.pdf` con un altro nome e una seconda copia di `acqua-castoro.pdf` (stessi byte, `setInputFiles` con un altro `name`) → «già presente» per la copia dell'internet, «doppione di acqua-castoro.pdf» per la seconda acqua, stima per 3 bollette; sul DB nessuna estrazione del lotto ha `started_at`; «Avvia estrazione» → 3 «da rivedere»; «Rivedi le bollette» → elenco del lotto con in testa «dal 01/07/2024» (l'acqua) e poi due righe «dal 01/09/2024»; axe sull'elenco (`new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()`) → 0 violazioni; «Rivedi» sulla prima e, in ogni revisione, «Crea una nuova fornitura» in «Casa Gazza» e «Conferma e passa alla prossima» (nessun pulsante «Conferma») → la successiva; dopo la terza → «Nessuna bolletta da rivedere in questo lotto.». Variante «ricarica» (un altro utente, stessi tre file): ricarica della pagina appena una riga è «in corso» → «Lotti in sospeso» con «Riprendi (1 in coda, circa X $)» → nella pagina del lotto «Riprendi» → quella riga «da rivedere»; `/bollette/da-rivedere?lotto=<id>` → 3 «da rivedere» (il test ricarica finché le due partite prima della ricarica finiscono, al massimo 10 s). Variante «pausa» (un altro utente): `luce-pellicano-rotta.pdf`, `gas-pellicano.pdf`, `acqua-castoro.pdf` in quest'ordine → «Anthropic non risponde: riprendi più tardi», `acqua-castoro.pdf` resta «in coda», `gas-pellicano.pdf` «da rivedere»; «Riprendi» → `acqua-castoro.pdf` «da rivedere». | Avviare le estrazioni subito dopo il caricamento → al passo della stima ci sono estrazioni del lotto con `started_at`. |
| E2E | `a11y.spec.ts` esteso a `/bollette/importa` (seed A in sola lettura, `mobile` e `desktop`, tema chiaro e scuro); in `import.spec.ts` il controllo axe sull'elenco del lotto (riga sopra). | Il campo dei file senza etichetta → violazione. |
| E2E | `isolamento.spec.ts` esteso: un utente registrato nel test con `signUpTestUser(page, 'isolamento-lotto')` crea un lotto via API con la sua sessione (`POST /api/extractions` con un `batchId` e il file `acqua-castoro.pdf`, il file su `PUT /api/e2e/blob` come fa `uploadDocumentFile` nelle build di Playwright, poi `POST /api/extractions/<id>/uploaded`) e apre `/bollette/da-rivedere?lotto=<id>` → la sua riga «in coda» (controllo positivo); seed A, in sola lettura, apre lo stesso URL → «Nessuna bolletta da rivedere in questo lotto.» e `/bollette/importa?lotto=<id>` → «Nessuna bolletta in questo lotto.». | Togliere la condizione su `user_id` dal `where` di `listExtractionsOfBatch` → seed A vede la riga dell'altro utente. |

Il fake extractor (06) non conta le chiamate: «nessuna chiamata prima del clic» si verifica sul DB.
Dopo la stima, su `e2e.db` (con `@libsql/client`, come `global-setup.ts`), `select count(*) from
extractions e join users u on u.id = e.user_id where u.email = ? and e.batch_id is not null and
e.started_at is not null` vale 0, e la stessa query senza la condizione su `started_at` vale 3 (un
contatore condiviso sommerebbe le chiamate degli altri file in parallelo, `workers: 2`, e
l'estrazione della bolletta caricata da sola al passo (1) ha `started_at` ma non `batch_id`).
`createFakeExtractor(dir: string, options?: { delayMs: number })` aspetta `delayMs` prima di
rispondere, tranne per i file `{ "fail": … }`, che falliscono subito (così la variante «pausa» è
deterministica); il container passa `{ delayMs: env.E2E_EXTRACTOR_DELAY_MS }` (`EnvSchema` aggiunge
`E2E_EXTRACTOR_DELAY_MS: z.coerce.number().int().min(0).default(0)`); `playwright.config.ts` lo
imposta a `'1500'` nel `serverEnv`, così la variante «ricarica» ha tempo di interrompere la coda.

Il progetto `dom` di Vitest: `vitest.config.ts` diventa `test: { env: { …invariato dalla 01… },
projects: [ { extends: true, test: { name: 'unit', environment: 'node', include:
['src/**/*.test.ts', 'scripts/**/*.test.ts'], exclude: [...configDefaults.exclude,
'**/*.dom.test.ts'] } }, { extends: true, test: { name: 'dom', environment: 'happy-dom', include:
['src/**/*.dom.test.ts'] } } ] }` (`configDefaults` da `vitest/config`; `extends: true` fa valere in
tutti e due i progetti `env` con `TZ` e il `resolve.alias` della radice, che resta invariato);
`pnpm add -D happy-dom@21.0.4`. Il numero di file di test eseguiti da `pnpm test` dopo il cambio è
quello di prima più uno (si confronta l'uscita prima e dopo). Il test monta il hook senza librerie
nuove: un componente `Probe({ active })` che chiama `useWakeLock(active)` e restituisce `null`,
creato con `createElement`, montato con `createRoot` di `react-dom/client` dentro `act` di `react`
con `globalThis.IS_REACT_ACT_ENVIRONMENT = true`; `navigator.wakeLock` finto con
`Object.defineProperty(navigator, 'wakeLock', { value: …, configurable: true })`.

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite precedente verde (`pnpm test` esegue gli stessi file di prima più i
  nuovi); il caricamento singolo invariato (con «Estrai (circa X $)» della 06).
- **C — Comportamento nuovo** (locale, fake). Esito atteso, detto prima: prima del clic nessuna
  estrazione del lotto ha `started_at`; dopo, 3 estrazioni del lotto `extracted`; la copia
  dell'internet è «già presente» e non crea righe; l'elenco del lotto comincia dall'acqua.
  Procedura: suite verde; poi, dalla shell Bash e solo sulla riga di comando (mai in `.env.local`),
  `E2E_FAKE_SERVICES=1 NEXT_PUBLIC_E2E_FAKE_SERVICES=1 pnpm dev` (DB
  `local.db` di `.env.local`, file in `.e2e-blob/`, estrattore da `tests/fixtures/extractions/`) e
  uno script Playwright usa e getta (non tracciato) con seed A, che in `local.db` nel collaudo locale
  si può scrivere: carica da `/bollette/carica` `internet-armadillo.pdf`, clicca «Estrai (circa X
  $)», nella revisione la assegna alla fornitura «Internet» di seed A e la conferma (nessuna
  sovrapposizione: le fixture sono del 2024, prima delle bollette seed); poi da `/bollette/importa`
  importa `luce-pellicano.pdf`, `gas-pellicano.pdf`, `acqua-castoro.pdf` e una copia di
  `internet-armadillo.pdf`; verifica su `local.db`: prima del clic nessuna estrazione del lotto con
  `started_at`; dopo, 3 estrazioni del lotto `extracted`; per la copia nessuna riga nuova in
  `extractions` né in `documents`.
- **D — Sotto la UI**. Esito atteso, detto prima: le righe del proprio lotto sì, quelle del lotto
  altrui no. Lo stesso script, con seed B in `local.db`, crea un lotto di B via API con
  `acqua-castoro.pdf`; `curl` con la sessione di A a `/bollette/da-rivedere?lotto=<lotto di A>` → le
  righe del lotto (controllo positivo); a `/bollette/da-rivedere?lotto=<lotto di B>` → «Nessuna
  bolletta da rivedere in questo lotto.»; a `/bollette/importa?lotto=<lotto di B>` → «Nessuna
  bolletta in questo lotto.».
- **F — L'import delle bollette passate dell'owner, insieme** (in **produzione, dopo il merge e il
  deploy di produzione verde**: i branch `feature/*` non hanno deploy; al via dell'owner, sul
  computer):
  1. l'owner indica in chat la cartella delle sue bollette storiche (l'agente gliel'ha chiesta a
     inizio sessione; il percorso resta in chat, mai in un file tracciato né in SESSION_NOTES.md;
     decisione dell'owner del 2026-10-25) e le sceglie in `https://<dominio>/bollette/importa`;
  2. la pagina mostra la stima: **l'agente la ripete in chat con il numero di bollette e chiede
     l'OK esplicito** prima di «Avvia estrazione» (atteso: circa 0,30 $ a bolletta);
  3. durante la coda l'agente segue gli stati in sola lettura del DB di produzione con uno script
     `tsx` usa e getta (non tracciato) che si collega con `loadProductionTarget()` di
     `scripts/production-target.ts` (C-22): `select status, count(*) from extractions where
     batch_id = ? group by status`;
  4. revisione insieme, dalla più vecchia: per ogni bolletta l'owner guarda totale, periodo e
     avvisi; le sovrapposizioni si decidono una per una (D-24);
  5. alla fine: numero di bollette confermate, scartate, fallite; costo reale del lotto (`select
     sum(cost_micro_usd) from extractions where batch_id = ?`, con lo stesso script) contro la
     stima; l'esito va nel commit di chiusura (D-41).
  Che cosa NON copre: la coda offline (09).
- **G — Ripristino**: in locale, prima del commit, la bolletta `internet-armadillo` confermata in C
  si elimina dalla UI, le estrazioni dei lotti di A e di B si scartano, `.e2e-blob/` si svuota e lo
  script si cancella; in produzione, dopo F, restano le bollette vere confermate (sono i dati
  dell'owner, nel suo deploy), le estrazioni fallite del lotto si scartano dalla UI e lo script di
  lettura si cancella.

## 8. Messa in esercizio

- Nessuna migrazione. Una variabile nuova solo per Playwright, `E2E_EXTRACTOR_DELAY_MS` (in
  `playwright.config.ts`; mai su Vercel né in `.env.example`, come `E2E_FAKE_SERVICES`).
- Ordine (D-41): gate verdi, A, C, D e la parte locale di G; commit dell'implementazione (stato «implementata il
  <data>, branch `feature/07-bulk-import`») e PR; merge dall'owner e deploy di produzione verde; poi, nella stessa sessione, il
  collaudo F in produzione e la parte di G in produzione.
- Misura di chiusura: il collaudo F, in produzione dopo il merge (è anche l'import vero).
- L'esito di F (bollette confermate, scartate, fallite; costo reale contro la stima, con la data),
  il numero della PR, i gotchas e lo stato «in esercizio» li scrive la chiusura della sessione
  (riga «Stato» di questa spec, indice § 5, CLAUDE.md → Latest, la riga «stima contro costo reale»
  in `doc/guide/estrazione.md`, AGENTS.md se ci sono lezioni) in un commit su
  `docs/07-in-esercizio` (D-41).

## 9. Documentazione

- `doc/guide/estrazione.md`: sezione «Import multiplo» (lotti senza tabella, coda dal browser,
  traduzione delle risposte di `/run` e pausa su `unavailable`, ripresa dei lotti e dei caricamenti
  interrotti, Wake Lock, ordine di revisione, la stima per bolletta). La cifra misurata in F la
  aggiunge il commit di chiusura (§ 8).
- `CLAUDE.md`: Latest («07 implementata, PR aperta; l'import delle bollette passate si fa in
  produzione dopo il merge»); § Key Features (import multiplo); § Not yet present: «Bulk import from
  a folder or a mailbox; multi-page photographed bills inside a bulk import (one by one from
  /bollette/carica)».
- `AGENTS.md` § 9 Testing: «`*.dom.test.ts` run in happy-dom (Vitest project `dom`); every other
  test in node (project `unit`)».
- `README.md`: § What it does (import multiplo).

## 10. Fuori ambito, dichiarato

- Message Batches API (scartata da D-18) → CLAUDE.md § Not yet present.
- Bollette a più pagine fotografate dentro un lotto → si caricano una alla volta da
  `/bollette/carica` (adottata a); CLAUDE.md § Not yet present.
- Importare i file da una cartella o da una casella email → CLAUDE.md § Not yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **M**.

```
Ciao, in questa sessione implemento la spec doc/v1/07-import-multiplo.md.

Prima di tutto: `git branch --show-current` deve dire main, aggiornato con `git pull`; crea
feature/07-bulk-import e SESSION_NOTES.md. La 06 è ritirata (2026-10-26, stato in § 5 dell'indice e
in CLAUDE.md → Latest), quindi non c'è uno stato da scrivere per lei. Chiedimi dove sono le mie bollette storiche (una
cartella mia, fuori dal repo): il percorso resta in chat, mai in un file tracciato né in
SESSION_NOTES.md, e serve alla fase F; non aprirle prima della fase F.

Contesto, prima di toccare il codice:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), DESIGN.md, doc/guide/estrazione.md, doc/guide/app.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 07 INTERA
- Controlla con un grep che i contratti C-1, C-4, C-5, C-7, C-8 (con `formatUsd`), C-12, C-14,
  C-16, C-17, C-18, C-22 e C-23 esistano con i nomi e le firme dell'indice

Implementa la spec 07 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima), § 9 la
documentazione. Non decidere nulla che la spec ha già deciso; se trovi un punto che la spec non
copre, fermati e chiedimelo con AskUserQuestion. Le etichette della serie non entrano nel codice.
Le bollette vere non entrano mai nel repo.

Alla fine, in quest'ordine: riassumi il diff; scrivi lo stato «implementata il <data>, branch
`feature/07-bulk-import`» nella riga «Stato» della spec e in § 5 dell'indice e aggiorna CLAUDE.md → Latest; chiedimi l'OK per il commit
dell'implementazione e poi apri la PR. Dopo il mio merge e il deploy di produzione verde, nella stessa
sessione, la fase F: l'import vero delle mie bollette passate in produzione; la stima la ripeti in
chat e parte solo al mio OK; poi la parte di G in produzione. Poi la chiusura della sessione:
esito di F, numero della PR, gotchas e stato «in esercizio» nei loro posti, commit su
docs/07-in-esercizio e PR (§ 8, D-41).
```
