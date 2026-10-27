# Extraction — upload to Blob, Claude, review

> Domain guide (born 2026-10-25 with the upload and the extraction). AGENTS.md § 6 and § 8 keep
> the short rules and point here; the pages around it are `doc/guide/app.md`, the money and the
> monthly series `doc/guide/calcoli.md`. Every rule names the file that implements it; when the
> code and this page disagree, the code is right and this page is fixed in the same change. All
> figures below are invented.

## 1. The flow

A bill becomes data in five steps, and **Claude is called only at the owner's click**:

1. **Choose** (`src/components/upload/bill-uploader.tsx`, page `/bollette/carica`): one PDF, or up
   to 10 photos of the pages in order (Su / Giù / Rimuovi). Photos are converted to JPEG in the
   browser (`src/lib/upload/compress-photo.ts`: `createImageBitmap(…, { imageOrientation:
   'from-image' })`, long side at most 2,576 px, quality 0.85); a format the browser cannot decode
   says «Formato immagine non supportato: usa JPEG o PNG.». «Scatta foto» is an `<input
   capture="environment">`: it opens the camera on Android and iPhone, not on a desktop, so it is
   tried only from a real phone in production (the development server is not reachable from one).
   On iOS a HEIC photo from the gallery usually arrives as JPEG; when it does not, the message
   above is what the owner sees. The supply select starts on «Riconosci
   dalla bolletta»; a supply chosen there tells the model which kind to expect. The select lives
   inside `BillUploader` (props `mode`, `billId?`, `supplies?: { id, label }[]`,
   `preselectedSupplyId?`; the choice is its `supplyId` state): the page only passes the supplies.
2. **Create** — «Carica» computes each file's SHA-256 (`crypto.subtle.digest`) and calls
   `POST /api/extractions` with `{ supplyId, batchId, files: [{ sha256, contentType, sizeBytes }] }`.
   `createExtraction` (`src/lib/services/extractions.ts`) checks the files (§ 3), decides on
   duplicates (§ 8) and writes one `extractions` row (`uploading`) and one `documents` row per file,
   each with its pathname `users/<userId>/documents/<documentId>.<pdf|jpg>`.
3. **Upload** — the browser sends each file **straight to the private store**
   (`src/lib/blob/upload-client.ts`: `upload()` of `@vercel/blob/client` with `access: 'private'`,
   `handleUploadUrl: '/api/documents/upload'`, the document id as `clientPayload`). The token route
   (`src/app/api/documents/upload/route.ts`) asks `authorizeDocumentUpload`: the pathname must be a
   pending document of the session user; the token allows only that pathname, that content type
   and at most that type's limit (10 MB for a PDF, 5 MB for a photo; the declared size is checked
   in step 4). No file passes through a function on the way in (the 4.5 MB body limit of Vercel
   functions never applies).
4. **Verify** — `POST /api/extractions/[id]/uploaded` → `markExtractionUploaded` reads every file
   back from the store and runs `verifyDocument` (`src/lib/extraction/verify-document.ts`): size
   against the limit and against the declared size, magic bytes (`%PDF-`, `FF D8 FF`), SHA-256
   against the declared one, then for a PDF no `/Encrypt` dictionary and a page count from `unpdf`
   (at most 40; `unpdf` stays out of the webpack bundle through `serverExternalPackages`, and
   loads from `node_modules` on Vercel too, verified in production on 2026-10-26). All good → `queued` with `uploadedAt` and `pageCount`, and the answer is the
   estimate (§ 5). A bad file → `failed` with `document_invalid` and the reason; the files stay until
   «Scarta» so the owner sees why.
5. **Extract** — the page shows «Estrai (circa 0,31 $)» with «La bolletta resta in «Da rivedere»
   finché non la estrai» and «Scarta». Only the click calls `POST /api/extractions/[id]/run`
   (`maxDuration = 300`) → `runExtraction` → the extractor (§ 6). `extracted` → the page goes to
   `/bollette/revisione/<id>`; `failed` → the message with «Riprova», «Inserisci a mano» and «Scarta».

