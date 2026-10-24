# 07 — Import multiplo

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/07-bulk-import` da `main`. **Dipende da**: 06 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-7, D-15, D-17, D-18, D-24; scelte T-22,
> T-23; contratti: usa C-14, C-16, C-17 (aggiunge servizi a `extractions.ts`).

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
| A1 | `/bollette/importa`: scelta della fornitura (facoltativa) e di fino a 50 file (PDF o immagini: ogni file è una bolletta); i doppioni già confermati sono segnati «già presente» e saltati, quelli in revisione «già caricata» e saltati. | E2E `import.spec.ts`. |
| A2 | Dopo il caricamento (3 file alla volta) la pagina mostra: numero di bollette, pagine PDF, foto e **costo stimato totale** (`estimateExtractionCost` per estrazione, sommato); nessuna chiamata a Claude prima di «Avvia estrazione». | E2E (il fake conta le chiamate: 0 prima del clic). |
| A3 | «Avvia estrazione» esegue la coda con **2 in parallelo**; ogni riga mostra lo stato («in coda», «in corso», «da rivedere», «fallita: …»); un fallimento `unavailable` mette in pausa la coda con «Anthropic non risponde: riprendi più tardi» e il pulsante «Riprendi». | Unit `queue-runner.test.ts`; E2E. |
| A4 | Chiudendo la pagina a metà, `/bollette/importa` mostra il lotto in sospeso con «Riprendi (N in coda, circa X $)». | E2E (ricarica a metà). |
| A5 | `/bollette/da-rivedere?lotto=<id>` elenca le estratte del lotto **dalla più vecchia** (inizio periodo estratto); la revisione ha «Conferma e passa alla prossima», che porta alla successiva del lotto. | E2E. |
| A6 | Con la Wake Lock disponibile, lo schermo resta acceso mentre la coda gira e la si rilascia alla fine. | Unit sul hook con un `navigator.wakeLock` finto. |
| A7 | Le bollette passate dell'owner sono importate in produzione nel collaudo, con la stima detta prima e confermata dall'owner. | Collaudo § 7 F. |

## 3. Decisioni

- **D-7**, **D-15**, **D-17** (nessun tetto, ma la stima), **D-18**, **D-24**.
- **T-22** (route usate dalla coda), **T-23** (stima).
- Adottate qui, ribaltabili:
  (a) massimo **50 file** per lotto; nel lotto ogni immagine è una bolletta intera (le bollette
  fotografate a più pagine si caricano una alla volta da `/bollette/carica`);
  (b) l'id del lotto è un `nanoid()` generato dal browser e validato dal server (21 caratteri
  `[A-Za-z0-9_-]`): un lotto non ha una tabella, è il `batch_id` delle sue estrazioni;
  (c) caricamento 3 file alla volta, estrazione 2 alla volta; la coda si ferma al primo
  `unavailable` (limite di frequenza o servizio giù), non ai fallimenti di una singola bolletta;
  (d) l'ordine della coda è quello dei file scelti; l'ordine della revisione è per inizio periodo
  estratto, poi data di creazione;
  (e) una fornitura scelta per il lotto vale per tutte le sue bollette; senza scelta ognuna si
  riconosce dall'identificativo, come nella 06.

## 4. La soluzione

### 4.1 Servizi — in `src/lib/services/extractions.ts`

- `listBatches(db, userId)` → `Array<{ batchId; createdAt; counts: Record<ExtractionStatus, number>;
  queuedEstimateMicroUsd: number }>` per i lotti con almeno un'estrazione non `confirmed`/`discarded`,
  dal più recente; la stima dei `queued` si calcola dai loro documenti (`pageCount` per i PDF, 1
  foto per le immagini) con `estimateExtractionCost`.
- `listBatchExtractions(db, userId, batchId)` → righe `{ id, status, errorCode, errorMessage,
  fileLabel, periodStart }` (`fileLabel` = «PDF, N pagine» o «Foto»; `periodStart` dal
  `resultJson` quando c'è).
- `nextExtractionToReview(db, userId, { batchId, afterExtractionId })` → l'id della prossima
  `extracted` del lotto nell'ordine di (d), o `null`.
- `createExtraction` (06) accetta già `batchId`; qui si aggiunge la validazione del formato di (b).

Nessuna migrazione: `batch_id` esiste dalla 06 (indice `extractions_batch_idx`).

### 4.2 Motore della coda — `src/lib/import/queue-runner.ts` (puro, senza React)

```ts
/**
 * A browser-driven queue: at most `concurrency` runs at a time, stopping new starts on the first
 * failure that means "the service is down" so a rate limit does not burn through the whole batch.
 */
