# Prompt di ritiro di una spec in esercizio — serie `doc/v1/`

> Generato il 2026-10-24 da 08_CREA_RITIRO_SPEC. Chi lo usa dopo un ritiro aggiorna i precedenti e
> le misure e lascia il corpo com'è; il ritiro dell'ultima spec porta via questo file con la cartella.
>
> Misure del 2026-10-24, dopo la lettura adversariale e prima della spec 01: nove spec vive (01 → 09,
> in quest'ordine, `00-INDICE.md § 5`), nessuna ritirata, nessun codice. Dopo il ritiro della 04
> (2026-10-24): cinque spec vive (05 → 09), 01–04 ritirate (PR #3, #5, #7, #9). In questo repo «README §
> Documentazione» è `README.md § Documentation`. Branch di un ritiro: `docs/v1-ritiro-<NN>` da `main`
> aggiornato (la forma dei branch di soli documenti: `docs/v1-lettura-adversariale`, e
> `docs/v1-chiusura` nella § 8 della 09).

---
SPEC DA RITIRARE: doc/v1/NN-nome.md      <- l'unico punto da compilare

Ritira la spec scritta qui sopra. Nel resto di questo prompt <SPEC> è quel percorso, <NN>
il suo numero e <SLUG> il resto del nome senza «.md»: ricavali tu, non chiedermeli. Se il
file non esiste, FERMATI e dimmelo prima di fare qualsiasi cosa.

PREREQUISITO, da misurare e non da assumere: la spec è IN ESERCIZIO, cioè (regola 5 di
`doc/v1/00-INDICE.md § 7`, WORKFLOW.md § 3 «A verification in production happens after the
merge»): per 01–04, che vivono prima del deploy, la PR del branch della spec (colonna Branch di
`00-INDICE.md § 5`: `feature/01-scaffold-auth`, `feature/02-data-engine`,
`feature/03-design-manual-entry`, `feature/04-dashboard`) è mergiata su `main` (`git fetch && git
log origin/main --merges --format="%h %ad %s" --date=short | grep "feature/<NN>-"`, che dà anche
il numero della PR: «Merge pull request #N from GiuseppeDM98/feature/…») E il collaudo di § 7
della spec è annotato in `CLAUDE.md § Current Status → Latest` (se la voce è già stata sostituita,
nel messaggio del commit della spec: `git log -1 --format=%B <hash>`); per 05–09 la PR mergiata su
`main` (stesso grep; `feature/05-deploy`, `feature/06-extraction`, `feature/07-bulk-import`,
`feature/08-market-references`, `feature/09-pwa-offline`) E il deploy di produzione di quel merge
verde su Vercel (`vercel ls`: «Ready»; i deploy dei branch sono «Canceled» per l'`ignoreCommand`
di `vercel.json` e non contano) E la misura di chiusura di § 8 della spec rifatta in produzione
dopo il merge, con l'esito scritto. Dalla 05 (D-41, rivista il 2026-10-25) quell'esito, lo
stato «in esercizio il <data>, PR #N» e le gotchas li porta il commit di chiusura della sessione
stessa, sul branch `docs/<NN>-in-esercizio` mergiato su `main` (`git log origin/main --merges
--format="%h %ad %s" --date=short | grep "docs/<NN>-in-esercizio"`; il messaggio del commit,
`git log -1 --format=%B <hash>`, riporta l'esito fase per fase): se quella PR manca, o la riga
«Stato» della spec non dice «in esercizio», il segnale manca. La 05 ha un segnale in più: le misure di chiusura di 01–04 rifatte in produzione (sua
§ 7 C–E). La 09 è l'ultima: il suo segnale è il giro F1–F4 sui due telefoni, e il suo ritiro è
la sessione di chiusura di soli documenti della sua § 8 (che ne fa anche i compiti: «v1 completa»
in CLAUDE.md e README); F5 (il toast «Nuova versione disponibile» dopo un deploy nuovo) resta per
la prima sessione dopo la v1 e non è un segnale. NON sono segnali: il collaudo locale, la suite
verde, lo stato «implementata» (commit e PR prima del merge), un deploy «Canceled»; e il caso
reale — la prima bolletta dell'acqua con la casa nuova (D-21), il fotovoltaico (D-29), il 4
ottobre nel calendario delle fasce fino al PDF GME di ottobre 2027 (T-26), un fornitore mai
visto dall'estrazione. Il
caso reale NON è un prerequisito: dove è a portata di giorni lo si cerca e lo si scrive,
ma non lo si aspetta mai — ciò che l'uso vero insegnerà diventa feedback e poi una spec
nuova, e quando il caso arriva si annota nella riga di stato della spec ritirata, come
storia. Il collaudo della sessione di implementazione vale come prova della spec, non
come segnale. DDL della serie: solo migrazioni drizzle generate con `pnpm db:generate` e
committate in `drizzle/` (mai `drizzle-kit push`, AGENTS.md § 4), tutte additive al 2026-10-24 —
`0000` tabelle auth (01) e `0001` tabelle dell'app (02), applicate in locale con `pnpm db:migrate`
e in produzione per la prima volta dalla 05 (sua fase C0); `0002` `extractions` e `documents` (06)
e `0003` `reference_prices` (08), applicate con `pnpm db:migrate:prod` PRIMA del merge, dopo la
PR, all'OK dell'owner; 03, 04, 05, 07 e 09 non hanno una migrazione loro. Prova che è stato speso:
per 01 e 02, su `main`, `pnpm db:generate` senza diff e la migrazione in `git log --oneline --
drizzle/`; per 05, 06 e 08, uno script `tsx` usa e getta di sola lettura con
`loadProductionTarget()` e `createDb` (WORKFLOW.md § 3 «Inspecting real data state»), lanciato da
te, che stampa le righe di `__drizzle_migrations` — attese 2 dopo la 05, 3 dopo la 06, 4 dopo la
08 — e i nomi delle tabelle (`SELECT name FROM sqlite_master WHERE type='table'`: 5 di Better
Auth e 5 dell'app dopo la 05, come la C0 della 05), mai una riga dell'owner. Un DDL distruttivo,
se una spec lo portasse, va dopo il deploy del codice che non legge più la colonna, e da solo. Se un criterio non regge, un segnale manca o uno script non è stato
speso, FERMATI e dillo: una spec si ritira intera, mai a metà, e non si ritira una spec
la cui implementazione ha lasciato un «da decidere».

LETTURE OLTRE AL PROMPT STANDARD (WORKFLOW.md, AGENTS.md, CLAUDE.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md, la guida del dominio): README § Documentazione · l'indice
della serie per intero · la spec INTERA, compresa l'intestazione con lo stato scritto
dalla sessione che l'ha implementata e le divergenze dichiarate lì · `git log
--format="%h %s" -- <SPEC>` · i precedenti da imitare: in questo repo (`git log -i --grep=ritir --grep=retire`) `704288c`
(2026-10-24, la 01: quattro difetti corretti, la guardia degli scope dei repository irrobustita),
`04ff2ca` (2026-10-24, la 02: due test portanti aggiunti, `calcoli.md` allineata al codice) e il
ritiro della 03 (2026-10-24, `git log --grep="retire spec 03"`: il primo che ha cambiato il
comportamento dell'app — due divergenze del modulo corrette su decisione dell'owner, tre prove
mancanti aggiunte e viste rosse con la mutazione, `app.md` riallineata al codice) e il ritiro
della 04 (2026-10-24, `git log --grep="retire spec 04"`: le divisioni del modulo spostate in
`format.ts`, quattro prove aggiunte e viste rosse — l'archiviata nella Casa, l'ordine dei grafici,
le etichette del gas, la metà di B della coppia d'isolamento —, la spec 08 riallineata al grafico
che esiste); da
net-worth-tracker, serie `doc/mobile/`, letti con `git -C ../net-worth-tracker show --stat <hash>`
e il messaggio intero: `bdef4fed` (2026-10-16, MOB-08: l'ultimo ritiro con la serie viva e
l'ultimo che ha corretto codice — sei difetti, ciascuno col suo test; non imitarne l'ampiezza: lì
il ritiro ha anche ridisegnato una pagina) · `de8bafc9` (2026-10-17, MOB-09: l'ultimo che ha chiuso
una serie con il suo indice — cartella via, 753 rimandi a decisioni numerate riscritti in 175 file
come regola + data + casa, la storia della serie in README § Documentation) · `9d39c104`
(2026-10-10, MOB-01: il primo con la serie viva — spec sorelle e prompt di ritiro ripuntati,
quattro difetti degli script corretti). Ogni riferimento
nel codice a un documento ritirato si riscrive in loco perché il perché resti in piedi
da solo, tenendo le date.

ORDINE DI LAVORO

1) VERIFICA CRITERIO PER CRITERIO, prima di cancellare qualsiasi cosa: per ogni criterio
   di accettazione, esiste nel codice? e la prova è quella che il criterio nomina (il test
   con la sua prova di portanza, la misura del collaudo)? Le decisioni sono state
   rispettate una per una, e le scelte «ribaltabili» sono rimaste com'erano o il
   ribaltamento è scritto? Le divergenze dichiarate sono ancora vere? La documentazione
   della spec è stata fatta (guide, README, CLAUDE.md, i totali rimisurati)? E ogni
   RINVIO («la spec successiva lo eredita», «fuori ambito, dichiarato») ha un erede: il
   codice, una spec viva per esteso, l'indice o CLAUDE.md § Not yet present.
   ⚠️ La verifica si fa CON UN WORKFLOW, in sola lettura e tutto Opus: un agente per
   gruppo di criteri, uno per le decisioni e le scelte, uno per la documentazione e i
   rinvii, uno per i contratti condivisi; a ciascuno la lista e la richiesta di
   percorso:riga per ogni voce, mai una conferma; poi un verificatore per segnalazione.
   Sotto i dieci agenti, nessuno scrive file. I punti che reggono li rileggi in proprio
   prima di correggere; correzione, travaso e tutto ciò che segue li fai tu.
   ⚠️ Una divergenza si CORREGGE o si SCRIVE, mai si accetta in silenzio: è l'ultima
   occasione, dopo il testo sparisce.
   ⚠️ Un difetto trovato: prima la sua CLASSE con un grep su tutto il repo; ogni fix
   vuole il test che lo fissa, provato portante rimettendo il difetto.
   ⚠️ I CONTRATTI CONDIVISI: ciò che questa spec doveva creare per le successive esiste
   con QUEL nome e quella firma? Se no, si aggiornano l'indice e OGNI spec viva che lo
   cita (testo e prompt in fondo).

2) MISURA I RIFERIMENTI, non stimarli: la cartella e il numero in tutto il repo tracciato,
   `git grep -n -e "doc/v1/<NN>-" -e "<SLUG>" -e "spec <NN>"`; il numero nell'indice e nelle
   spec sorelle, con le forme che la serie usa («la 05», «della 05», «(05)», «→ **05**»,
   «| 05 |», «05, 06», «05–09»):
   `grep -n -E "\b(spec|la|della|dalla|alla|nella|sulla|dalle?|fino alla) <NN>\b|\b<NN>-[a-z]|\*\*<NN>\*\*|\(<NN>\)|\| <NN> \||<NN>–0[0-9]|0[0-9]–<NN>\b|, <NN>\b|\b<NN>, |<NN>\+" doc/v1/*.md | grep -v "^<SPEC>"`
   (38 esiti per la 05 dopo il ritiro della 04, 2026-10-24; gli intervalli che la contengono senza nominarla, come
   la 02 in «01–04», si leggono a occhio); il titolo a parole (la riga 1 della spec dopo «NN —
   »): `git grep -n -i "<titolo>" -- ':!<SPEC>'`; gli orfani numerici nel codice,
   `git grep -n -E "\b(D|T|C|P)-[0-9]+\b|\bspec [0-9]{2}\b|doc/v1" -- src scripts tests drizzle data public '*.config.*' vercel.json package.json .env.example`:
   la regola 1 della serie (`00-INDICE.md § 7`, AGENTS.md § 2.2) vieta le etichette in
   identificatori, test, commenti e messaggi di commit, quindi ogni esito è un difetto da
   riscrivere in loco con il perché e la data — zero esiti attesi. Le etichette D-N, T-N, C-N,
   P-N e i numeri delle spec restano vivi nell'indice e nelle spec sorelle finché vive
   l'indice (lì un D-N nato dalla spec ritirata resta, si ripunta solo il rimando alla spec), e
   nei documenti del repo fuori dalla cartella
   (`git grep -n -E "\b(D|T|C|P)-[0-9]+\b|spec [0-9]{2}\b|doc/v1" -- ':!doc/v1'`: 34 righe dopo
   il ritiro della 04, 2026-10-24 — AGENTS.md 14, CLAUDE.md 8, WORKFLOW.md 7, README.md 5), dove però ogni
   rimando alla spec ritirata si riscrive (un «*(from spec NN)*» di AGENTS.md diventa la data,
   una riga di WORKFLOW.md § 3 perde «spec NN» e tiene il perché). Tre categorie, tre trattamenti: CODICE,
   TEST e COMMENTI → riscritti in loco, veri e autosufficienti senza il documento, con
   le date; SPEC ANCORA VIVE → ripuntate al codice (percorso e nome verificati adesso),
   alla guida o alla regola dove la decisione ora vive; SPEC che la citano come
   appuntamento («dopo la NN») → lasciate.

3) TRAVASA ciò che è ancora operativo, prima di cancellare: il perché di una scelta,
   una decisione precedente RIBALTATA con la data, un limite dichiarato, una trappola
   misurata al collaudo. Un pezzo in UN posto solo: un pattern o una regola di tutto il
   repo → la sua sezione di `AGENTS.md` (regola + data + dove è fissata), una trappola
   misurata → `AGENTS.md § 11 Gotchas` con la data; un'invariante dura (isolamento per utente,
   denaro e date, niente cascade) → `AGENTS.md § 2`, che la dice già: si corregge, non si
   duplica; una narrazione di dominio → la guida del tema in `doc/guide/` (`calcoli.md` dalla
   02, `app.md` dalla 03 e la dashboard della 04, `deploy.md` dalla 05, `estrazione.md` dalla
   06 e l'import della 07, `riferimenti.md` dalla 08, `pwa.md` dalla 09); una regola visiva →
   `DESIGN.md` SOLO con la skill impeccable (dalla 03, mai a mano); una regola di sessione o un
   comando → `WORKFLOW.md § 3` (§ 1–2 solo passando dallo standard di claude-config); lo stato →
   `CLAUDE.md § Current Status → Latest`, una riga che SOSTITUISCE la precedente, e una cosa
   lasciata fuori → `CLAUDE.md § Not yet present`, una riga; i segnali del collaudo (test, E2E,
   fasi saltate, il giro guidato) → il messaggio del commit, mai CLAUDE.md (WORKFLOW.md § 2
   «The outcome is one line»); ciò che vede l'utente o chi fa il proprio deploy → `README.md` e
   `SETUP.md` (dalla 05), in inglese; il perché di una riga → un commento in loco (COMMENTS.md),
   in inglese, senza etichette della serie; `Draft Release Temp.md` non dice mai «spec retired». Sostituire, mai accumulare.
   In CLAUDE.md una riga di modulo resta la domanda e il rimando: la data, il tipo nuovo,
   il dettaglio vanno nella guida, mai in coda alla riga (nell'Hub, 2026-10-12 → 2026-10-17,
   così CLAUDE.md è tornato da 20k a 27k caratteri).
   Il prompt, il modello e l'effort in fondo alla spec NON si travasano.

4) CANCELLA la spec (`git rm <SPEC>`): testo, criteri, stato e divergenze restano in
   `git log`, che si cita come archivio. L'indice RESTA finché vive un'altra spec della
   serie.
   ⚠️ SE È L'ULTIMA SPEC DELLA SERIE, si ritira la CARTELLA INTERA — l'indice, il README,
   i file di riferimento, questo stesso prompt — e PRIMA di cancellarla tutto ciò che vi
   vive ancora operativo si travasa nella documentazione del repo con le regole del
   passo 3 e del prompt di fine sessione: le decisioni e le regole della serie che
   valgono ancora → AGENTS.md (regola + data + dove è fissata) o la guida del dominio;
   una regola di sessione nata nella serie → WORKFLOW.md; lo stato → CLAUDE.md; la
   storia della serie, con le date, i master e che cosa ha corretto ogni ritiro → README
   § Documentazione (come per le serie precedenti); i contratti condivisi → le guide
   delle aree che li usano, per nome. Quel giorno le etichette della serie citate nel
   codice si riscrivono in loco con uno script di sostituzioni esatte che rispetta i
   fine riga per file, e una revisione a campione prima di fidarsi; `git log -- doc/v1`
   resta l'archivio, e ogni rimando alla cartella nel repo si riscrive verso di lui.

5) AGGIORNA indici e stato — lo stato vive in PIÙ punti che possono divergere e si
   chiude con un grep, non con una riga: la riga `> **Stato**: …` in testa alla spec, nella
   forma della regola 4 di `00-INDICE.md § 7` (scritta · in implementazione il <data>, branch ·
   implementata il <data>, branch `feature/NN-…` · in esercizio il <data>, PR #N · ritirata il
   <data>), che sparisce con la spec: l'«in esercizio» resta nel commit di chiusura che lo ha
   scritto (D-41); la colonna Stato della tabella `doc/v1/00-INDICE.md § 5` (la riga diventa «in
   esercizio il <data>, PR #N; ritirata il <data>»); la colonna «Dipende da» della stessa tabella
   e l'intestazione «**Dipende da**: <NN> (in esercizio)» della spec seguente, che diventa «<NN>
   (ritirata il <data>)»; il riepilogo in testa a `00-INDICE.md` («Prossimo
   passo»); `CLAUDE.md § Current Status → Latest` (una riga che SOSTITUISCE la precedente: «spec
   <NN> ritirata il <data>; next: …»); la riga «**Status (<data>)**» di `README.md`, solo quando
   cambia ciò che l'app fa per chi la usa (05: in produzione; 09: v1 completa). Se era l'ultima spec, dillo
   esplicitamente e chiudi la serie come l'ultimo precedente.
   `grep -n "Stato" doc/v1/*.md`, `grep -n "Dipende da" doc/v1/*.md` e
   `git grep -n -E "ritirata|in esercizio|implementata|Status \(" -- CLAUDE.md README.md doc/v1/00-INDICE.md` deve dire la stessa cosa ovunque.

CANCELLI: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, poi `pnpm test:e2e`
(WORKFLOW.md § 3, in quest'ordine: uno rosso ferma la sessione). `pnpm test:e2e` costruisce il suo
server di produzione su :3100 (iscrizioni aperte) e :3101 (chiuse) con `file:e2e.db` e i fake di
Blob e Anthropic (`E2E_FAKE_SERVICES=1`): nessun `pnpm dev` accanto. Il build di verifica è sempre
locale, con `.env.local` (`file:local.db`): mai con `.env.turso-prod`, mai variabili di produzione
esportate nella shell; nessun test e nessun build tocca la produzione, Blob o Anthropic. I cancelli
si lanciano anche quando il ritiro riscrive solo commenti e documenti: un commento riscritto è
codice.
LIMITI: misurati il 2026-10-24, prima della 01 (regola 3 di `00-INDICE.md § 7`): `CLAUDE.md`
7.726 caratteri e 115 righe, obiettivo 20.000 e tetto 40.000 caratteri, misurati come caratteri
Unicode senza CR (`node -e "console.log([...require('fs').readFileSync('CLAUDE.md','utf8').replace(/\r/g,'')].length)"`,
mai `wc -c`); `AGENTS.md` 213 righe (`wc -l AGENTS.md`), obiettivo 600 e tetto 1000;
`doc/guide/<tema>.md` ≤ 500 righe ciascuna, con il tetto di nascita della spec che la crea —
`calcoli.md` 300 (02), `app.md` 300 (03), `deploy.md` 200 (05), `estrazione.md` 400 (06),
`riferimenti.md` 250 (08), `pwa.md` 250 (09); la più vicina al tetto si trova a ogni ritiro con
`wc -l doc/guide/*.md`. Dopo il ritiro della 04 (2026-10-24): `CLAUDE.md` 10.975 caratteri e 148
righe, `AGENTS.md` 319 righe, `app.md` 320 (oltre il tetto di nascita di 300, dalla 04) e
`calcoli.md` 236, `WORKFLOW.md` 240 e `README.md` 90; `Draft Release Temp.md` ≤ 60.000
caratteri (WORKFLOW.md § 3; nasce alla prima fine sessione); `WORKFLOW.md` 245 righe e
`README.md` 63 righe, senza tetto. Se sfori, NON tagliare in chiusura: dimmelo e proponi lo scorporo
come sessione a parte.

⚠️ NON: riassumere una spec dentro un documento che resta · lasciare un rimando a un
file che non esiste più · cancellare date · ritirare senza i segnali (e senza il DDL
speso) · ritirare l'indice finché una spec vive · cominciare la spec successiva prima di
aver ritirato questa · lasciare un dubbio: ogni domanda si fa SUBITO con AskUserQuestion.

Alla fine: riassumi il diff; le occorrenze riscritte per categoria; che cosa hai
travasato e dove; che cosa ha trovato la verifica; l'esito del grep dello stato; qual è
la prossima spec e se i suoi prerequisiti sono in piedi. Se hai corretto codice,
scrivilo anche in CLAUDE.md § Latest: i segnali passati valgono per il codice di PRIMA,
e sul nuovo sono da rifare dopo il deploy. Poi chiedimi l'OK per il commit: un branch
dal branch di integrazione, un solo commit.
---