Then **review** (`/bollette/revisione/[id]`, `src/components/upload/extraction-review.tsx`): from
1024 px the PDF in an `<iframe>` (or the photos, in a scrollable region reachable from the
keyboard) beside `BillForm`; below 1024 px a button «Apri il PDF» (or the photos in a `<details>`),
because mobile browsers do not render a PDF inside a page. The form is the same `BillForm` of the
manual entry, prefilled by `toBillInput` (§ 4), with the warnings above it in a stamp box. A
recognised supply is named by `BillForm` itself; otherwise «A quale fornitura appartiene?» offers
the active supplies and «Crea una nuova fornitura» (house, kind, name, supplier, identifier,
photovoltaic). **«Conferma»** → `confirmExtractionAction` → `confirmExtraction`: claims the row
(`extracted` → `confirmed`, so a second click never makes a second bill), creates the new supply if
any, calls `confirmBill(…, { source: 'extraction' })`, links the documents to the bill and clears
`resultJson`. If `confirmBill` refuses (validation, an overlap without a decision) the new supply is
deleted again and the row goes back to `extracted`. **«Scarta»** → the documents' rows, then their
files; the extraction row stays, `discarded`, for the month's spend.

### States

| Status | Means | Leaves by |
|---|---|---|
| `uploading` | Rows written, files on their way | `…/uploaded` (→ `queued` or `failed`), a new upload that abandons it (§ 8), `documents:prune` after 24 h |
| `queued` | Files verified, waiting for «Estrai» | «Estrai» (→ `running`), «Scarta» |
| `running` | The call to Claude is in flight | its end (→ `extracted` / `failed`); after 6 minutes it counts as dead: «Riprova» and «Scarta» come back |
| `extracted` | A result waits for the review | «Conferma» (→ `confirmed`), «Scarta» |
| `failed` | `errorCode` + `errorMessage` | «Riprova» (not for `document_invalid`), «Scarta» |
| `confirmed` | The bill exists; `billId` set, `resultJson` null | — |
| `discarded` | No files, no result; the cost stays | — |

`/bollette/da-rivedere` (`src/components/upload/pending-extraction-list.tsx`) lists `uploading`
excluded, the other four live states with their actions; after a run from there, `extracted` opens
the review. The «Bollette» tab of `NavBar` and `SideBar` carries a badge with the count of
`extracted` rows (`countExtractedToReview`, computed in the `(app)` layout); `/bollette` shows
«Da rivedere (N)» next to «Carica bolletta» only when N > 0. The review's Server Actions (confirm,
discard) call `revalidatePath('/', 'layout')`; after each route call (create, uploaded, run) the
uploader and the «Da rivedere» list call `router.refresh()`, which also refreshes the badge.

### Routes

| Route | Answer |
|---|---|
| `POST /api/extractions` | 201 `{ extractionId, documents }`; 200 `{ duplicateOf, duplicateStatus, … }` (§ 8) |
| `POST /api/extractions/[id]/uploaded` | 200 the estimate |
| `POST /api/extractions/[id]/run` | 200 `{ status, errorCode, errorMessage }` |
| `POST /api/bills/[id]/documents` | 201 `{ documents }` — files attached to a bill, no extraction |
| `POST /api/bills/[id]/documents/uploaded` | 204 |
| `POST /api/documents/upload` | the Blob token exchange (`handleUpload`) |
| `GET /api/documents/[id]` | the file, `Cache-Control: private, no-store`, inline |
| `PUT /api/e2e/blob` | the fake upload; 404 unless `E2E_FAKE_SERVICES` |