export interface QueueItemResult {
  status: 'extracted' | 'failed';
  errorCode: string | null;
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
      const result = await options.run(id).catch((): QueueItemResult => ({ status: 'failed', errorCode: 'unavailable' }));
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
```

(Un errore di rete della `fetch` verso `/run` conta come `unavailable`: la coda si ferma e si
riprende.)

### 4.3 Interfaccia

- `src/components/import/use-wake-lock.ts`: `useWakeLock(active: boolean)` — con `active` chiede
  `navigator.wakeLock.request('screen')` se esiste, lo richiede di nuovo su `visibilitychange`
  quando la pagina torna visibile, e lo rilascia quando `active` diventa falso o il componente
  sparisce; senza API non fa niente.
- `src/components/import/bulk-importer.tsx` (client), in quattro passi sulla stessa pagina:
  1. **Scelta**: select della fornitura (prima voce «Riconosci dalla bolletta»), input file
     `multiple` (`accept="application/pdf,image/jpeg,image/png,image/webp"`), elenco dei file
     (nome, dimensione) con «Rimuovi»; oltre 50 → messaggio e i primi 50.
  2. **Caricamento** («Carica N file»): `batchId = nanoid()`; per ogni file (3 alla volta):
     immagine → `compressPhoto`; SHA-256; `POST /api/extractions` con `{ supplyId, batchId, files:
     [uno] }`; `duplicateOf` → riga «già caricata: rivedila» (link) e stop per quel file;
     `DUPLICATE_DOCUMENT` → riga «già presente» (link alla bolletta); altrimenti
     `uploadDocumentFile` e `POST …/uploaded`; un errore → riga «non caricato: <messaggio>».
  3. **Stima**: «N bollette pronte · P pagine PDF · F foto · costo stimato circa X $»
     (`formatUsd`) e il pulsante «Avvia estrazione»; il testo sotto: «Tieni aperta questa pagina:
     le estrazioni girano dal tuo browser.»
  4. **Estrazione**: `runQueue` con `concurrency: 2` e `run = (id) => fetch('/api/extractions/' +
     id + '/run', { method: 'POST' })` → JSON; `useWakeLock(true)` finché gira; stato per riga;
     alla fine «Estratte N, fallite M» con «Rivedi le bollette» →
     `/bollette/da-rivedere?lotto=<batchId>`; in pausa: il messaggio di A3 e «Riprendi» (riesegue
     `runQueue` con le non partite e le fallite `unavailable`).
- `/bollette/importa` (pagina server): sopra l'importatore, «Lotti in sospeso» da `listBatches`:
  data, conteggi, «Riprendi (N in coda, circa X $)» che apre l'importatore al passo 4 con le
  estrazioni `queued` del lotto (lette con `listBatchExtractions`); «Rivedi» se ci sono estratte.
  Link a questa pagina da «Bollette» («Importa più bollette») e da «Carica una bolletta».
- `/bollette/da-rivedere`: il filtro `?lotto=` e l'ordinamento di (d) quando c'è il filtro.
- Revisione (06): se l'estrazione ha un `batchId`, accanto a «Conferma» c'è «Conferma e passa alla
  prossima»; l'azione restituisce `nextExtractionToReview` e il client naviga lì (o a
  `/bollette/da-rivedere?lotto=<id>` se è l'ultima).

## 5. Vincoli e trappole

- **AGENTS.md § 2.4 Isolation** — `listBatches` e `listBatchExtractions` filtrano per `userId`; un
  `batchId` di un altro utente dà un elenco vuoto, mai le sue righe.
- **AGENTS.md § 6 Claude** — nessuna estrazione parte senza il clic su «Avvia estrazione» (o
  «Riprendi»), che mostra la stima; nessun retry automatico (la pausa è l'opposto di un retry).
- Vercel Hobby: ogni `/run` è una function separata da 300 s; il browser non deve tenere aperte più
  di 2 richieste di estrazione alla volta (6 connessioni per origine nei browser).
- Blob Hobby: 50 upload sono 50 operazioni avanzate (su 2.000 al mese).
- La Wake Lock cade quando la pagina va in background: si richiede di nuovo al ritorno.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `queue-runner.test.ts`: 5 id, `concurrency 2`, `run` finto con ritardi → mai più di 2 in corso (contatore), 5 completati; il terzo risponde `unavailable` → `pausedBecauseUnavailable` e almeno un id in `notStarted`; un `failed` con `invalid_output` non ferma la coda; un `run` che lancia conta come `unavailable`. | `concurrency` ignorata (un worker per id) → il contatore arriva a 5. |
| Unit | `use-wake-lock.dom.test.ts` (happy-dom: `vitest.config.ts` passa a due `projects`, `unit` in node per `*.test.ts` e `dom` in happy-dom per `*.dom.test.ts`; `pnpm add -D happy-dom@21.0.4`): con un `navigator.wakeLock.request` finto → chiamato una volta con `'screen'`; `active` falso → `release` chiamato. | Non rilasciare → l'asserzione su `release` fallisce. |
| Integrazione | `batches.test.ts`: lotto di A con 2 `queued` (un PDF da 8 pagine, una foto) e 1 `extracted` → conteggi e `queuedEstimateMicroUsd` = stima(8,0) + stima(0,1); lo stesso `batchId` letto da B → vuoto; `nextExtractionToReview` restituisce prima la bolletta col periodo più vecchio; `batchId` di 5 caratteri → `VALIDATION`. | Ordinare per data di creazione → l'ordine si inverte. |
| E2E | `import.spec.ts` (seed A, fake): sceglie `luce-fenicottero.pdf`, `gas-fenicottero.pdf`, `acqua-ornitorinco.pdf` e una copia di un file già confermato → «già presente» per la copia, stima per 3; il fake ha registrato 0 estrazioni; «Avvia estrazione» → 3 «da rivedere»; «Rivedi le bollette» → elenco del lotto in ordine di periodo; «Conferma e passa alla prossima» due volte → la terza; dopo l'ultima → elenco vuoto. Variante: ricarica la pagina durante la coda (fake con ritardo) → «Lotti in sospeso» con «Riprendi» → completa. | Avviare le estrazioni subito dopo il caricamento → il contatore del fake non è 0 al passo della stima. |

Il fake extractor (06) aggiunge un contatore delle chiamate leggibile dal test
(`GET /api/e2e/extractor-calls`, 404 senza `E2E_FAKE_SERVICES`; il contatore è un file
`<E2E_BLOB_DIR>/extractor-calls.txt`, perché le route non condividono la memoria) e un ritardo per
chiamata letto da `env.E2E_EXTRACTOR_DELAY_MS` (`EnvSchema` aggiunge
`E2E_EXTRACTOR_DELAY_MS: z.coerce.number().int().min(0).default(0)`); `playwright.config.ts` lo
imposta a `1500` nel `serverEnv`, così la variante con la ricarica ha tempo di interrompere la
coda.

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite precedente verde; il caricamento singolo invariato.
- **C — Comportamento nuovo** (locale, fake): suite verde; poi uno script Playwright usa e getta con
  seed A importa i 4 PDF sintetici e verifica sul DB: 3 estrazioni del lotto `extracted`, 0
  chiamate prima del clic, il quarto file non ha creato righe.
- **D — Sotto la UI**: `curl` con la sessione di A a `/bollette/da-rivedere?lotto=<lotto di B>` →
  elenco vuoto.
- **F — L'import delle bollette passate dell'owner, insieme** (in **produzione**, al via
  dell'owner, sul computer):
  1. l'owner raccoglie i PDF in una cartella sua (fuori dal repo) e li sceglie in
     `https://<dominio>/bollette/importa`;
  2. la pagina mostra la stima: **l'agente la ripete in chat con il numero di bollette e chiede
     l'OK esplicito** prima di «Avvia estrazione» (atteso: circa 0,30 $ a bolletta);
  3. durante la coda l'agente segue gli stati (sola lettura del DB di produzione con
     `turso db shell segnabollette`: `select status, count(*) from extractions where batch_id = …`);
  4. revisione insieme, dalla più vecchia: per ogni bolletta l'owner guarda totale, periodo e
     avvisi; le sovrapposizioni si decidono una per una (D-24);
  5. alla fine: numero di bollette confermate, scartate, fallite; costo reale del lotto (somma di
     `cost_micro_usd`) contro la stima.
  Che cosa NON copre: la coda offline (09).
