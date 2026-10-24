# 05 — Messa in esercizio: Vercel, Turso, Blob

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/05-deploy` da `main`. **Dipende da**: 04 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-1, D-2, D-4, D-37; scelte T-2, T-15;
> nessun contratto nuovo.

## 1. Il problema oggi (prove)

1. Dopo la 04 l'app funziona solo in locale (`file:local.db`): l'owner non la usa dal telefono.
2. Vercel Hobby (doc lette il 2026-10-24): una sola regione (`regions` in `vercel.json`, `dub1` =
   Dublino), function 300 s, body 4,5 MB, uso solo personale e non commerciale, log runtime 1 ora;
   la regione di default dei progetti nuovi è `iad1`
   (https://vercel.com/docs/functions/configuring-functions/region,
   https://vercel.com/docs/plans/hobby).
3. Vercel Blob: lo store privato si crea con `vercel blob create-store <nome> --access private
   --region <r> [--environment <env>]`; **accesso e regione non si cambiano dopo**; la regione di
   default della CLI è `iad1`; `--yes` collega lo store a tutti gli ambienti, sviluppo compreso;
   collegare uno store aggiunge `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`
   all'ambiente; serve la CLI ≥ 50.20.0 (https://vercel.com/docs/cli/blob,
   https://vercel.com/docs/vercel-blob/private-storage). Senza emulatore locale, le prove in
   sviluppo scriverebbero nello store di produzione → due store (T-2).
4. Turso (https://docs.turso.tech/cli/db/create, letta 2026-10-24): `turso db create <nome>
   [--group]`, `turso db tokens create <nome>`; il piano free ha **un solo gruppo**, con la
   location scelta all'iscrizione; `aws-eu-west-1` è l'Irlanda.
5. Le variabili d'ambiente: `vercel env add <NOME> <ambiente>` chiede il valore in modo
   interattivo; Production e Preview sono «Sensitive» di default
   (https://vercel.com/docs/cli/env, letta 2026-10-24). I segreti li digita l'owner: non passano
   mai dalla chat.
6. Vercel Deployment Protection in produzione metterebbe il login di Vercel davanti alla PWA
   (hevy-coach, gotcha del 2026-10-23): la produzione resta aperta, protetta dal login dell'app.

## 2. Obiettivo e criteri di accettazione

L'app in produzione su `https://segnabollette.vercel.app` (o il dominio di produzione che Vercel
assegna al progetto), con Turso remoto migrato, i due store Blob creati, l'account dell'owner e le
iscrizioni chiuse; le misure di chiusura delle spec 01–04 rifatte in produzione; SETUP.md per chi
fa il proprio deploy.

| # | Criterio | Prova |
|---|---|---|
| A1 | `vercel.json` con `regions: ["dub1"]` e i deploy automatici solo da `main`. | Revisione del file; il primo deploy di produzione gira in `dub1` (pagina del deploy). |
| A2 | `pnpm db:migrate:prod` applica le migrazioni al database nominato in `.env.turso-prod`, stampa l'host e rifiuta un URL `file:`. | Collaudo § 7 C; test `migrate-prod.test.ts` sulla funzione che sceglie l'URL. |
| A3 | Database Turso `segnabollette` creato, migrato, con un token; store `segnabollette-files` (privato, `dub1`, Production) e `segnabollette-files-dev` (privato, `dub1`, Development). | Output dei comandi annotato nel collaudo (senza segreti). |
| A4 | Variabili di produzione: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIGNUP_ENABLED`; più quelle che lo store aggiunge da sé. | `vercel env ls production` (nomi, mai valori). |
| A5 | In produzione: registrazione dell'owner; un account usa e getta di collaudo; inserimento di una bolletta inventata; isolamento fra i due account; dashboard; eliminazione dell'account usa e getta; poi `SIGNUP_ENABLED=false` e `/registrati` chiusa, `POST /api/auth/sign-up/email` rifiutato. | Collaudo § 7 C–E. |
| A6 | SETUP.md completo per questa fase (§ 4.4); README § Self-hosting punta a SETUP.md. | Revisione. |

## 3. Decisioni

- **D-1** (Vercel Hobby, Turso, Blob, repo pubblico), **D-2** (chiave Anthropic personale: entra
  nella 06), **D-4** e **D-37** (iscrizioni chiuse dopo l'account dell'owner).
- **T-2** (`dub1`, due store), **T-15** (rate limit su DB in produzione).
- Adottate qui, ribaltabili:
  (a) se il gruppo Turso dell'owner non è in `aws-eu-west-1`, il database si crea comunque nel
  gruppo esistente (il piano free non ne permette un secondo) e la location si annota in SETUP.md e
  in CLAUDE.md; Vercel resta in `dub1`;
  (b) i deploy automatici dei branch `feature/*` sono spenti (`git.deploymentEnabled`), la
  Deployment Protection è «Standard Protection» (solo preview), la produzione è aperta;
  (c) le migrazioni di produzione girano **dalla macchina dell'owner prima del merge** che le
  richiede, mai dal build di Vercel;
  (d) l'account usa e getta del collaudo si chiama `collaudo-<data>@example.test` e si elimina dalla
  UI («Elimina account») prima di chiudere le iscrizioni: è anche la prova di D-40 in produzione;
  (e) `ANTHROPIC_API_KEY` non si crea qui: la 06 la aggiunge con la sua prima chiamata.

## 4. La soluzione

### 4.1 File

`vercel.json`:

```json
{
  "regions": ["dub1"],
  "git": { "deploymentEnabled": { "main": true, "feature/*": false } }
}
```

`scripts/migrate-prod.ts` + script `"db:migrate:prod": "tsx scripts/migrate-prod.ts"`:

```ts
/**
 * Apply the committed migrations to the production database named in .env.turso-prod.
 *
 * Why a script and not `pnpm db:migrate` with exported variables: the same command must work from
 * PowerShell and from bash, and must refuse to run against a local file by mistake.
 */
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDb } from '@/lib/db/create-db';