Errors are `{ code, message, details }` with the status of `ERROR_STATUS`
(`src/lib/http/error-status.ts`): `VALIDATION` 400, `NOT_FOUND` 404 (a foreign id too),
`DUPLICATE_DOCUMENT` 409, `EXTRACTION_BUSY` 409, `DOCUMENT_INVALID` 422, `EXTRACTION_UNAVAILABLE`
503; anything else 500 «Errore inatteso: riprova più tardi.» with the error in the log.

## 2. Attachments

A bill entered by hand can get its files too: «Documenti» on `/bollette/[id]` (when the store is
configured) with `BillUploader mode="attach"` → `createAttachment` → upload →
`markAttachmentUploaded` (a bad file deletes the rows, then the files). An interrupted attachment of
the same file to the same bill resumes on the same document. Each document opens with «Apri» in a
new tab («PDF, N pagine» or «Pagina N»).

## 3. Files and limits

`src/lib/blob/types.ts` and `assertFiles` in the service (the messages below), checked again on
the stored bytes by `verifyDocument` (same rules, its own wording: «La foto supera i 5 MB.», «Il
file non è arrivato intero.») and, for a photo, first in the browser after compression («Una foto
supera i 5 MB anche dopo la compressione.»):

| Rule | Message |
|---|---|
| 1 to 10 files | «Carica da 1 a 10 file.» |
| A PDF alone | «Un PDF va caricato da solo.» |
| PDF or JPEG only (photos already converted) | «Carica un PDF o foto JPEG.» |
| PDF ≤ 10 MB, photo ≤ 5 MB | «Il PDF supera i 10 MB.» / «Una foto supera i 5 MB.» |
| Together ≤ 20 MB | «I file insieme superano i 20 MB.» |
| No file twice | «Lo stesso file compare due volte.» |
| PDF ≤ 40 pages | «La bolletta ha più di 40 pagine.» |
| PDF without encryption | «PDF protetto: carica le foto delle pagine.» |
| PDF readable | «PDF danneggiato.» |

Why `/Encrypt` is refused even when the PDF opens without a password: the API cannot read an
encrypted PDF, and photos of the pages always work.

## 4. The schema and the sentinels

`src/lib/extraction/schema.ts` (`ExtractionSchema`) is the structured output asked of Claude. **No
field is nullable**: structured outputs allow at most 16 union-typed parameters per schema, and a
bill has dozens of optional values. Absence is a sentinel that `toBillInput`
(`src/lib/extraction/to-bill-input.ts`) turns back into `null`:

| Field | Absent | Becomes |
|---|---|---|
| strings (offer, identifier, dates) | `""` | `null` |
| `conversionFactor`, `calorificValueGj` | `0` | `null` |
| `quantityUnit` | `'none'` (with quantity 0) | quantity and unit `null` |
| `unitPriceMicros` | `0` | `null` |
| `band` | `'none'` | `null` |
| `vatRatePercent` | `-1` | `vatRateBp` `null` (10 → 1000) |
| line `periodStart`/`periodEnd` | `""` (either) | the bill's period, both ends |

No numeric bound either (`minimum`, `maximum`): the only ones in the generated JSON schema are the
safe-integer limits that `.int()` adds, which the SDK moves into the description. `schema.test.ts`
guards both rules on `z.toJSONSchema(ExtractionSchema)`.

Other rules of `toBillInput`:

- A quantity of 0 **with** a unit stays `0` («Energia F3 0 kWh» is a fact, not an absence).
- A band only on electricity: on any other kind (the matched supply's, or the document's) every
  line's band becomes `null`. The model may write «single» on gas lines; `assertInputFitsSupply`
  refuses a band off electricity («La fascia vale solo per la luce.») and the form shows no band
  field there, so the review could not be confirmed (a real gas bill, 2026-10-27). The draft is
  rebuilt at every open of the review, so an extraction already waiting confirms after the fix.
- Readings: `actual` → `bill_actual`, `estimated` → `bill_estimated`; a reading without a date is
  dropped with the warning «Lettura senza data scartata: F1 1200».