- **G — Ripristino**: in locale lo script si cancella e le estrazioni sintetiche si scartano; in
  produzione restano le bollette vere confermate (sono i dati dell'owner) e le fallite si scartano.

## 8. Messa in esercizio

- Nessuna migrazione, nessuna variabile.
- Misura di chiusura: il collaudo F in produzione (è anche l'import vero).

## 9. Documentazione

- `doc/guide/estrazione.md`: sezione «Import multiplo» (lotti senza tabella, coda dal browser,
  pausa su `unavailable`, Wake Lock, ordine di revisione, la stima contro il costo reale misurato
  nel collaudo, con la data).
- `CLAUDE.md`: Latest (con l'esito dell'import: quante bollette, costo reale); § Key Features.
- `README.md`: § What it does (import multiplo).

## 10. Fuori ambito, dichiarato

- Message Batches API (scartata da D-18) → CLAUDE.md § Not yet present.
- Bollette a più pagine fotografate dentro un lotto → si caricano da `/bollette/carica`
  (adottata a); nessun erede.
- Importare i file da una cartella o da una casella email → CLAUDE.md § Not yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **M**.

```
Ciao, in questa sessione implemento la spec doc/v1/07-import-multiplo.md.

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), DESIGN.md, doc/guide/estrazione.md, doc/guide/app.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 07 INTERA
- Controlla con un grep che i contratti C-14, C-16, C-17 esistano con i nomi e le firme dell'indice

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/07-bulk-import. Crea SESSION_NOTES.md.

Implementa la spec 07 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima). La fase F è l'import
vero delle mie bollette passate in produzione: la stima la ripeti in chat e parte solo al mio OK.
Non decidere nulla che la spec ha già deciso; se trovi un punto che la spec non copre, fermati e
chiedimelo con AskUserQuestion. Le etichette della serie non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