export function readProductionTarget(env: NodeJS.ProcessEnv): { url: string; authToken: string } {
  const url = env.TURSO_DATABASE_URL ?? '';
  const authToken = env.TURSO_AUTH_TOKEN ?? '';
  if (!url.startsWith('libsql://')) throw new Error(`Refusing to migrate a non-Turso URL: "${url}"`);
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN missing in .env.turso-prod');
  return { url, authToken };
}

async function main(): Promise<void> {
  const result = config({ path: '.env.turso-prod', override: true });
  if (result.error) throw new Error('.env.turso-prod not found (see SETUP.md)');
  const target = readProductionTarget(process.env);
  console.log(`Migrating ${new URL(target.url).host} …`);
  const { db, client } = createDb(target);
  await migrate(db, { migrationsFolder: 'drizzle' });
  client.close();
  console.log('Done.');
}

// Run only when launched directly, so the test can import readProductionTarget safely.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
```

`.env.turso-prod` (gitignored da `.env.*`): due righe `TURSO_DATABASE_URL="libsql://…"` e
`TURSO_AUTH_TOKEN="…"`; lo crea l'owner.

### 4.2 Passi di messa in esercizio (nell'ordine; ogni passo con effetti esterni si annuncia e parte all'OK dell'owner)

1. **Strumenti**: `pnpm dlx vercel@latest --version` (deve essere ≥ 50.20.0), `turso --version`
   (installato dall'owner se manca: https://docs.turso.tech/cli/installation).
2. **Turso** (l'owner nel suo terminale):
   ```bash
   turso auth login
   turso group list                 # annota la location del gruppo (atteso aws-eu-west-1)
   turso db create segnabollette    # nel gruppo esistente
   turso db show segnabollette --url
   turso db tokens create segnabollette
   ```
   L'owner crea `.env.turso-prod` con l'URL e il token. Poi `pnpm db:migrate:prod` (l'agente può
   lanciarlo: stampa solo l'host).
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
6. **Merge della PR** di questa spec su `main` → deploy di produzione; si controlla che il log della
   build sia verde e che la function sia in `dub1`.
7. **Collaudo in produzione** (§ 7 C–E).
8. **Chiusura delle iscrizioni**:
   ```bash
   pnpm dlx vercel@latest env rm SIGNUP_ENABLED production
   pnpm dlx vercel@latest env add SIGNUP_ENABLED production       # false
   pnpm dlx vercel@latest redeploy <url del deploy di produzione> --target production
   ```

### 4.3 Che cosa cambia nel codice

Solo `vercel.json`, `scripts/migrate-prod.ts`, lo script in `package.json`, il test, SETUP.md e i
documenti. Nessuna modifica all'app.

### 4.4 SETUP.md (nasce qui, in inglese)

Sezioni: *Prerequisites* (Node ≥ 22, pnpm via corepack, account GitHub, Vercel Hobby, Turso, la
CLI di Vercel ≥ 50.20, la CLI di Turso) · *Run it locally* (clone, `.env.local` da `.env.example`,
`pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`) · *Create the database* (passo 2) · *Create the
Vercel project* (passo 3, con la Deployment Protection) · *Create the file stores* (passo 4, con
il perché dei due store e del divieto di `--yes`) · *Environment variables* (tabella: nome,
ambiente, esempio, obbligatoria, chi la imposta — `BLOB_*` da Vercel) · *Deploy and first account*
(passi 6–8, «Close the door») · *Updating* (migrazioni prima del merge con `pnpm db:migrate:prod`)
· *Costs and limits* (Hobby solo uso personale; limiti di Blob e Turso con i numeri di § 1 e
l'avviso del blocco di 30 giorni di Blob) · *Coming next*: le sezioni che la 06 (Anthropic), la 08
(PUN) e la 09 (PWA) aggiungono.

## 5. Vincoli e trappole

- **AGENTS.md § 2.3 Secrets** — qui vuol dire che nessun valore di variabile passa dalla chat né
  da un file tracciato; l'agente legge solo i nomi (`vercel env ls`); `.env.turso-prod` è
  gitignored e non si stampa.
- **WORKFLOW § 1.6** — nessun dominio personale, email o nome dell'owner in SETUP.md, nel commit o
  nella PR; l'esempio di dominio è `segnabollette.vercel.app`.
- Migrazioni prima del merge (adottata c): un deploy che parte con uno schema non migrato fallisce
  alla prima query.
- `BETTER_AUTH_URL` deve essere esattamente l'origine di produzione (schema e host, senza `/`
  finale), altrimenti il controllo di origine rifiuta il login.
- La CLI crea gli store in `iad1` se manca `--region`: lo store sbagliato non si sposta, si
  cancella e si ricrea (`vercel blob delete-store`).
- Il rate limit di Better Auth in produzione (3 accessi ogni 10 s per IP) vale anche nel collaudo:
  fra un tentativo e l'altro si aspetta.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `scripts/migrate-prod.test.ts`: `readProductionTarget({ TURSO_DATABASE_URL: 'file:local.db', TURSO_AUTH_TOKEN: 'x' })` → errore; `libsql://` senza token → errore; `libsql://db-x.turso.io` con token → l'oggetto. | Accettare `file:` → il primo caso passa. |