- The supply: the preselected one if any (a different kind adds «Il documento sembra una bolletta
  di Luce»); otherwise the supply of the **same kind**, archived ones included, whose identifier
  matches after `normalizeSupplyIdentifier` (upper case, no spaces, dashes or dots: «IT 001
  E00000011» = «IT001E00000011»); never «the only electricity supply there is»; otherwise `suggestedSupply` with the kind, or kind `null`
  and «Tipo di utenza non riconosciuto» for `other`.
- `validateExtraction` (`src/lib/extraction/validate.ts`) checks what the schema cannot say: real
  calendar days, the period in order, at least one line, a unit for every non-zero quantity. A
  violation is `invalid_output` with the reasons; `isBill: false` alone is `not_a_bill` («Il
  documento non sembra una bolletta.»).

## 5. Cost and estimate

`src/lib/extraction/pricing.ts`: `costMicroUsd(usage, model)` = input tokens × USD per million +
output tokens × USD per million, in **micro-dollars** (integers, like the cents of the bills),
priced with the model that actually answered (the server-side fallback may answer with another).
`claude-opus-5-5` is 4 $ / 20 $; an unknown model is priced as `claude-opus-5` (the dearest known)
and logged.

The estimate before the click, `estimateExtractionCost({ pdfPages, photos })`: input
`pdfPages × 3,000 + photos × 4,800 + 4,000` tokens, output 10,000 tokens. An eight-page PDF:
`(28,000 × 4 + 10,000 × 20) = 312,000` micro-dollars, shown «0,31 $». The estimate is
deliberately high: four real bills (2026-10-26) cost about half of it, because their answers took
1,000–3,300 output tokens instead of 10,000; a production batch of twelve (2026-10-27, § 13) cost
2,00 $ against 3,74 $, about 0,17 $ a bill.

Every attempt adds its tokens and cost to the row (`COALESCE(col, 0) + n` in
`src/lib/db/repositories/extractions.ts`), refusals and truncated answers included: they were paid.
`monthlyExtractionSpend` sums the rows whose last `startedAt` falls in the Rome month (an extraction
tried on 30 September and retried on 1 October counts wholly in October); «Impostazioni» shows
«Questo mese: 0,62 $ in 2 estrazioni» and the model in use.

## 6. The call to Claude

`src/lib/extraction/anthropic-extractor.ts` — one **streamed** call per bill:
`client.beta.messages.stream({ model: 'claude-opus-5-5', max_tokens: 32000, betas:
['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'high', format
}, system, messages }, { timeout, maxRetries: 0, signal })`, then `finalMessage()`.

- **The format without `parse`.** `betaZodOutputFormat(ExtractionSchema)` returns a `parse` that
  the SDK runs as soon as the stream ends, before anyone looks at `stop_reason`: a refusal or an
  answer cut by `max_tokens` would throw «Failed to parse structured output» and the paid tokens
  would be lost. So only `{ type, schema }` is sent; `stop_reason` is checked first, then the text is
  `JSON.parse`d and validated with `ExtractionSchema.safeParse`.
- **No `temperature`**: API version 2026-10-21 answers 400 to it (AGENTS.md § 11).
- **No automatic retry** (`maxRetries: 0` on the client and the call): a failure shows «Riprova»
  and the owner decides whether to spend again.
- **The deadline**: `runExtraction` gives the extractor `deadlineMs = now + 280,000`; the call gets
  `timeout` and `signal: AbortSignal.timeout(…)` for the time left, so it ends before the
  function's 300 s; with less than 30 s left it fails as `timeout` without calling.
- The user turn: the documents first (one `document` block for the PDF, `image` blocks for the
  photos), then «Today is 2026-10-25. The user expects a gas bill. Extract the bill.».

### Outcomes

