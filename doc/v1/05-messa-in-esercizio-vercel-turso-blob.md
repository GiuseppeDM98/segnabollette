# 05 — Messa in esercizio: Vercel, Turso, Blob

> **Stato**: scritta 2026-10-24; riletta in modo adversariale il 2026-10-24: 20 rilievi, 1 decisione
> (D-41). Pronta per l'implementazione.
> **Branch**: `feature/05-deploy` da `main` aggiornato dopo il merge della 04. **Dipende da**: 04 (ritirata
> il 2026-10-24).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-1, D-2, D-4, D-37, D-40, D-41, D-51; scelte
> T-2, T-15, T-34; contratti usati C-2 (`createDb`); un contratto nuovo: C-22
> (`readProductionTarget`, `loadProductionTarget`, in `scripts/production-target.ts`).

## 1. Il problema oggi (prove)

1. Dopo la 04 l'app funziona solo in locale (`file:local.db`): l'owner non la usa dal telefono.
2. Vercel Hobby (doc lette il 2026-10-24): una sola regione (`regions` in `vercel.json`, `dub1` =
   Dublino), function 300 s, body 4,5 MB, uso solo personale e non commerciale, log runtime 1 ora;
   la regione di default dei progetti nuovi è `iad1`
   (https://vercel.com/docs/functions/configuring-functions/region,
   https://vercel.com/docs/plans/hobby). `ignoreCommand` in `vercel.json` è il passo «Ignored Build
   Step»: se il comando esce con 0 la build si salta e il deploy risulta «Canceled»
   (https://vercel.com/docs/project-configuration). Ogni push di un branch diverso da quello di
   produzione crea un deploy Preview, che senza variabili di Preview fallisce alla build.
3. Vercel Blob: lo store privato si crea con `vercel blob create-store <nome> --access private
   --region <r> [--environment <env>]`; **accesso e regione non si cambiano dopo**; la regione di
   default della CLI è `iad1`; `--yes` collega lo store a tutti gli ambienti, sviluppo compreso;
   collegare uno store aggiunge `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`
   all'ambiente; serve la CLI ≥ 50.20.0 (https://vercel.com/docs/cli/blob,
   https://vercel.com/docs/vercel-blob/private-storage). Senza emulatore locale, le prove in
   sviluppo scriverebbero nello store di produzione → due store (T-2).
4. Turso (https://docs.turso.tech/cli/db/create, letta 2026-10-24): `turso db create <nome>
   [--group]`, `turso db tokens create <nome>`; il piano free ha **un solo gruppo**, con la
   location scelta all'iscrizione; `aws-eu-west-1` è l'Irlanda. Su Windows la CLI si installa
   dentro WSL (https://docs.turso.tech/cli/installation). `turso db shell` non ha una modalità di
   sola lettura.
5. Le variabili d'ambiente: `vercel env add <NOME> <ambiente>` chiede il valore in modo
   interattivo; Production e Preview sono «Sensitive» di default
   (https://vercel.com/docs/cli/env, letta 2026-10-24). I segreti li digita l'owner: non passano
   mai dalla chat.
6. Vercel Deployment Protection in produzione metterebbe il login di Vercel davanti alla PWA
   (hevy-coach, gotcha del 2026-10-23): la produzione resta aperta, protetta dal login dell'app.

## 2. Obiettivo e criteri di accettazione

L'app in produzione sul dominio che Vercel assegna al progetto (`https://<progetto>.vercel.app`),
con Turso remoto migrato, i due store Blob creati, l'account dell'owner e le iscrizioni chiuse; le
misure di chiusura delle spec 01–04 rifatte in produzione; SETUP.md per chi fa il proprio deploy.

| # | Criterio | Prova |
|---|---|---|
| A1 | `vercel.json` con `regions: ["dub1"]` e un `ignoreCommand` che salta ogni build che non sia di produzione, qualunque sia il branch. | Revisione del file; il push di `feature/05-deploy` per la PR crea un deploy «Canceled» (build ignorata), non un'anteprima (`vercel ls`); il primo deploy di produzione gira in `dub1` (pagina del deploy). |
| A2 | `pnpm db:migrate:prod` applica le migrazioni al database nominato in `.env.turso-prod`, stampa l'host e rifiuta un URL che non comincia con `libsql://`. | Collaudo § 7 C0; test `scripts/production-target.test.ts` sulla funzione che sceglie l'URL. |
| A3 | Database Turso `segnabollette` creato, migrato, con un token; store `segnabollette-files` (privato, `dub1`, Production) e `segnabollette-files-dev` (privato, `dub1`, Development). | Output dei comandi annotato nel collaudo (senza segreti). |
| A4 | Variabili di produzione: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIGNUP_ENABLED`; più quelle che lo store aggiunge da sé. | `vercel env ls production` (nomi, mai valori). |
| A5 | In produzione: registrazione dell'owner; un account usa e getta di collaudo; inserimento di una bolletta inventata; isolamento fra i due account; dashboard; eliminazione dell'account usa e getta; poi `SIGNUP_ENABLED=false` e `/registrati` chiusa, `POST /api/auth/sign-up/email` rifiutato. | Collaudo § 7 C–E. |
| A6 | SETUP.md completo per questa fase (§ 4.4); README § Self-hosting (nuova) punta a SETUP.md; due screenshot del README presi dall'account di collaudo. | Revisione; gli screenshot entrano con il commit della 06 (§ 8). |

## 3. Decisioni

- **D-1** (Vercel Hobby, Turso, Blob, repo pubblico), **D-2** (chiave Anthropic personale: entra
  nella 06), **D-4** e **D-37** (iscrizioni chiuse dopo l'account dell'owner), **D-40** («Elimina
  account», provato qui in produzione), **D-51** (il modulo di una bolletta nuova parte con importi
  vuoti: vale nel collaudo C.3).
- **D-41** (nuova): il collaudo in produzione segue il merge. Commit unico e PR **prima** del merge
  (stato «implementata il <data>, branch `feature/05-deploy`»); dopo il merge, nella stessa sessione, il collaudo in
  produzione con l'owner; esito, gotchas e stato «in esercizio» si annotano in `SESSION_NOTES.md`,
  che in questo caso resta in vita (non tracciato), ed entrano nel commit della sessione della 06,
  che comincia scrivendoli.
- **T-2** (`dub1`, due store), **T-15** (rate limit su DB in produzione), **T-34** (su Turso remoto
  le foreign key sono spente: la cascade di Better Auth verso `users` non scatta).
- Adottate qui, ribaltabili:
  (a) se il gruppo Turso dell'owner non è in `aws-eu-west-1`, il database si crea comunque nel
  gruppo esistente (il piano free non ne permette un secondo); la location vera si scrive in
  CLAUDE.md (§ Current Status → Stack), in AGENTS.md § 8 e in `doc/guide/deploy.md`; SETUP.md
  consiglia a chi fa il proprio deploy la location più vicina a `dub1` (`aws-eu-west-1`) senza
  nominare quella dell'owner; Vercel resta in `dub1`;
  (b) ogni build che non sia di produzione si salta, qualunque sia il branch: `ignoreCommand` di
  `vercel.json` esce con 0 quando `VERCEL_ENV` non è `production` (niente `git.deploymentEnabled`);
  la Deployment Protection è «Standard Protection» (solo preview), la produzione è aperta;
  (c) le migrazioni di produzione girano **dalla macchina dell'owner prima del merge** che le
  richiede, mai dal build di Vercel;
  (d) l'account usa e getta del collaudo si chiama `collaudo-<data>@example.test`, lo registra e lo
  usa uno script Playwright usa e getta dell'agente e si elimina dalla UI («Elimina account») prima
  di chiudere le iscrizioni: è anche la prova di D-40 in produzione;
  (e) `ANTHROPIC_API_KEY` non si crea qui: la 06 la aggiunge con la sua prima chiamata;
  (f) le letture del DB di produzione nel collaudo le fa l'agente con uno script `tsx` usa e getta
  (fuori dal repo) che usa `loadProductionTarget()` e `createDb`, esegue solo `SELECT` e stampa
  conteggi e id, mai email o nomi dell'owner. La CLI di Turso serve solo all'owner per creare
  database e token (passo 2; su Windows dentro WSL, come dice la pagina di installazione);
  (g) gli script che scrivono in produzione passano tutti da C-22: `pnpm db:migrate:prod` sempre,
  gli altri (`pnpm documents:prune -- --prod` della 06, `pnpm riferimenti:pun -- --prod` della 08)
  dietro il flag `--prod`; senza `--prod` usano `.env.local` e rifiutano un URL che non comincia con
  `file:`. Mai variabili esportate nella shell.

## 4. La soluzione

### 4.1 File

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["dub1"],
  "ignoreCommand": "[ \"$VERCEL_ENV\" != production ]"
}
```

Il comando esce con 0 (build saltata, deploy «Canceled») per ogni deploy che non sia di
produzione, qualunque sia il branch (`feature/*`, `docs/*`, Dependabot); con `main` e con
`vercel redeploy … --target production` `VERCEL_ENV` è `production`, il comando esce con 1 e la
build parte. Niente `git.deploymentEnabled`.

`scripts/production-target.ts` (C-22, nessun effetto all'import):

```ts
/**
 * The production database that maintenance scripts write to, read from .env.turso-prod.
 *
 * Why a file and not variables exported into the shell: the same command must work from
 * PowerShell and from bash, and a script must refuse to run against a local file by mistake.
 */
import { config } from 'dotenv';

export function readProductionTarget(
  env: Readonly<Record<string, string | undefined>>,
): { url: string; authToken: string } {
  const url = env.TURSO_DATABASE_URL ?? '';
  const authToken = env.TURSO_AUTH_TOKEN ?? '';
  if (!url.startsWith('libsql://')) throw new Error(`Refusing a non-Turso database URL: "${url}"`);
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN missing in .env.turso-prod');
  return { url, authToken };
}

export function loadProductionTarget(): { url: string; authToken: string } {
  // override: a TURSO_DATABASE_URL left in the environment must never win over the production file.
  const result = config({ path: '.env.turso-prod', override: true });
  if (result.error) throw new Error('.env.turso-prod not found (see SETUP.md)');
  return readProductionTarget(process.env);
}
```

`process.env` si assegna al parametro senza cast; i letterali del test non nominano `NODE_ENV`.

`scripts/migrate-prod.ts` + script `"db:migrate:prod": "tsx scripts/migrate-prod.ts"`:

```ts
/**
 * Apply the committed migrations to the production database named in .env.turso-prod.
 *
 * Why not `pnpm db:migrate`: drizzle-kit reads .env.local, and the production pair is never
 * exported into the shell.
 */
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDb } from '@/lib/db/create-db';
import { loadProductionTarget } from './production-target';

async function main(): Promise<void> {
  const target = loadProductionTarget();
  console.log(`Migrating ${new URL(target.url).host} …`);
  const { db, client } = createDb(target);
  await migrate(db, { migrationsFolder: 'drizzle' });
  client.close();
  console.log('Done.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

Il modulo non esporta nulla e chiama `main()` senza guardia: il test importa solo
`scripts/production-target.ts`.

`.env.turso-prod` (gitignored da `.env.*`): due righe `TURSO_DATABASE_URL="libsql://…"` e
`TURSO_AUTH_TOKEN="…"`; lo crea l'owner. La 06 vi aggiunge una terza riga facoltativa,
`BLOB_READ_WRITE_TOKEN`, che `readProductionTarget` ignora.

### 4.2 Passi di messa in esercizio (nell'ordine; ogni passo con effetti esterni si annuncia e parte all'OK dell'owner)

1. **Strumenti**: l'agente lancia `pnpm dlx vercel@latest --version` (deve essere ≥ 50.20.0);
   l'owner, nel terminale dove usa la CLI di Turso (su Windows dentro WSL), lancia
   `turso --version` e la installa se manca (https://docs.turso.tech/cli/installation).
2. **Turso** (l'owner nel suo terminale):
   ```bash
   turso auth login
   turso group list                 # annota la location del gruppo (atteso aws-eu-west-1)
   turso db create segnabollette    # nel gruppo esistente
   turso db show segnabollette --url
   turso db tokens create segnabollette
   ```
   L'owner crea `.env.turso-prod` nella root del repo con l'URL e il token. Poi l'agente lancia
   `pnpm db:migrate:prod` (stampa solo l'host, che resta in chat) e fa la fase C0 di § 7.
3. **Progetto Vercel** (l'owner, dalla root del repo):
   ```bash
   pnpm dlx vercel@latest login
   pnpm dlx vercel@latest link --yes --project segnabollette
   pnpm dlx vercel@latest git connect
   ```
   Poi, dal pannello del progetto: Settings → Deployment Protection → «Standard Protection»;
   Settings → Functions → regione (deve risultare `dub1` dopo il primo deploy con `vercel.json`).
4. **Blob**:
   ```bash
   pnpm dlx vercel@latest blob create-store segnabollette-files --access private --region dub1 --environment production
   pnpm dlx vercel@latest blob create-store segnabollette-files-dev --access private --region dub1 --environment development
   pnpm dlx vercel@latest blob list-stores
   ```
   Mai `--yes` (collegherebbe lo store di produzione anche allo sviluppo).
5. **Variabili di produzione** (l'owner digita i valori):
   ```bash
   pnpm dlx vercel@latest env add TURSO_DATABASE_URL production
   pnpm dlx vercel@latest env add TURSO_AUTH_TOKEN production
   pnpm dlx vercel@latest env add BETTER_AUTH_SECRET production   # openssl rand -base64 32, nuovo
   pnpm dlx vercel@latest env add BETTER_AUTH_URL production      # https://<dominio di produzione>
   pnpm dlx vercel@latest env add SIGNUP_ENABLED production       # true, solo per ora
   pnpm dlx vercel@latest env ls production
   ```

**Commit e PR** (fra il passo 5 e il 6, D-41): i gate di WORKFLOW § 3 verdi (fase A di § 7); la
documentazione di § 9 che appartiene a questo commit; lo stato «implementata il <data>, branch `feature/05-deploy`» nella
riga «Stato» di questa spec e in § 5 dell'indice; CLAUDE.md → Latest; l'OK dell'owner per il commit
unico; push di `feature/05-deploy` e PR verso `main`. Esito atteso dichiarato prima: il push crea un
deploy «Canceled» (build ignorata, A1), nessuna anteprima.

6. **Merge della PR** su `main` (lo fa l'owner) → deploy di produzione; l'agente controlla che il log
   della build sia verde e che la function sia in `dub1`.
7. **Collaudo in produzione** (§ 7 C–F), con gli screenshot del README presi dall'account di
   collaudo prima di eliminarlo.
8. **Chiusura delle iscrizioni**:
   ```bash
   pnpm dlx vercel@latest env rm SIGNUP_ENABLED production
   pnpm dlx vercel@latest env add SIGNUP_ENABLED production       # false
   pnpm dlx vercel@latest redeploy <url del deploy di produzione> --target production
   ```

Dopo il passo 8: esito di 6–8, gotchas, screenshot e stato «in esercizio» della 05 in
`SESSION_NOTES.md`, che resta (non tracciato) per il commit della 06 (§ 8).

### 4.3 Che cosa cambia nel codice

Solo `vercel.json`, `scripts/production-target.ts`, `scripts/migrate-prod.ts`, lo script in
`package.json`, il test, SETUP.md e i documenti. Nessuna modifica all'app.

### 4.4 SETUP.md (nasce qui, in inglese)

Sezioni: *Prerequisites* (Node ≥ 22, pnpm via corepack, account GitHub, Vercel Hobby, Turso, la
CLI di Vercel ≥ 50.20, la CLI di Turso, su Windows dentro WSL) · *Run it locally* (clone,
`.env.local` da `.env.example`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`) · *Create the
database* (passo 2 e `.env.turso-prod`; consiglia la location più vicina a `dub1`,
`aws-eu-west-1`, senza nominare quella dell'owner) · *Create the Vercel project* (passo 3, con la
Deployment Protection e il perché di `ignoreCommand`) · *Create the file stores* (passo 4, con il
perché dei due store e del divieto di `--yes`) · *Environment variables* (tabella: nome, ambiente,
esempio, obbligatoria, chi la imposta — `BLOB_*` da Vercel) · *Deploy and first account* (passi
6–8, «Close the door») · *Updating* (migrazioni prima del merge con `pnpm db:migrate:prod`) ·
*Costs and limits* (Hobby solo uso personale e non commerciale; function 300 s e body 4,5 MB; Blob
Hobby 1 GB, 10.000 operazioni semplici e 2.000 avanzate al mese, oltre il limite lo store si blocca
per 30 giorni; Turso free 100 database e 5 GB, una sola location; ripristino di 1 giorno) ·
*Coming next*: le sezioni che la 06 (Anthropic), la 08 (PUN) e la 09 (PWA) aggiungono.

### 4.5 Rotazione dei segreti (va in `doc/guide/deploy.md`)

- `TURSO_AUTH_TOKEN`: `turso db tokens invalidate segnabollette` (invalida tutti i token: la
  produzione resta senza database fino al redeploy), `turso db tokens create segnabollette`, nuovo
  valore in `.env.turso-prod` e in production con `vercel env rm` e `vercel env add`, poi
  `vercel redeploy <url del deploy di produzione> --target production`.
- `BETTER_AUTH_SECRET`: nuovo valore (`openssl rand -base64 32`) con `vercel env rm` e
  `vercel env add`, poi redeploy; tutte le sessioni decadono e si rientra.
- `BLOB_READ_WRITE_TOKEN`: si rigenera dal pannello dello store, Vercel aggiorna la variabile, poi
  redeploy; la riga `BLOB_READ_WRITE_TOKEN` di `.env.turso-prod` (06), quando c'è, prende il nuovo
  valore.

## 5. Vincoli e trappole

- **AGENTS.md § 2.3 Secrets** — qui vuol dire che nessun valore di variabile passa dalla chat né
  da un file tracciato; l'agente legge solo i nomi (`vercel env ls`); `.env.turso-prod` è
  gitignored e non si stampa.
- **WORKFLOW § 1.6** — qui vuol dire che nessun dominio personale, email o nome dell'owner va in
  SETUP.md, nel commit o nella PR; nei file tracciati, nel commit e nella PR il dominio si scrive
  `<progetto>.vercel.app` e l'host Turso `<database>-<organizzazione>.turso.io`; l'URL reale di
  produzione e l'host stampato da `db:migrate:prod` restano in chat e in Vercel, mai in SETUP.md,
  nelle guide o in CLAUDE.md. Gli screenshot si prendono solo sull'account di collaudo (dati
  inventati).
- **T-34** — su Turso remoto le foreign key sono spente: la cascade di Better Auth che in locale
  pulisce `sessions` e `accounts` quando sparisce l'utente qui non scatta, quindi il controllo dopo
  «Elimina account» (§ 7) le guarda una per una.
- Migrazioni prima del merge (adottata c): un deploy che parte con uno schema non migrato fallisce
  alla prima query.
- `BETTER_AUTH_URL` deve essere esattamente l'origine di produzione (schema e host, senza `/`
  finale), altrimenti il controllo di origine rifiuta il login.
- La CLI crea gli store in `iad1` se manca `--region`: lo store sbagliato non si sposta, si
  cancella e si ricrea (`vercel blob delete-store`).
- Il rate limit di Better Auth in produzione (3 accessi ogni 10 s per IP) vale anche nel collaudo:
  lo script aspetta 10 s fra due chiamate di accesso o di registrazione.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `scripts/production-target.test.ts`: `readProductionTarget({ TURSO_DATABASE_URL: 'file:local.db', TURSO_AUTH_TOKEN: 'x' })` → lancia; `readProductionTarget({ TURSO_DATABASE_URL: 'libsql://db-x.turso.io' })` (senza token) → lancia; `readProductionTarget({ TURSO_DATABASE_URL: 'libsql://db-x.turso.io', TURSO_AUTH_TOKEN: 'x' })` → `{ url: 'libsql://db-x.turso.io', authToken: 'x' }`. | Togliere il controllo `libsql://` → il primo caso non lancia più e il test fallisce; togliere il controllo del token → il secondo caso fallisce. |

Il resto della prova è il collaudo in produzione: nessun test automatico tocca la produzione.

## 7. Collaudo guidato (WORKFLOW.md § 2)

Le letture del DB di produzione le fa sempre lo script `tsx` di sola lettura di § 3 (f); le
scritture del collaudo le fa uno script Playwright usa e getta nella cartella temporanea della
sessione (mai nel repo). Ogni fase dichiara l'esito atteso prima di partire.

- **A — Invarianza** (prima del commit): i gate di WORKFLOW § 3 verdi in locale.
- **C0 — Migrazione** (passo 2, prima del commit). Esito atteso dichiarato prima:
  `pnpm db:migrate:prod` stampa «Migrating <host> …» e «Done.»; lo script di sola lettura trova le
  10 tabelle (5 di Better Auth, 5 dell'app) e 2 righe in `__drizzle_migrations`; una seconda
  esecuzione stampa le stesse righe e non cambia nulla.
- **C — Comportamento nuovo** (dopo il passo 6; l'owner sul telefono, l'agente con gli script e
  con `curl`):
  1. `/` senza sessione → `/accedi`.
  2. L'owner si registra con il suo account vero. L'agente non vede la password.
  3. Lo script Playwright registra `collaudo-<data>@example.test` con
     `POST /api/auth/sign-up/email` (header `Origin` di produzione; password generata dallo script,
     mai stampata; i cookie della risposta diventano la sessione del browser) e dalla UI inserisce:
     casa «Casa Tasso» (parola spia), fornitura «Luce» con identificativo `IT001E00000099`, una
     bolletta con il periodo proposto dal modulo (dal primo all'ultimo giorno del mese scorso). Il
     modulo parte con importi e totale vuoti (D-51): lo script compila la voce «Energia» con
     100 kWh e 10,00 € e la voce «IVA» con 1,00 €, toglie con «Rimuovi» le altre quattro voci del
     modello («Altre spese di vendita», «Trasporto e gestione del contatore», «Oneri di sistema»,
     «Accise») e scrive «Totale bolletta» 11,00 €. Esito atteso: la scheda mostra 11,00 €; lo
     script di sola lettura → `total_cents` = 1100 per quella bolletta.
  4. La dashboard `/forniture/<id>` della fornitura di collaudo mostra un mese con 100 kWh e costo
     totale 0,1100 €/kWh; in `/` la card della «Luce» mostra 100 kWh e 0,1100 €/kWh dell'ultimo
     mese fatturato.
  5. Lo script prende due screenshot a 390 px, tema chiaro, sull'account di collaudo: `/` →
     `doc/screenshots/casa.png`, `/forniture/<id>` → `doc/screenshots/fornitura.png` (solo dati
     inventati; restano non tracciati fino al commit della 06).
- **D — Sotto la UI / E — Casi negativi** (coppia proprio/altrui sullo stesso URL): lo script, con
  la sessione di collaudo, apre `/bollette/<id della bolletta di collaudo>` → 200 e la pagina mostra
  11,00 €; l'owner, sul telefono con la sua sessione, apre lo stesso URL → 404.
- **E — Eliminazione dell'account di collaudo** (prova di D-40): lo script legge l'id dell'utente di collaudo, poi fa «Elimina
  account» dalla UI. Esito atteso dichiarato prima: zero righe con quel `user_id` in `houses`,
  `supplies`, `bills`, `bill_lines`, `meter_readings`, `sessions`, `accounts`, e zero righe in
  `users` con quell'email. Una riga rimasta in `sessions` o `accounts` è un difetto da correggere
  prima di chiudere (in locale la cascade lo nasconde).
- **E — Iscrizioni chiuse** (dopo il passo 8): `/registrati` dice «Le iscrizioni sono chiuse»;
  `curl -i -X POST https://<dominio>/api/auth/sign-up/email -H "Origin: https://<dominio>" -H
  'content-type: application/json' -d '{"name":"x","email":"x@example.test","password":"password-1"}'`
  → 4xx; lo script di sola lettura → zero righe in `users` con `x@example.test`.
- **F — Giro guidato**: l'owner apre l'app sul telefono (Android e/o iPhone), accede, guarda `/`
  e una scheda: che cosa si legge male sul telefono vero? Non copre l'installazione come app (09)
  né la fotocamera (06).
- **G — Ripristino**: account di collaudo già eliminato; gli script usa e getta (Playwright e
  `tsx`) si cancellano; gli screenshot restano in `doc/screenshots/` per il commit della 06;
  `.env.turso-prod` resta sulla macchina dell'owner (serve alle migrazioni future).

## 8. Messa in esercizio

È questa spec. Ordine (D-41): passi 1–5 (C0 al passo 2); gate verdi, commit unico e PR (stato
«implementata il <data>, branch `feature/05-deploy`»); passo 6 merge dall'owner → deploy; passo 7 collaudo in
produzione (§ 7 C–F); passo 8 chiusura delle iscrizioni.

Misura di chiusura: § 7 C0–E superati e annotati. Le spec 01–04 sono già in esercizio quando la 05
parte (regola 5 dell'indice); la 05 rifà in produzione le loro misure di chiusura (§ 7 C–E) e, se
una fallisce, si ferma e lo chiede all'owner.

L'esito di 6–8 (fasi C–F, con i difetti trovati), le gotchas nate dopo il merge, i due screenshot e
lo stato «in esercizio il <data>» della 05 si annotano in `SESSION_NOTES.md`, che resta in vita
(non tracciato). La sessione della 06 comincia scrivendoli: riga «Stato» di questa spec, indice
§ 5, CLAUDE.md → Latest, AGENTS.md § 11 e `doc/guide/deploy.md` se ci sono lezioni, README con gli
screenshot (§ 9); entrano nel commit della 06.

## 9. Documentazione

Nel commit della 05 (prima del merge):

- `SETUP.md`: nasce qui (§ 4.4).
- `README.md`: § Self-hosting nuova, dopo § Stack (tre righe e il link a SETUP.md); la riga
  «`SETUP.md` … arrives with spec 05.» si toglie e la tabella di § Documentation guadagna le righe
  `SETUP.md` e `doc/guide/deploy.md`; la riga Status dice che l'app è in produzione.
- `CLAUDE.md`: Latest (05 implementata; next: merge e collaudo in produzione); § Current
  Status → Stack: produzione su Vercel in `dub1` e la location Turso vera (§ 3 (a)); § Not yet
  present: via «SETUP.md: born in spec 05».
- **`doc/guide/deploy.md`** (nasce qui, ≤ 200 righe): le scelte (regione, due store, build non di
  produzione saltate con `ignoreCommand`, migrazioni prima del merge, protezione, location Turso
  vera), i comandi, gli script di produzione con C-22 e le letture di produzione di § 3 (f), i
  limiti Hobby, la rotazione dei segreti (§ 4.5).
- `AGENTS.md` § 8 Deploy: stub che rimanda a `doc/guide/deploy.md`, con la location Turso vera
  (§ 3 (a)); § 11 Gotchas con quelle incontrate nei passi 1–5 e la data.
- `WORKFLOW.md` § 3: la 05 controlla che il testo dica ciò che fanno gli script (produzione solo da
  `.env.turso-prod`, letto da `pnpm db:migrate:prod` e dagli script con `--prod`, mai variabili
  esportate nella shell; letture di produzione con uno script `tsx` usa e getta con
  `loadProductionTarget()` e `createDb`, solo `SELECT`) e che in «Where things are recorded»
  `SESSION_NOTES.md` resti in vita dopo una sessione con collaudo in produzione (D-41); corregge
  solo una differenza di sostanza, in questo commit.

Nel commit della 06 (da `SESSION_NOTES.md`, § 8):

- `README.md`, § What it does: i due screenshot a 390 px (tema chiaro) di `/` e di
  `/forniture/<id>`, presi al passo 7 sull'account di collaudo, in `doc/screenshots/casa.png` e
  `doc/screenshots/fornitura.png`.
- Stato «in esercizio» della 05 nella sua riga «Stato» e nell'indice § 5; CLAUDE.md → Latest;
  AGENTS.md § 11 e `doc/guide/deploy.md` con le gotchas dei passi 6–8.

## 10. Fuori ambito, dichiarato

- `ANTHROPIC_API_KEY` e il primo uso dello store → **06**.
- Il PUN nel database di produzione → **08**.
- Dominio personalizzato, backup automatici di Turso oltre il ripristino di 1 giorno del piano
  free, avvisi sugli errori → CLAUDE.md § Not yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **S** (poco codice, molti passi esterni).

```
Ciao, in questa sessione implemento la spec doc/v1/05-messa-in-esercizio-vercel-turso-blob.md.

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue
- Leggi doc/v1/00-INDICE.md per intero (decisioni D-37, D-40, D-41, scelte T-2, T-15, T-34,
  contratti C-2 e C-22, regole della serie) e poi la spec 05 INTERA

Prima di tutto: `git pull` su `main`; la 04 è ritirata (2026-10-24, stato in § 5 dell'indice e in
CLAUDE.md → Latest), quindi non c'è uno stato da scrivere per lei.

Prima della prima modifica: `git branch --show-current` deve dire main e `git pull` lo porta al
merge della 04; crea feature/05-deploy. Crea SESSION_NOTES.md.

Implementa la spec 05 esattamente come scritta: § 4.1 i file, § 6 il test con la mutazione che
lo prova portante, § 9 la documentazione del commit della 05 (SETUP.md, doc/guide/deploy.md,
AGENTS.md, README.md, CLAUDE.md, il controllo di WORKFLOW.md § 3). Poi guidami nei passi 1–5 di
§ 4.2 uno alla volta, con la fase C0 di § 7 al passo 2: ogni passo con effetti fuori dal disco
locale lo annunci e parte solo al mio OK; i segreti li digito io, tu leggi solo i nomi; l'URL di
produzione e l'host Turso restano in chat. Non decidere nulla che la spec ha già deciso; se trovi
un punto che la spec non copre, fermati e chiedimelo con AskUserQuestion. Le etichette della serie
non entrano nel codice né nel messaggio di commit.

Poi, nell'ordine di § 8: gate di WORKFLOW § 3 verdi; riassumi il diff, scrivi lo stato
«implementata il <data>, branch `feature/05-deploy`» nella riga «Stato» di questa spec e in § 5 dell'indice, aggiorna
CLAUDE.md → Latest, chiedimi l'OK per il commit (uno solo); push e PR verso main (il deploy del
branch risulta «Canceled»). Il merge lo faccio io. Dopo il merge: passo 6 (build verde, function in
dub1), passo 7 il collaudo in produzione di § 7 C–F fase per fase con l'esito atteso dichiarato
prima, passo 8 la chiusura delle iscrizioni. Esito, gotchas, screenshot e stato «in esercizio»
vanno in SESSION_NOTES.md, che resta: li scrive la sessione della 06 nel suo commit.
```