Il resto della prova è il collaudo in produzione: nessun test automatico tocca la produzione.

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite locale verde prima del merge.
- **C — Comportamento nuovo** (dopo il passo 6, l'owner sul telefono, l'agente con `curl` e con
  `turso db shell segnabollette` in sola lettura):
  1. `/` senza sessione → `/accedi` (esito atteso dichiarato prima).
  2. L'owner si registra con il suo account vero. L'agente non vede la password.
  3. L'agente (o l'owner) registra `collaudo-<data>@example.test` e inserisce: casa «Casa
     Collaudo», fornitura «Luce» con identificativo `IT001E00000099`, una bolletta del mese scorso
     con 100 kWh, «Energia» 10,00 €, «IVA» 1,00 €, totale 11,00 €. Esito atteso: la scheda mostra
     11,00 €; `turso db shell` → `select total_cents from bills where …` = 1100.
  4. La dashboard `/forniture/<id>` della fornitura di collaudo mostra un mese con 100 kWh e
     costo totale 0,1100 €/kWh.
- **D — Sotto la UI / E — Casi negativi**: con la sessione dell'owner si apre
  `/bollette/<id della bolletta di collaudo>` → 404; con la sessione di collaudo → si apre
  (coppia proprio/altrui).
- Poi «Elimina account» dell'utente di collaudo → `turso db shell`: nessuna riga in `houses`,
  `supplies`, `bills`, `bill_lines` per quell'utente e nessuna riga in `users` con quell'email.
- Passo 8 → `/registrati` dice «Le iscrizioni sono chiuse»; `curl -i -X POST
  https://<dominio>/api/auth/sign-up/email -H "Origin: https://<dominio>" -H 'content-type:
  application/json' -d '{"name":"x","email":"x@example.test","password":"password-1"}'` → 4xx e
  nessuna riga nuova.
- **F — Giro guidato**: l'owner apre l'app sul telefono (Android e/o iPhone), accede, guarda `/`
  e una scheda: che cosa si legge male sul telefono vero? Non copre l'installazione come app (09)
  né la fotocamera (06).
- **G — Ripristino**: account di collaudo già eliminato; `.env.turso-prod` resta sulla macchina
  dell'owner (serve alle migrazioni future).

## 8. Messa in esercizio

È questa spec. Ordine: passi 1–5 prima del merge, 6 merge, 7 collaudo, 8 chiusura. Misura di
chiusura: § 7 C–E superati e annotati; le spec 01–04 diventano **in esercizio** con questa data
(regola 5 dell'indice: «la 05 rifà in produzione le misure di chiusura di 01–04»).

## 9. Documentazione

- `SETUP.md`: nasce qui (§ 4.4).
- `README.md`: § Self-hosting (tre righe e il link a SETUP.md), stato aggiornato.
- `CLAUDE.md`: Latest; § Current Status (produzione attiva, regione, location Turso); § Not yet
  present: via «SETUP.md: born in spec 05».
- **`doc/guide/deploy.md`** (nasce qui, ≤ 200 righe): le scelte (regione, due store, migrazioni
  prima del merge, protezione), i comandi, i limiti Hobby, come si ruota un segreto.
- `AGENTS.md` § 8 Deploy: stub che rimanda a `doc/guide/deploy.md`; § 11 Gotchas con quelle
  incontrate e la data.
- `WORKFLOW.md` § 3: «Inspecting real data state» con `turso db shell segnabollette` reale.
- Stato «in esercizio» di 01–04 nell'indice § 5 e nelle loro righe «Stato».

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
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 05 INTERA

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/05-deploy. Crea SESSION_NOTES.md.

Implementa i file di § 4.1 e SETUP.md, poi guidami nei passi di § 4.2 uno alla volta: ogni passo
con effetti fuori dal disco locale lo annunci e parte solo al mio OK; i segreti li digito io, tu
leggi solo i nomi. Il collaudo § 7 si fa in produzione, fase per fase, con l'esito atteso
dichiarato prima. Non decidere nulla che la spec ha già deciso; se trovi un punto che la spec non
copre, fermati e chiedimelo con AskUserQuestion.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» di questa spec e delle 01–04 e in
§ 5 dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