| `errorCode` | When | Tokens kept |
|---|---|---|
| — (`ok`) | `end_turn`, JSON valid | yes |
| `refusal` | `stop_reason: 'refusal'`, message with the category «(cyber)» | yes |
| `truncated` | `stop_reason: 'max_tokens'` | yes |
| `invalid_output` | JSON broken, schema or `validateExtraction` violated | yes |
| `not_a_bill` | `isBill: false` | yes |
| `timeout` | the deadline abort (`APIUserAbortError`), a connection timeout, < 30 s left | no |
| `unavailable` | 429, 5xx, connection errors, a stream that broke off (`AnthropicError`) | no |
| `api_error` | any other API status | no |
| `document_invalid` | the verification of § 1 step 4 | — |

## 7. Concurrency

- **One run at a time**: `claimExtractionForRun` is a single `UPDATE … RETURNING` that moves `queued`,
  `failed` (not `document_invalid`) or a `running` older than 6 minutes (`STALE_RUN_MS`) to
  `running` with a new `startedAt` and `attempts + 1`. No row returned → `EXTRACTION_BUSY`.
- **The end is conditional**: `finishExtractionRun` writes only `WHERE status = 'running' AND
  started_at = :startedAt`. A run discarded or taken over meanwhile writes nothing; its usage is
  still added (`addExtractionUsage`) — the result is thrown away, the cost is not.
- «Scarta» refuses a `running` younger than 6 minutes (`EXTRACTION_BUSY`).
- **One confirmation**: `claimExtractionForConfirm` moves only `extracted` to `confirmed`.

## 8. Duplicates and interrupted uploads

`decideDuplicates`, before any row is written, looks up each file's SHA-256 among the user's
documents (unique index `documents_user_sha256_uq`), in this order:

1. A file already in a bill → `DUPLICATE_DOCUMENT` with `{ billId, periodStart, periodEnd }`: «Questo
   file è già nella bolletta dal 01/09/2024 al 30/09/2024.» with «Apri la bolletta».
2. A file of a live extraction → 200 `{ duplicateOf, duplicateStatus }`: `queued` with its estimate
   (the page shows «Estrai»), `failed` with its error, `running` («Questa bolletta è già in
   lavorazione»), `extracted` (the page opens the review).
3. The **same** interrupted upload (same batch, same files in the same order) → `uploading` with
   the same `documents`: the browser uploads again to those pathnames (the token allows overwrite)
   and goes on.
4. Any other `uploading` extraction holding one of the files is **abandoned**: its rows are deleted
   in the same batch that writes the new ones (documents first: otherwise the unique index refuses
   the new rows), its files after.

Two uploads racing on the same file: the loser's insert breaks the unique index; the service
recognises the message (`documents.user_id, documents.sha256`) and answers as the duplicate.

## 9. The private store and deletions

- Pathnames `users/<userId>/documents/<documentId>.<ext>`; `access: 'private'`; never a public URL:
  a bill carries the holder's name, address and tax code.
  The app reads with the read-write token (`get(pathname, { access: 'private', useCache: false })`)
  and serves through `GET /api/documents/[id]` after checking the owner (`readDocumentFile`).
- `src/lib/blob/vercel-blob-store.ts` is the only file that uses the store API of `@vercel/blob`
  (`get`, `del`, `list`); the token route `src/app/api/documents/upload/route.ts` imports only
  `handleUpload` from `@vercel/blob/client`, and `upload-client.ts` is the only client importer.
- **Rows first, files after**, everywhere: deleting a bill, a supply, a house
  (`deleteBill`, `deleteSupply`, `deleteHouse` return `documentPathnames`; the actions call
  `deleteDocumentFiles` in `src/app/(app)/document-files.ts`), discarding an extraction. A file left
  behind by a failure is an orphan `documents:prune` finds; a row without its file would be a
  broken «Apri».
- Deleting the account: `deleteAllUserData` deletes documents and extractions with the rest, then
  Better Auth's `afterUserDeleted` deletes everything under `users/<userId>/` (in blocks of 500).
- Without `BLOB_READ_WRITE_TOKEN` or without `ANTHROPIC_API_KEY`, `/bollette/carica` says
  «Estrazione non configurata su questa installazione.» and offers «Inserisci a mano», and the
  «Carica bolletta» links are hidden (`isExtractionConfigured`); with the token alone, attachments
  still work (`isBlobConfigured`, both in `src/lib/container.ts`). Without the token the bill page
  has no «Documenti» and deletions do not touch Blob.

## 10. `documents:prune`

`pnpm documents:prune` (development: `.env.local`, a `file:` database only) or `pnpm
documents:prune -- --prod` (production: `.env.turso-prod`, which then needs a third line with the
**production** store's `BLOB_READ_WRITE_TOKEN`). It prints the database host and the store id
(never the secret), then lists:

- files under `users/` without a row in `documents`;
- extractions still `uploading` and attachments never uploaded (`uploadedAt` null) older than 24
  hours, with their files.

Blob Hobby allows 2,000 advanced operations (upload, list) and 10,000 simple ones (reads) a month,
then blocks the store for 30 days (`doc/guide/deploy.md`): `documents:prune` lists the whole store,
so it is never run in a loop, and «Da rivedere» never reads a file.

A dry run unless `-- --delete`; rows go first, files after. With an empty `documents` table and a
non-empty store it refuses without `-- --force` (a database paired with the wrong store would
delete real files); with an empty store too there is no file at risk, so it goes ahead and deletes
only stale rows (narrower than the first plan, which refused on any empty table; 2026-10-26). The
cross-user queries live in `src/lib/db/maintenance/prune.ts`, imported by no app module (AGENTS.md
§ 2.1).

## 11. The prompt

`src/lib/extraction/prompt.ts` (`EXTRACTION_SYSTEM_PROMPT`): English, with the Italian words the
bills print. Sections HEADER, LINES (which breakdown to use, the category of each section, the
sentinels), READINGS, IGNORE, WARNINGS, two EXAMPLEs. Personal data have no place in the schema and
the prompt says not to copy them.

**How to change it.** When a real bill comes out wrong, do not add a general rule: add an example
in the **exact shape of the document that failed**, with invented figures, next to the existing
one. Say a supplier prints the transport fixed share as «Quota potenza 3,00 kW × 1,800000 €/kW/mese
= 5,40» and it came back as `network` / `fixed` with quantity 1 month. The example to add:

```
EXAMPLE (invented figures)
"Quota potenza 3,00 kW × 1,800000 €/kW/mese = 5,40", printed in the transport section: category
network, component power, quantity 3, quantityUnit kW, unitPriceMicros 1800000, amountCents 540.
```

Then re-extract **that** bill in a guided verification (the owner's OK and the cost first), compare
with the printed lines, and keep the example only if the result is right. The prompt's category
list mirrors `LINE_CATEGORIES` (WARNING in `src/lib/domain/types.ts`).

**The second example (2026-10-26, owner).** A real gas bill printed only as a summary («Spesa
per la materia gas naturale» as one amount, the detail only online) came back with no quantity on
its commodity line, and «Conferma» refused it: a metered bill saves only with a commodity line in
the supply's unit (`assertInputFitsSupply`, «Serve almeno una voce della materia prima in Smc.»).
The example puts the printed «consumo fatturato» on that line (component lump, unit price 0);
`prompt.test.ts` keeps it in the prompt. The bill was fixed by hand in the review and not
re-extracted (the owner's choice): the next summary-only bill is the first to verify the example.

**What real bills have shown so far (2026-10-26).** Locally, an electricity, a gas (the
summary-only one above) and a telephone bill came back with the printed totals; in production, an
eight-page electricity PDF, and photos from a phone. Never seen on a real bill yet: a block of the
previous month re-billed with «voce di ricalcolo» lines (the gas example of the prompt is checked
only on the synthetic `gas-pellicano.pdf`), the warning «Importi stampati IVA inclusa» on a bill
printed VAT included, and any water bill. The first real bill of each kind is the check: compare
its lines with the printed ones before trusting the prompt on it.

**The production batch (2026-10-27).** Twelve electricity bills came back with their printed
totals; two of them, printed only as a summary, were read from the summary with the warning, the
consumption on the commodity line — the second example's first real check, passed. The other past
bills of the owner were read by hand (the owner's choice, no API) and showed what a future
extraction of them meets: a supplier that prints gas quantities rounded to whole Smc while it
computes the amounts on the decimals (the quantity × price check flags those lines; its
«Consumi» table has the decimals); fixed shares reversed in a «voce di ricalcolo» block printed
with a positive «28/365» next to a negative amount; a credit bill (negative total) whose credit
pays the next bills as an `outside` line; and a waste-tax saldo that re-bills the year and
deducts what the acconto billed, so it **adds** to the acconto («Si somma»), like an electricity
saldo that deducts its acconto's kWh.

## 12. The fakes

Under `E2E_FAKE_SERVICES=1` (Playwright's build; `NEXT_PUBLIC_E2E_FAKE_SERVICES=1` for the client
bundle) `src/lib/container.ts` swaps both services:

- **Store**: `createDiskBlobStore(E2E_BLOB_DIR)` (default `.e2e-blob`, wiped by
  `scripts/e2e-reset-db.mjs`); the browser uploads with `PUT /api/e2e/blob`, which checks the
  pending document like the token route. It returns a `DiskBlobStore`: the `BlobStore` plus
  `writeDocument(pathname, bytes)`, which that route and the test helpers use to put a file where
  the browser would.
- **Extractor**: `createFakeExtractor('tests/fixtures/extractions')` answers with
  `<sha256 of the first file>.json`; a JPEG without its own file gets `photo-default.json`; a file
  `{ "fail": "<code>" }` gives that failure without usage. Usage is always 10,000 in / 5,000 out
  (0,14 $).

`pnpm fixture:bills` (`scripts/make-bill-fixtures.ts`) writes the synthetic bills in
`tests/fixtures/bills/` — hand-made one-page PDFs of invented suppliers («Pellicano Energia»,
«Castoro Acque», «Armadillo Telecomunicazioni»), periods of 2024 — and their expected extractions
(the water bill is `acqua-castoro.pdf`, not «Lontra», because «Lontra» is the decoy word of the
access tests, `doc/guide/app.md` § 8);
the same bytes at every run, so the names never change. `luce-pellicano-rotta.pdf` is the
electricity bill with another issue date, mapped to `{ "fail": "unavailable" }`. Real bills never
enter the repository: they stay in the owner's folder and are tried only in a guided verification.

The service tests use the same pieces (`src/lib/extraction/testing/`): `tempBlobStore`,
`uploadFixture`, `runFixture`, `scriptedExtractor` (outcomes in turn, after an optional hook).

## 13. Bulk import

`/bollette/importa` (`src/components/import/bulk-importer.tsx`) brings in past bills by the dozen.
It reuses every route of § 1; what it adds is a **batch**, a queue driven by the browser and the
order of the review.

- **A batch has no table.** It is the `batch_id` its extractions share: a `nanoid()` made by the
  browser at «Carica N file», checked by `createExtraction` (`/^[A-Za-z0-9_-]{21}$/`, otherwise
  `VALIDATION` «Identificativo del lotto non valido.»). Its *open* extractions are the `queued`,
  `running`, `extracted` and `failed` ones; `uploading` ones do not count yet (the next creation
  abandons them, § 8, or `documents:prune` after 24 h), `confirmed` and `discarded` are closed. The
  *resumable* ones are the `queued` plus the `failed` with `unavailable`. Services in
  `src/lib/services/extractions.ts`: `listBatches` («Lotti in sospeso», newest first, with counts
  and what resuming costs), `listBatchExtractions` (one batch, review order),
  `nextExtractionToReview`, `listImportSupplies` (archived supplies too, last: past bills often
  belong to a closed supply). Their repositories are `listExtractionsOfBatch` and
  `listBatchedExtractions`; the files of every batch come from one `listDocumentsOfExtractions`.
- **Choose and upload.** Up to 50 files, each one a whole bill (a bill photographed in several
  pages goes through `/bollette/carica`); one supply for the whole batch, or «Riconosci dalla
  bolletta». Photos are converted as in § 1; every file is hashed in the browser and a second copy
  of the same bytes is marked «doppione di <name>» before any call (two creations with one SHA-256
  would race for the unique index). Then three at a time: create, upload, verify. The answers become
  rows: «pronta» («PDF, N pagine» or «Foto»), «già presente» (the file is in a bill:
  `DUPLICATE_DOCUMENT`, with «Apri la bolletta»), «già caricata» (a live extraction holds it),
  «file non valido: …» (`DOCUMENT_INVALID`), «non caricato: …» with «Riprova» (the same step and
  batch: an interrupted creation answers as the same `uploading` upload and resumes, § 8).
- **The estimate before anything runs.** «N bollette pronte · P pagine PDF · F foto · costo
  stimato circa X $» is the sum of what `…/uploaded` answered (§ 5) for each bill; only «Avvia
  estrazione» starts the queue. Estimate against real cost: 12 electricity PDFs of 6–10 pages in
  production (2026-10-27), «circa 3,74 $» shown, 2,00 $ paid, none failed.
- **The queue** (`src/lib/import/queue-runner.ts`, pure): `runQueue` runs at most two at a time,
  in the order the files were chosen (a browser keeps six connections per origin, and each run is
  a separate 300 s function). `toQueueItemResult` reads each answer of `…/run`: 200 is the
  extraction's own outcome; 401 (session expired), any 5xx (503 `EXTRACTION_UNAVAILABLE`, a 504
  from Vercel), a body that is not JSON and a fetch that throws all become `unavailable`; 409
  `EXTRACTION_BUSY` and 404 fail that row only. The first `unavailable` stops new starts — the
  runs in flight finish — and the page says «Anthropic non risponde: riprendi più tardi» with
  «Riprendi», which runs the ones never started, then the ones the service turned away. A pause is
  not a retry: nothing runs again without the click.
- **Resuming.** A page closed or reloaded halfway leaves its runs going on the server (they finish
  on their own; a function that died is taken over after six minutes, § 7, and a «Riprendi» before
  then gets `EXTRACTION_BUSY`, which does not pause). `/bollette/importa` lists the batch in «Lotti
  in sospeso» with «Riprendi (N in coda, circa X $)» → `/bollette/importa?lotto=<id>`, which shows
  the rows and their estimate and runs them only at its own «Riprendi».
- **The screen stays on** while the queue runs (`src/components/import/use-wake-lock.ts`, the
  Screen Wake Lock API where it exists: Chromium, Safari ≥ 16.4). The browser drops the lock when
  the page is hidden, so it is asked again when the page comes back; a refusal is ignored.
- **The review, oldest first.** `/bollette/da-rivedere?lotto=<id>` lists the batch by the extracted
  period start (no period last), then creation, then id: recalculations and overlaps are
  decided best from the oldest bill. In the review of a bill of a batch the form's only button is
  «Conferma e passa alla prossima»: `confirmExtractionAction` answers with `nextPath`, the next
  bill of the batch to review or, after the last, the batch's list, and `BillForm` follows it;
  «Scarta» goes back to the batch's list. A bill uploaded alone keeps «Conferma» and its own page.
- **Blob Hobby**: each file of a batch is one advanced operation (upload) out of 2,000 a month.

