# Serie «v1» — indice

> Prima serie di spec di questo repo (cartella nata il 2026-10-24, decisione D-13). Convenzione:
> una spec = una sessione di implementazione = un branch = un commit; le spec sono SOLO
> istruzioni di sviluppo (chi implementa non decide niente); lo stato vive qui (§ 5),
> nell'intestazione di ogni spec e in `CLAUDE.md § Current Status`, e si chiude con un grep
> (§ 7). Non c'è codice al 2026-10-24: le prove sono le bollette campione dell'owner (lette il
> 2026-10-24 fuori dal repo, mai copiate: qui se ne descrive solo la struttura), il codice di
> segnaprezzi (letto in sola lettura, HEAD `561d960`) e la documentazione dei servizi, citata con la
> data di lettura. **Lettura adversariale: fatta il 2026-10-24** con il prompt
> `claude-config/prompts/07_LETTURA_ADVERSARIALE_SPEC.md` (un lettore per spec e uno trasversale):
> 236 rilievi corretti nelle spec e qui, 21 decisioni nuove dell'owner (D-41…D-61). **Prompt di
> ritiro: generato il 2026-10-24** in una sessione a sé (`doc/v1/PROMPT-RITIRO.md`, da
> `08_CREA_RITIRO_SPEC.md`). **La 01 (PR #3), la 02 (PR #5), la 03 (PR #7) e la 04 (PR #9)
> sono in esercizio e ritirate il 2026-10-24; la 05 (PR #11) il 2026-10-25; la 06 (PR #14) il
> 2026-10-26.**

## 1. Il tema, con le parole dell'owner (2026-10-24)

> «Il tracciamento dei consumi e dei prezzi delle utenze di casa. Per ogni fornitura (luce, gas,
> acqua, e le utenze a canone come internet/telefono e TARI) registro le bollette, o a mano o
> allegando il PDF/la foto della bolletta: Claude, via API, estrae tutti i dati che servono
> (periodo, consumo per fascia, letture, prezzo unitario dell'energia/materia prima, quote fisse,
> oneri, imposte, totale, scadenza, conguagli, consumo stimato vs reale) e io li confermo in una
> schermata di revisione prima che finiscano nel database. Registro anche le autoletture del
> contatore fra una bolletta e l'altra. Nella dashboard vedo, per fornitura e per casa,
> l'andamento nel tempo dei consumi (kWh per fascia, Smc, m³), del costo unitario (€/kWh,
> €/Smc, €/m³, sia il solo prezzo della materia prima sia il costo totale per unità) e dei
> costi generali (totale della bolletta, quote fisse, oneri, imposte), con il confronto contro i
> prezzi di riferimento del mercato (PUN per la luce, PSV per il gas, i prezzi ARERA del servizio
> di tutela/vulnerabili), per capire se l'offerta che ho è buona. Un import multiplo carica N
> bollette in coda (l'import delle mie bollette passate lo faremo insieme nella sessione della
> spec che lo implementa, non in pianificazione). È una PWA installabile sul telefono (foto della
> bolletta dalla fotocamera, coda offline per i caricamenti).»

| # | Punto | Spec |
|---|---|---|
| P1 | Account, registrazione chiudibile, dati isolati per utente | 01 |
| P2 | Case e forniture (luce, gas, acqua, a canone), bollette e autoletture a mano | 02, 03 |
| P3 | Dashboard per fornitura e per casa: consumi, costo unitario, costi, anno su anno | 02, 04 |
| P4 | In produzione sul telefono il prima possibile | 05 |
| P5 | PDF o foto della bolletta su Blob, estrazione con Claude, revisione, file riapribile | 06 |
| P6 | Import multiplo in coda, con l'import delle bollette passate dell'owner nel collaudo | 07 |
| P7 | Confronto con PUN, PSV e prezzi ARERA | 08 |
| P8 | PWA installabile, fotocamera, coda offline dei caricamenti e delle autoletture | 06 (fotocamera), 09 |

## 2. Analisi del 2026-10-24 — che cosa si sa (il dettaglio sta in ogni spec § 1)

### 2.1 Le bollette campione (tre PDF veri dell'owner, letti con lo strumento di lettura PDF, nessuna chiamata API)

- **Luce, mensile, mercato libero, offerta monoraria a prezzo fisso** (8 pagine). Prima pagina
  «scontrino dell'energia» nel formato ARERA in vigore dal 2025: «Quota per consumi», «Quota
  fissa», «Quota potenza», ciascuna divisa in «spesa per la vendita» e «spesa per la rete e gli
  oneri generali di sistema», poi «Accise e IVA», «TOTALE BOLLETTA», una voce **fuori dal totale**
  (canone di abbonamento alla televisione) e «TOTALE DA PAGARE». Pagina «Elementi di dettaglio»:
  sezioni *materia energia* (energia €/kWh, corrispettivo di dispacciamento €/kWh, DISPbt e
  commercializzazione €/mese), *trasporto e gestione del contatore* (quota energia, fissa,
  potenza, UC3, UC6), *oneri di sistema* (ARIM, ASOS), *imposte* (imposta erariale), poi IVA
  10% sull'imponibile. **Letture F1/F2/F3 «Rilevata» a due date (fine mese precedente e fine
  mese)** anche se l'offerta è monoraria. Potenza impegnata 3 kW. Un'anomalia vera: la riga
  dell'imposta erariale stampa un prezzo unitario 0,000000 €/kWh accanto a un importo non nullo
  → il prezzo unitario stampato non è affidabile, l'importo sì. Storico consumi di 18 mesi per
  fascia, con «Stimato/Reale» (ignorato, D-20).
- **Gas, mensile, stesso fornitore** (12 pagine). Letture in **mc** con «Rilevata», **coefficiente
  C** (7 cifre decimali) e consumo in **Smc** con 3 decimali, mentre la voce fatturata usa gli Smc
  interi; **potere calorifico superiore** stampato in MJ/Smc; classe contatore; scaglioni di
  consumo (`0-480`, `120-480`) per voce; **IVA a due aliquote** (10% sulle voci a consumo nei
  primi 480 Smc, 22% sulle quote fisse); quote fisse in **€/anno pro rata giorni/365**; voci con
  importo **negativo** (componenti compensative). Soprattutto: **due blocchi «Elementi di
  dettaglio»** — il mese fatturato e il **mese precedente rifatturato con coppie di voci «X» e «X
  (voce di ricalcolo)» di segno opposto** sullo stesso periodo: il conguaglio per competenza
  (D-23) esiste davvero e si legge voce per voce.
- **Linea fissa (internet/telefono), mensile** (4 pagine): canone, periodo di riferimento,
  scadenza, voci **IVA inclusa** con riepilogo imponibile/IVA 22%; nessun consumo.
- **Acqua: nessuna bolletta disponibile** (l'owner la paga nelle spese condominiali). Le spec la
  descrivono secondo la struttura regolata ARERA (quota fissa, quota variabile acquedotto a
  scaglioni, fognatura, depurazione, componenti perequative UI, IVA 10%, letture in m³) con
  fixture sintetiche (D-21).

### 2.2 Anthropic (skill `claude-api`, cache del 2026-10-06; doc lette il 2026-10-24; SDK `@anthropic-ai/sdk@1.3.0` letto nei tipi pubblicati il 2026-10-24)

- `claude-opus-5-5`: 4 $/M input, 20 $/M output, 1 M contesto, 128k output; thinking adattivo
  sempre attivo (`disabled` → 400), `output_config.effort` default `medium`; niente prefill,
  niente `tool_choice` forzato. API versione 2026-10-21 (SDK TS 1.x): **`temperature` → 400**.
- PDF come blocco `document` base64: massimo 32 MB a richiesta, **600 pagine** (contesto 1M);
  ogni pagina = testo (1.500–3.000 token) + immagine; PDF cifrati non supportati
  (https://platform.claude.com/docs/en/build-with-claude/pdf-support).
- Immagini: JPEG/PNG/GIF/WebP, 10 MB base64 per immagine, tier ad alta risoluzione sui modelli
  4.7+: lato lungo **2.576 px**, al massimo **4.784 token** per immagine
  (https://platform.claude.com/docs/en/build-with-claude/vision).
- Output strutturato: `output_config.format` (JSON schema), niente vincoli numerici né di
  lunghezza, **al massimo 24 parametri opzionali e 16 parametri con tipo unione** fra tutti gli
  schemi, incompatibile con le citazioni
  (https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
- Rifiuti: `stop_reason: "refusal"` (HTTP 200) con `stop_details.category`; per Opus 5.5 la doc
  raccomanda `fallbacks: "default"` con la beta `server-side-fallback-2026-07-01`. Nei tipi
  dell'SDK 1.3.0: `client.beta.messages.stream(params, options)` → `BetaMessageStream` con
  `finalMessage(): Promise<ParsedBetaMessage<T>>`, `fallbacks?: BetaFallbacksParam` con
  `BetaFallbacksParam = Array<BetaFallbackParam> | 'default'`, `betaZodOutputFormat` in
  `@anthropic-ai/sdk/helpers/beta/zod`; le richieste **non in streaming** con `max_tokens` oltre
  ~21.333 lanciano «Streaming is required…» (`_calculateNonstreamingTimeout`).

### 2.3 Vercel, Blob, Turso, Better Auth, PWA (doc lette il 2026-10-24; URL nelle spec)

- Vercel Hobby: function 300 s (default e massimo, Fluid), 2 GB, **body 4,5 MB** (413 oltre),
  Server Action 1 MB di default, una sola regione (`dub1` = Dublino), cron una volta al giorno,
  log runtime 1 ora; uso solo personale e non commerciale.
- Vercel Blob: **storage privato GA** (`@vercel/blob` ≥ 2.3): lettura con
  `get(pathname, { access: 'private' })` da una route che controlla l'utente; **accesso e regione
  di uno store non si cambiano dopo la creazione**; la CLI crea lo store in `iad1` se non si dà
  `--region`; upload dal client con `upload()` + `handleUpload()` (richiede
  `BLOB_READ_WRITE_TOKEN`), **`onUploadCompleted` non arriva su localhost**; Hobby: 1 GB, 10.000
  operazioni semplici e 2.000 avanzate al mese, oltre → Blob bloccato 30 giorni.
- Turso: free 100 DB, 5 GB, una sola location (gruppo) sul piano free; `aws-eu-west-1` =
  Irlanda; transazioni interattive con lock di 5 s → `batch()`.
- Better Auth 1.7.12: `disableSignUp`, password 8–128, scrypt, `nextCookies()` ultimo plugin,
  `BETTER_AUTH_SECRET` obbligatorio in produzione; rate limit solo in produzione, **in memoria
  per istanza** (Fluid) → `storage: 'database'`; `getSessionCookie` controlla solo la presenza
  del cookie.
- PWA: `@serwist/next` è un plugin webpack → `next build --webpack` (con Turbopack non emette
  `sw.js` e la build resta verde: segnaprezzi AGENTS § 4.39); Background Sync solo Chromium;
  `capture` funziona su Android e iOS, non su desktop; iOS cancella lo storage dopo 7 giorni
  senza uso se l'app non è installata.

### 2.4 Riferimenti di mercato (fonti lette il 2026-10-24; dettaglio nella spec 08)

- **PUN Index GME** (dal 2025 al posto del PUN): zip annuale «Dati storici» MGP, foglio
  `Prezzi-Prices`, valori orari in €/MWh; media mensile e F1/F2/F3 si calcolano con il
  calendario ARERA delle fasce (verificato: riproduce i PDF mensili GME). **Le condizioni d'uso
  GME** vietano estrazione automatica (§ 6 bis) e ridistribuzione (§ 5–6, licenza personale) →
  D-32.
- **ARERA**, riuso con **CC BY-SA 4.0** citando la fonte: CMEM (media mensile PSV day-ahead,
  €/MWh, €/GJ, €/Smc a 0,038520 GJ/Smc) in una tabella HTML; «Materia energia» dei vulnerabili
  (trimestrale, ex ante, monoraria e F1/F23) in `E<anno>-smt.xlsx`; «Vendita di gas naturale»
  dei vulnerabili (mensile) in `G<anno>_stv.xlsx`. I nomi dei file cambiano ogni anno.
- **Acqua**: nessuna serie nazionale usabile → nessun confronto (D-36).

### 2.5 segnaprezzi (pattern, non codice; letto il 2026-10-24)

Repository `(db, userId, …)` con `userId` in ogni WHERE; test su **file temporaneo** con le
migrazioni vere (`:memory:` di libSQL si svuota dopo una transazione fallita, § 4.17); denaro in
interi; `src/lib/format.ts` unico punto di formattazione; Better Auth con `disableSignUp`
alimentato da `SIGNUP_ENABLED`; schema auth scritto a mano con la colonna `issuer` su `accounts`
(la CLI è rimasta alla 1.4); Serwist con `--webpack` e la pagina offline precachata a mano; coda
Dexie con retry esponenziale e lock; Playwright su build di produzione con login via API e
`Origin`; estrazione con `messages.parse` e Zod, hash SHA-256 contro i doppioni. Lacune viste lì
e chiuse qui: niente costo registrato, upload oltre 4,5 MB attraverso la function, nessuna guardia
automatica contro le query senza `userId`, `Date.now()` dentro due servizi.

## 3. Decisioni dell'owner (D-N, con la data)

### 3.1 Vincoli dati nel tema (2026-10-24)

| # | Decisione | Spec |
|---|---|---|
| D-1 | Hosting **Vercel Hobby**, repo GitHub **pubblico AGPL-3.0**, DB **Turso**, file su **Vercel Blob**. Stessa forma degli altri repo open dell'owner: README e documenti per gli agenti in inglese, SETUP.md per chi fa il proprio deploy, UI in italiano, **nessun dato dell'owner nei file tracciati, nei commit e nelle PR** (WORKFLOW § 1.6 senza eccezioni). | tutte |
| D-2 | La chiave Anthropic sta su un'organizzazione Console **personale** dell'owner, mai sull'account aziendale. | 05, 06 |
| D-3 | Utenze della v1: **luce, gas, acqua**, e le **utenze a canone** (internet/telefono, TARI) come forma di dato distinta: solo costo nel tempo, niente consumo. | 02, 03, 04 |
| D-4 | **Multi-utente con registrazione chiudibile**: Better Auth email + password, ogni query isolata per utente, `SIGNUP_ENABLED=false` chiude le iscrizioni. | 01 |
| D-5 | Più forniture per utente, **raggruppate per casa** (fornitore, POD/PDR/codice utenza, tipo). | 02, 03 |
| D-6 | La bolletta allegata **si conserva** su Vercel Blob e si riapre dalla scheda; nel DB solo i dati necessari ai grafici, **mai l'indirizzo o i codici cliente oltre l'identificativo della fornitura**. | 02, 06 |
| D-7 | **Nulla entra nel DB senza la conferma** dell'owner nella schermata di revisione (anche l'inserimento a mano è una conferma esplicita). | 03, 06, 07 |
| D-8 | Bollette + autoletture; import multiplo; confronto con i riferimenti di mercato **nella v1**. | 03, 07, 08 |
| D-9 | PWA come segnaprezzi: Serwist, manifest, fotocamera, coda offline. | 06, 09 |
| D-10 | **Fuori ambito della v1**: cambio fornitore guidato o confronto fra offerte commerciali · domotica e letture automatiche dai contatori smart · condivisione fra utenti · pagamento delle bollette · modifiche al DB senza conferma. | tutte |
| D-11 | **Priorità**: scaffold + auth + modello dei dati + inserimento manuale + dashboard minima vengono prima di estrazione con Claude, import multiplo e riferimenti di mercato. | ordine § 5 |

### 3.2 Bootstrap (2026-10-24)

| # | Decisione | Spec |
|---|---|---|
| D-12 | Repo **`segnabollette`**, app **«Segnabollette»**. | tutte |
| D-13 | Spec in `doc/v1/` con `00-INDICE.md` (convenzione Hub: NN-slug.md, D-N/T-N/C-N, `PROMPT-RITIRO.md` generato con il prompt 08 dopo la lettura adversariale). DESIGN.md e PRODUCT.md nascono nella spec della UI (03) con la skill impeccable; fino ad allora CLAUDE.md li dichiara in § Not yet present. | tutte, 03 |
| D-14 | I riferimenti di mercato sono **file committati** in `data/` aggiornati da uno script `pnpm riferimenti:update` lanciato dall'owner, **non un cron** (come l'ISTAT di segnaprezzi). Vale per i dati ARERA; il PUN segue D-32. | 08 |
| D-41 | (2026-10-24, lettura adversariale) **Collaudo in produzione dopo il merge**: dalla 05 alla 09 la sessione fa il commit dell'implementazione e la PR **prima** del merge (stato «implementata»); dopo il merge, nella stessa sessione, il collaudo in produzione con l'owner; poi la chiusura della sessione: esito, gotchas e stato «in esercizio» scritti nei loro posti, `SESSION_NOTES.md` eliminato, un commit di chiusura su `docs/<NN>-in-esercizio` da `main` aggiornato e la sua PR (**rivista il 2026-10-25**, decisione dell'owner: prima l'esito restava in `SESSION_NOTES.md` per il commit della sessione successiva). È l'unica eccezione a «un solo commit per sessione» (WORKFLOW.md § 3); il ritiro della spec segue in una sessione a sé. | 05–09 |

### 3.3 Estrazione con Claude (2026-10-24)

| # | Decisione | Spec |
|---|---|---|
| D-15 | Modello dell'estrazione: **Claude Opus 5.5** (`claude-opus-5-5`). | 06, 07 |
| D-16 | Rifiuto del modello: **fallback lato server** `fallbacks: "default"` con la beta `server-side-fallback-2026-07-01`; il costo si registra con il modello che ha risposto davvero (`response.model`). Un rifiuto dell'intera catena rende l'estrazione `failed` con la categoria. | 06 |
| D-17 | **Nessun tetto di spesa** (le iscrizioni si aprono al massimo per un amico): ogni estrazione registra token e costo; Impostazioni mostra la spesa del mese. | 06 |
| D-18 | Import multiplo: **coda con stima del costo prima di partire**, 2 estrazioni in parallelo, ogni bolletta in «Da rivedere», confermata una per una. | 07 |
| D-19 | Una bolletta inserita a mano può avere il **suo file allegato** (PDF o foto), senza estrazione e senza costo. | 06 |
| D-20 | Lo **storico dei consumi stampato** in bolletta si ignora: si estrae solo ciò che la bolletta fattura. | 06 |
| D-21 | **Acqua**: nessuna bolletta vera disponibile (oggi è nelle spese condominiali); struttura ARERA, fixture sintetiche; il collaudo reale dell'acqua arriva con la casa nuova (CLAUDE.md § Not yet present). | 02, 06 |
| D-42 | (2026-10-24) **L'estrazione parte solo al clic** su «Estrai (circa X $)», che mostra la stima: nel caricamento singolo dopo la verifica dei file (l'estrazione resta `queued` finché non si clicca), in «Da rivedere» per le estrazioni in coda, e per le bollette della coda offline, che carica i file e si ferma. L'import multiplo ha già il suo «Avvia estrazione» (D-18). | 06, 09 |
| D-55 | (2026-10-24) **Fotocamera provata solo in produzione**: niente telefono sul server di sviluppo (né https locale né tunnel); in locale le foto si caricano dal browser del computer con «Scegli PDF o foto»; in produzione «Scatta foto» si prova fotografando una bolletta digitale aperta sullo schermo del computer (l'owner non ha bollette di carta). | 06, 09 |
| D-56 | (2026-10-24) **Revisione sul telefono**: sotto i 1024 px niente iframe, il pulsante «Apri il PDF» apre il documento nel visore del telefono; da 1024 px l'iframe accanto al modulo; le foto restano immagini in sequenza. | 06 |
| D-57 | (2026-10-24) Nelle bollette di un **lotto** il pulsante del modulo si chiama «Conferma e passa alla prossima» (niente «Conferma» semplice); `BillForm` non cambia. | 07 |
| D-59 | (2026-10-24) **Ripresa dei caricamenti interrotti**: la risposta «doppione» di `POST /api/extractions` porta lo stato dell'estrazione trovata e, se è ancora senza file con lo stesso lotto e gli stessi file, i documenti da caricare: caricamento singolo, import e coda offline riprendono da lì; un'estrazione senza file diversa si considera abbandonata e si cancella; nella coda offline un 404 di «caricato» dopo un caricamento già arrivato conta come riuscito. | 06, 07, 09 |

### 3.4 Calcoli e grafici (2026-10-24)

| # | Decisione | Spec |
|---|---|---|
| D-22 | Costo unitario: **entrambi** — prezzo della sola materia prima (quota variabile della materia ÷ consumo) e costo totale per unità (tutta la bolletta ÷ consumo). | 02, 04 |
| D-23 | Conguagli e ricalcoli **per competenza**: ogni voce conserva il suo periodo; ricalcoli e conguagli finiscono nei mesi di competenza; i mesi stimati e non ancora ricalcolati sono marcati «stimato». | 02, 04 |
| D-24 | Bolletta che copre giorni già coperti da una bolletta confermata della stessa fornitura: **avviso e scelta** in revisione — «si somma (conguaglio)» oppure «sostituisce la bolletta del …» (la sostituita resta archiviata col suo file, esclusa dai calcoli). | 02, 03, 06 |
| D-25 | Consumi nei grafici = **fatturato per competenza** (anche denominatore del costo unitario); fasce dalle voci della bolletta o, se mancano, dalle **letture F1/F2/F3 della stessa bolletta**; le **autoletture** danno il consumo dei giorni non ancora fatturati. | 02, 04 |
| D-26 | IVA: **prezzo della materia prima senza IVA** (confrontabile coi riferimenti), **costo totale per unità e costi in euro con IVA**. | 02, 04, 08 |
| D-27 | Stima fra due letture e ripartizione dei periodi sui mesi: **uniforme per giorno**. | 02 |
| D-28 | Autolettura **a mano**: data e un valore per registro (F1/F2/F3 o unico; m³ per gas e acqua; immessa e produzione per il fotovoltaico); niente foto. | 03 |
| D-29 | **Fotovoltaico** (casa nuova): letture con registro «immessa», categoria «energia ceduta» fra le voci, **produzione inserita a mano** (lettura del contatore dell'inverter) → autoconsumo e consumo totale della casa. | 02, 03, 04 |
| D-30 | Grafici della v1: **consumi per mese, costo unitario nel tempo, costi per categoria, confronto anno su anno**, con **Recharts**. | 04 |
| D-31 | Unità **come in bolletta**: luce F1/F2/F3 se ci sono, altrimenti F1/F23, altrimenti totale; gas in Smc (letture in m³ convertite col coefficiente C della bolletta); acqua in m³. | 02, 04 |
| D-43 | (2026-10-24) Il **totale del mese** di una fornitura comprende l'energia ceduta (credito, negativo): costo totale per unità, spesa della casa, riquadri «ultimi 12 mesi» e somma delle categorie sono al netto del credito (D-22 alla lettera: «tutta la bolletta ÷ consumo»). | 02, 04 |
| D-46 | (2026-10-24) Modificando una bolletta che ne aveva **sostituite** altre, quelle che il nuovo periodo non tocca più tornano «confermate» nello stesso salvataggio; quelle ancora sovrapposte restano sostituite. Una bolletta sostituita non si modifica (resta archiviata, D-24). | 02, 03 |
| D-47 | (2026-10-24) Un'**autolettura con data futura** si rifiuta («La lettura non può essere nel futuro.»); le date delle bollette restano libere. | 02, 03, 09 |
| D-48 | (2026-10-24) **Mese stimato**: lo marca una voce della materia prima stimata con quantità > 0, anche se di ricalcolo (un acconto che rifà un acconto); lo toglie solo una voce di ricalcolo non stimata (o lo storno) di una bolletta successiva. | 02, 04 |
| D-52 | (2026-10-24) Pagina **Casa**: una sola card per fornitura, con i dati della 03 (ultima bolletta, pulsanti) e quelli della dashboard (consumo e costo unitario dell'ultimo mese fatturato). | 03, 04 |
| D-53 | (2026-10-24) Riquadri della **Casa**: la finestra dei 12 mesi finisce al più vecchio fra gli «ultimi mesi fatturati» delle forniture non archiviate che hanno bollette (ogni fornitura è fatturata in tutti i 12 mesi). | 04 |
| D-54 | (2026-10-24) **Spesa media mensile** della Casa = spesa degli ultimi 12 mesi ÷ mesi di quella finestra in cui almeno una fornitura ha giorni fatturati («—» se nessuno). | 04 |
| D-62 | (2026-10-24, in implementazione) **Canone TV del seed** nelle bollette della luce **da gennaio a ottobre** (le dieci rate reali), non nella sola bolletta di gennaio. | 02 |
| D-63 | (2026-10-24, in implementazione) **Locale italiano di zod** (`z.config(z.locales.it())` in `bill-input.ts`): anche i messaggi di default dei `VALIDATION` sono in italiano. | 02 |
| D-64 | (2026-10-24, in implementazione) **Testi dei `VALIDATION`** non scritti nella spec: «Il nome della casa deve avere da 1 a 60 caratteri.», «Il nome della fornitura deve avere da 1 a 60 caratteri.», «Il fotovoltaico vale solo per la luce.», «Una fornitura a canone non ha letture.», «Una fornitura a canone non ha consumi: togli kWh, Smc e m³ dalle voci.», «Serve almeno una voce della materia prima in kWh.» (Smc, m³), «Le voci della materia prima vanno in kWh.» (Smc, m³), «Una lettura usa un registro che questa fornitura non ha.», «Coefficiente C e potere calorifico valgono solo per il gas.». | 02 |
| D-65 | (2026-10-24, in implementazione) La **variazione dei riquadri** si formatta con `formatPercentChange(change)` in `src/lib/format.ts` (segno, una cifra decimale, «−» tipografico), come vuole AGENTS.md § 2.5; il riquadro scrive «+10,0 % sui 12 mesi precedenti» (o «— sui 12 mesi precedenti»). | 04 |
| D-66 | (2026-10-24, in implementazione) **Etichette dei consumi**: la serie senza fasce è «Fascia unica» per la luce e «Consumo» per gas e acqua; il fotovoltaico «Autoconsumo» e «Immessa in rete». | 04 |
| D-67 | (2026-10-24, in implementazione) Il **mese più vecchio** dei dati di una fornitura non va oltre il mese corrente: una bolletta con date future non svuota «Tutto». | 04 |

### 3.5 Riferimenti di mercato (2026-10-24)

| # | Decisione | Spec |
|---|---|---|
| D-32 | **PUN**: l'owner scarica **a mano** lo zip annuale «Dati storici» MGP dal sito GME; `pnpm riferimenti:pun -- <file.zip>` calcola media mensile e F1/F2/F3/F23 e li scrive **nel database del deploy, mai nel repo** (condizioni GME § 5–6 e § 6 bis; uso privato, «Fonte: GME» accanto al grafico). Rivede D-14 per il PUN. | 08 |
| D-33 | Riferimento ARERA per la luce: **vulnerabili, «Materia energia»** (PE+PD+PPE, trimestrale, monoraria o F1/F23). | 08 |
| D-34 | Riferimenti per il gas: **CMEM** (media mensile PSV day-ahead, ARERA) **+ «Vendita di gas naturale» dei vulnerabili** (CMEM + CCR + QVD variabile). | 08 |
| D-35 | Allineamento **mese per mese, come l'offerta**: i trimestrali valgono per i tre mesi; luce monoraria contro la media/fascia unica, multioraria contro le fasce pesate sui consumi dell'owner; gas €/GJ × il PCS della bolletta (0,03852 GJ/Smc se manca). | 08 |
| D-36 | **Acqua senza confronto**, dichiarato in pagina (nessuna serie nazionale). | 04, 08 |
| D-44 | (2026-10-24) **D-35 alla lettera**: un mese della luce senza voci della materia prima con una fascia (offerta monoraria) si confronta con il PUN media mensile e con ARERA «fascia unica», anche se le letture della bolletta danno le quote F1/F2/F3; il motore dice per ogni mese se le voci della materia prima hanno fasce (`SupplyMonth.hasCommodityBands`). | 02, 08 |
| D-58 | (2026-10-24) Il **PUN importato è visibile a tutti gli utenti** del deploy (al massimo un amico); SETUP.md avverte chi apre le iscrizioni a terzi di valutare le condizioni d'uso del GME. | 08 |

### 3.6 App (2026-10-24)

| # | Decisione | Spec |
|---|---|---|
| D-37 | `SIGNUP_ENABLED` **chiuso di default** (`false` quando manca). | 01, 05 |
| D-38 | Interfaccia **solo in italiano**: niente next-intl, nessun prefisso di lingua; README e documenti per gli agenti in inglese; spec e chat in italiano; codice e commenti in inglese. | tutte |
| D-39 | Tema che **segue il sistema**, con commutatore in Impostazioni (colori e tipografia li decide la 03 con impeccable). | 03 |
| D-40 | **«Elimina account»** in Impostazioni: righe a cascata e tutti i file dell'utente su Blob. | 01, 03, 06 |
| D-45 | (2026-10-24) **Registrazione**: ogni errore del server mostra «Registrazione non riuscita. Riprova.» (anche l'email già usata: non si rivela quali email sono registrate); i limiti della password li fa rispettare il campo. | 01 |
| D-49 | (2026-10-24) Con il **fotovoltaico** il modello di partenza della bolletta della luce ha anche la voce «Energia ceduta». | 03 |
| D-50 | (2026-10-24) **Autolettura più bassa** dell'ultima lettura dello stesso registro: avviso non bloccante («è un contatore nuovo?») e conferma prima del salvataggio. | 03 |
| D-51 | (2026-10-24) **Bolletta nuova a mano**: importi delle voci e totale partono vuoti e sono obbligatori. | 03 |
| D-60 | (2026-10-24) **Coda offline solo dalla pagina già aperta**: la pagina «Sei offline» lo dice; l'apertura dell'app a freddo senza rete con i moduli resta fuori dalla v1 (CLAUDE.md § Not yet present). | 09 |
| D-61 | (2026-10-24) Coda offline: un **errore di rete non consuma i tentativi** (la voce ritenta fra 16 s e agli inneschi); solo le risposte 408, 429 e ≥ 500 consumano i 5 ritentativi. | 09 |

## 4. Scelte adottate dal pianificatore («adottata, ribaltabile» — rovesciabili prima dell'implementazione)

| # | Scelta | Perché | Spec |
|---|---|---|---|
| T-1 | Versioni pinnate (npm, 2026-10-24): next 16.4.3, react/react-dom 19.3.1, typescript 7.0.2, better-auth 1.7.12, drizzle-orm 0.45.4, drizzle-kit 0.31.11, @libsql/client 0.18.0, zod 4.6.7, nanoid 6.0.2, @biomejs/biome 2.6.2, vitest 5.0.5, @playwright/test 1.64.1, @axe-core/playwright 4.14.0, tsx 4.23.15, dotenv 18.0.9, tailwindcss + @tailwindcss/postcss 4.3.3, @types/node 22 (non la 26: `engines.node >= 22`), server-only 0.0.1, recharts 3.10.1 + react-is 19.3.1 (04), @vercel/blob 2.8.2, @anthropic-ai/sdk 1.3.0, unpdf 1.9.1 (06), happy-dom 21.0.4 (07), fflate 0.8.3 + SheetJS `xlsx` 0.20.3 dal tarball ufficiale `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (08, solo script), @serwist/next + serwist 9.5.13, dexie 4.4.7, dexie-react-hooks 4.4.0, fake-indexeddb 6.2.6, sharp 0.35.5, png-to-ico 3.0.2 (09). `packageManager: pnpm@11.22.0` (come gli altri repo; la 12 è uscita il 2026-10-21), `engines.node >= 22`. | Le stesse famiglie di hevy-coach e segnaprezzi, alla patch corrente. | 01+ |
| T-2 | Regione Vercel **`dub1`**, Turso **`aws-eu-west-1`**, Blob **privato in `dub1`**; **due store**: `segnabollette-files` (Production) e `segnabollette-files-dev` (Development). | Turso non ha Francoforte; accesso e regione dello store non si cambiano dopo; senza uno store di sviluppo le prove locali finirebbero nello store di produzione (non c'è emulatore). | 05, 06 |
| T-3 | `@libsql/client` con l'entry **Node**; client singleton su `globalThis`; test su **file temporaneo** con le migrazioni vere (`createTestDb()`), mai `:memory:`. | segnaprezzi § 4.17. | 01 |
| T-4 | Next 16 **senza** `cacheComponents`, React Compiler spento, dev con Turbopack, **`next build --webpack`** dalla 01 (Serwist dalla 09). `src/proxy.ts` (Next 16) per il redirect ottimistico. | Serwist è un plugin webpack; un comando di build per tutta la serie. | 01, 09 |
| T-5 | Layout: `src/app` (route sottili), `src/components`, `src/lib/{auth,db,domain,engine,services,charts,http,blob,upload,extraction,import,references,offline,pwa}`, `scripts/` (tsx), `data/riferimenti/`, `tests/{e2e,fixtures}`; unit test accanto ai moduli (`*.test.ts`). | Come segnaprezzi. | 01+ |
| T-6 | Script di package.json: `dev`, `build`, `start`, `lint`, `lint:fix`, `typecheck`, `test`, `test:watch`, `test:e2e`, `db:generate`, `db:migrate`, `db:studio`, `db:seed` (01); `db:migrate:prod` (05); `fixture:bills`, `documents:prune` (06); `riferimenti:update`, `riferimenti:pun` (08); `icons` (09). | Un solo set di comandi per la serie. | 01+ |
| T-7 | Denaro **in centesimi interi** con segno (`*_cents`); prezzi unitari in **micro-euro interi** (`*_micros`, 0,099000 €/kWh = 99000); quantità fisiche `real`; **date di calendario come testo `YYYY-MM-DD`** (periodi, letture, scadenze); istanti in epoch ms UTC (`created_at`). | Le bollette stampano prezzi a 6 decimali; i periodi sono giorni, non istanti, e l'aritmetica dei giorni in UTC non soffre l'ora legale. | 02 |
| T-8 | Id `nanoid(21)` generati dall'app, anche per le tabelle di Better Auth. | Come segnaprezzi. | 01 |
| T-9 | Tassonomia delle voci: **categoria** `commodity` (il solo prezzo dell'energia/gas/acqua per unità) · `sale` (resto della vendita: commercializzazione, dispacciamento, PCS, perdite) · `network` (trasporto, distribuzione, misura; acqua: fognatura e depurazione) · `system` (oneri generali; acqua: componenti perequative UI) · `excise` (accise, imposta erariale, addizionali) · `vat` · `other` (bonus, interessi, arrotondamenti, sconti) · `feed_in` (energia ceduta, credito) · `outside` (fuori dal totale bolletta: canone TV, saldi precedenti); **componente** `variable` · `fixed` · `power` · `lump`. Il prezzo della materia prima = Σ `commodity` ÷ consumo. | Una tabella per tutte le utenze (tema); «materia prima» confrontabile col PUN/PSV senza il dispacciamento. | 02, 06 |
| T-10 | Si salvano **tutte le voci** della bolletta (non solo i totali per categoria). | Servono per la competenza dei ricalcoli e per rifare i calcoli. | 02 |
| T-11 | Il **numero di fattura non si salva**; i doppioni si riconoscono dallo **SHA-256** dei file. | D-6: nessun codice oltre l'identificativo della fornitura. | 02, 06 |
| T-12 | Il nome del fornitore e dell'offerta stanno **sulla bolletta** (la fornitura tiene il fornitore attuale): un cambio di fornitore sullo stesso POD/PDR non crea una fornitura nuova. | Il POD/PDR è l'identità della fornitura. | 02 |
| T-13 | Controlli aritmetici in revisione come **avvisi** (la conferma resta possibile): Σ voci (esclusa `outside`) contro il totale bolletta e Σ di tutte le voci contro il totale da pagare, tolleranza **max(2, ⌈n/4⌉) centesimi** con n voci; quantità × prezzo contro importo per voce, tolleranza max(1 cent, 1%). | Ogni voce è arrotondata al centesimo; il prezzo unitario stampato non è affidabile (§ 2.1). | 02, 03, 06 |
| T-14 | Rotte in italiano: `/accedi`, `/registrati`, `/` (Casa), `/forniture`, `/forniture/[id]`, `/bollette`, `/bollette/nuova`, `/bollette/[id]`, `/bollette/[id]/modifica`, `/bollette/carica`, `/bollette/da-rivedere`, `/bollette/revisione/[id]`, `/bollette/importa`, `/letture`, `/impostazioni`, `/offline`. | UI solo italiana (D-38). | 01, 03, 06, 07, 09 |
| T-15 | Sessione Better Auth **180 giorni** con `updateAge` 1 giorno e `cookieCache` 5 min; rate limit con `storage: 'database'`, attivo solo in produzione e mai con `E2E_FAKE_SERVICES=1`. | Una PWA usata una volta al mese non deve chiedere il login; il limite in memoria vale per istanza. | 01 |
| T-16 | Playwright **dalla 01**: progetti `mobile` (390×844) e `desktop`, build di produzione su :3100, `file:e2e.db`, due utenti seed, login via API con `Origin`; axe sui progetti dalla 03. | L'isolamento per utente è la prima garanzia da provare. | 01, 03 |
| T-17 | Container `src/lib/container.ts`: `getDb()` (01), `getBlobStore()` e `getBillExtractor()` (06); con `E2E_FAKE_SERVICES=1` restituisce fake (Blob su disco in `.e2e-blob/`, estrattore da fixture); l'env rifiuta `E2E_FAKE_SERVICES=1` con `VERCEL_ENV=production`. | Playwright non deve toccare Blob né Anthropic; un fake in memoria non sopravvive fra i bundle delle route. | 01, 06 |
| T-18 | Chiamata a Claude: `client.beta.messages.stream({ model: 'claude-opus-5-5', max_tokens: 32000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system, messages, output_config: { effort: 'high', format } }, { timeout, maxRetries: 0, signal: AbortSignal.timeout(timeout) })` → `finalMessage()`, dove `format` è `betaZodOutputFormat(ExtractionSchema)` **senza** la sua funzione `parse` (così l'SDK non analizza la risposta prima che si guardi `stop_reason`: rifiuto e troncamento restano riconoscibili e i token si registrano; la validazione la fa l'estrattore con `ExtractionSchema.safeParse`); il `signal` limita tutto lo stream (il `timeout` dell'SDK copre solo l'attesa delle intestazioni); una scadenza unica di **280 s** per estrazione; **nessun retry automatico** (pulsante «Riprova»). | Streaming obbligatorio sopra 21.333 token; 300 s di Vercel; costo prevedibile. | 06 |
| T-19 | Lo schema dell'estrazione **non usa campi nullable** (sentinelle: `""`, `0`, `"none"`), tradotte in `null` da `toBillInput`. | Il limite di 16 parametri con tipo unione dell'output strutturato. | 06 |
| T-20 | Foto: convertite in **JPEG con lato lungo ≤ 2.576 px** (qualità 0,85) nel browser, **massimo 10 per bolletta**, in ordine di pagina, ciascuna ≤ 5 MB e ≤ 20 MB in tutto per estrazione; PDF **≤ 10 MB e ≤ 40 pagine**, mai modificati, rifiutati se cifrati. | Il tier alto delle immagini; i PDF dei fornitori pesano 1–3 MB. | 06 |
| T-21 | Upload **dal client** verso lo store **privato** (`upload()` + `handleUpload()`), pathname `users/{userId}/documents/{documentId}.{pdf\|jpg}`; nessuna scrittura nel DB dipende da `onUploadCompleted`: l'esistenza del file si verifica lato server prima di usarlo. | Body 4,5 MB; la callback non arriva in locale. | 06 |
| T-22 | Creazione dell'estrazione, «caricato» ed «esegui» sono **route handler** (`POST /api/extractions`, `POST /api/extractions/[id]/uploaded`, `POST /api/extractions/[id]/run`), usati sia dalle pagine sia dalla coda offline. | La coda della 09 chiama HTTP, non Server Action. | 06, 07, 09 |
| T-23 | Stima del costo: input = 3.000 token per pagina PDF + 4.800 per foto + 4.000 di istruzioni; output = 10.000 token; prezzi di `src/lib/extraction/pricing.ts`. | Una cifra prima di partire, prudente. | 06, 07 |
| T-24 | Tema in un cookie `theme` (`system` · `light` · `dark`) letto dal layout server, niente flash. | Nessuna dipendenza in più. | 03 |
| T-25 | Dati ARERA in `data/riferimenti/*.json` con licenza **CC BY-SA 4.0** dichiarata in `data/riferimenti/README.md`; il PUN nella tabella `reference_prices` (globale, non per utente). | D-32, condizioni ARERA. | 08 |
| T-26 | Calendario delle fasce: festività fisse nazionali + Pasquetta, **senza il 4 ottobre** finché non è verificato contro un PDF GME del 2027 (CLAUDE.md § Not yet present). | Il 4 ottobre 2026 cade di domenica; la regola ARERA non è nota. | 08 |
| T-27 | La coda offline si svuota **dalle pagine** (avvio, `online`, `visibilitychange`, dopo un accodamento); l'evento `sync` del service worker (solo Chromium) manda un messaggio alle pagine aperte. | Un solo motore, nessun upload dal service worker. | 09 |
| T-28 | Fotovoltaico come **registri cumulativi** delle letture: `feed_in` (contatore di scambio, immessa) e `production` (contatore/inverter); per mese si usano le differenze ripartite per giorno. | Stessa forma delle autoletture (D-28). | 02, 03 |
| T-29 | Grafici: finestra di default **24 mesi** (scelte 12 · 24 · tutto). | Due inverni leggibili. | 04 |
| T-30 | Gas dalle letture: m³ × il **coefficiente C dell'ultima bolletta confermata che lo riporta** (per `periodEnd`; 1 con l'avviso «coefficiente C non noto» solo se nessuna bolletta confermata lo riporta). | Le autoletture non hanno un C proprio. | 02 |
| T-31 | Il confronto con i riferimenti sta **solo sulla linea della materia prima** (senza IVA), con una didascalia fissa su che cosa include ciascun riferimento. | Il totale con IVA non ha un riferimento omogeneo. | 08 |
| T-32 | Modelli di voci per le utenze a canone: internet/telefono = «Canone» (`sale`, `fixed`) + «IVA» (`vat`); TARI = «TARI» (`sale`, `fixed`) senza IVA. | Il grafico dei costi le mostra come totale. | 03 |
| T-34 | **Foreign key senza `ON DELETE CASCADE`** sulle tabelle dell'app; i servizi cancellano esplicitamente le righe figlie (in un `db.batch`); i DB locali (sviluppo, test, E2E) accendono `PRAGMA foreign_keys = ON`, così una cancellazione dimenticata fallisce in locale. Le tabelle di Better Auth tengono la loro cascade verso `users`. | Le foreign key di libSQL sono spente di default e per connessione; su Turso remoto via HTTP una `PRAGMA` non sopravvive fra le richieste (https://docs.turso.tech/sql-reference/pragmas, 2026-10-24). | 01, 02, 06 |
| T-33 | Identificativo della fornitura normalizzato (maiuscolo, senza spazi, trattini né punti) e unico per utente; l'estrazione assegna la fornitura per identificativo. | Il POD/PDR stampato ha spaziature diverse fra fornitori. | 02, 06 |

## 5. Ordine, dipendenze e stato

| Spec | Titolo | Branch | Dipende da | Stato |
|---|---|---|---|---|
| 01 | Scaffold, database e accesso | `feature/01-scaffold-auth` | — | in esercizio il 2026-10-24, PR #3; ritirata il 2026-10-24 |
| 02 | Modello dei dati e motore dei calcoli | `feature/02-data-engine` | 01 (ritirata il 2026-10-24) | in esercizio il 2026-10-24, PR #5; ritirata il 2026-10-24 |
| 03 | Design, forniture, inserimento manuale e autoletture | `feature/03-design-manual-entry` | 02 (ritirata il 2026-10-24) | in esercizio il 2026-10-24, PR #7; ritirata il 2026-10-24 |
| 04 | Dashboard e grafici | `feature/04-dashboard` | 03 (ritirata il 2026-10-24) | in esercizio il 2026-10-24, PR #9; ritirata il 2026-10-24 |
| 05 | Messa in esercizio: Vercel, Turso, Blob | `feature/05-deploy` | 04 (ritirata il 2026-10-24) | in esercizio il 2026-10-25, PR #11; ritirata il 2026-10-25 |
| 06 | Caricamento su Blob ed estrazione con Claude | `feature/06-extraction` | 05 (ritirata il 2026-10-25) | in esercizio il 2026-10-26, PR #14; ritirata il 2026-10-26 |
| 07 | Import multiplo | `feature/07-bulk-import` | 06 (ritirata il 2026-10-26) | scritta 2026-10-24; riletta 2026-10-24; implementata il 2026-10-26, branch `feature/07-bulk-import` |
| 08 | Riferimenti di mercato | `feature/08-market-references` | 07 | scritta 2026-10-24; riletta 2026-10-24 |
| 09 | PWA, fotocamera e coda offline | `feature/09-pwa-offline` | 08 | scritta 2026-10-24; riletta 2026-10-24 |

Vincolo di priorità (D-11): dopo la 03 l'owner inserisce le bollette a mano in locale; dopo la 04 le
vede nei grafici; dopo la 05 lo fa dal telefono in produzione; la 06 porta l'estrazione, la 07 le
bollette passate, la 08 il confronto col mercato, la 09 l'app installata e offline. La 08 dipende
dalla 07 solo per l'ordine (un branch alla volta), non per codice: la 08 tocca il grafico del costo
unitario (04) e lo schema (02). Una spec parte solo quando la precedente è **in esercizio** (§ 7).
La 01, la 02, la 03 e la 04 sono ritirate (2026-10-24), la 05 il 2026-10-25, la 06 il 2026-10-26:
prossimo passo, il prompt in fondo alla 07.

## 6. Contratti condivisi fra spec (da usare IDENTICI: nome, firma, file)

| # | Contratto | File | Nasce in | Usato da |
|---|---|---|---|---|
| C-1 | `EnvSchema` (zod) e `env` (server-only): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN?`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIGNUP_ENABLED` (→ boolean, default `false`), `E2E_FAKE_SERVICES` (→ boolean), `VERCEL_ENV?`; la 06 aggiunge `ANTHROPIC_API_KEY?`, `BLOB_READ_WRITE_TOKEN?`, `E2E_BLOB_DIR` (default `.e2e-blob`) e lato client `NEXT_PUBLIC_E2E_FAKE_SERVICES` (letta solo come `process.env.NEXT_PUBLIC_E2E_FAKE_SERVICES` letterale nel codice client); la 07 `E2E_EXTRACTOR_DELAY_MS` (default 0). Le variabili `E2E_*` le imposta solo `playwright.config.ts` (e la riga di comando di un collaudo locale con i fake, mai `.env.local`) | `src/lib/env-schema.ts` (schema), `src/lib/env.ts` (istanza) | 01 | tutte |
| C-2 | `createDb({ url, authToken? })`, `Db`, `prepareLocalDatabase(client, url)` (`src/lib/db/create-db.ts`, senza `server-only`, usati da script e test); `db` singleton server-only (`src/lib/db/client.ts`); schema in `src/lib/db/schema/auth.ts` (`users`, `sessions`, `accounts`, `verifications`, `rateLimits`) e `src/lib/db/schema/app.ts` (`houses`, `supplies`, `bills`, `billLines`, `meterReadings` dalla 02; `documents`, `extractions` dalla 06; `referencePrices` dalla 08), barile `src/lib/db/schema/index.ts` | `src/lib/db/client.ts`, `src/lib/db/schema/*` | 01 (auth), 02, 06, 08 | tutte |
| C-3 | `createAuth({ db, secret, baseURL, signupEnabled, rateLimitEnabled, afterUserDeleted? })` (`src/lib/auth/create-auth.ts`) e l'istanza server-only `auth` (`src/lib/auth/auth.ts`); `deleteAllUserData(db, userId)` (`src/lib/services/user-data.ts`: ogni tabella dell'app con `user_id` vi entra nella spec che la crea); `getSessionUser(): Promise<SessionUser \| null>`, `requireUser(): Promise<SessionUser>` con `SessionUser = { id; email; name }` (`src/lib/auth/session.ts`); `authClient` (`src/lib/auth/auth-client.ts`); `PUBLIC_PATHS`, `isPublicPath(pathname)` e `safeNextPath(raw)` (`src/lib/auth/public-paths.ts`) | `src/lib/auth/*` | 01 | tutte |
| C-4 | `createTestDb(): Promise<{ db: Db; client: Client }>` e `createTestUser(db, overrides?): Promise<{ id: string }>` | `src/lib/db/testing/create-test-db.ts` | 01 | 02+ |
| C-5 | `DomainError(code, message?, details?)`, `DomainErrorCode` (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION`, `OVERLAP_DECISION_REQUIRED`, `DUPLICATE_IDENTIFIER`; la 06 aggiunge `DUPLICATE_DOCUMENT`, `DOCUMENT_INVALID`, `EXTRACTION_UNAVAILABLE`, `EXTRACTION_BUSY`), `ERROR_MESSAGES: Record<DomainErrorCode, string>` (italiano), `ActionResult<T>` (il ramo d'errore porta `code`, `message`, `details?`; `details` di un `VALIDATION` è sempre `string[]`), `toActionResult(fn)` | `src/lib/errors.ts` | 01 | tutte |
| C-6 | Tipi di dominio: `SupplyKind`, `METERED_KINDS`, `MeteredKind`, `isMetered(kind)`, `ConsumptionUnit` (`'kWh' \| 'Smc' \| 'm3'`, l'unità di `formatUnitPriceValue` e dei grafici), `consumptionUnitOf(kind)`, `ReadingUnit`, `readingUnitOf(kind)`, `allowedRegisters(kind, hasPhotovoltaic)`, `CostCategory`, `COST_CATEGORIES`, `BillSource`, `LineCategory`, `LineComponent`, `QuantityUnit`, `Band`, `ReadingRegister`, `ReadingSource`, `BillStatus`, `IsoDate`, `MonthKey`, `normalizeSupplyIdentifier(raw)` | `src/lib/domain/types.ts` | 02 | 03+ |
| C-7 | Date: `parseIsoDate`, `isIsoDate`, `addDays`, `daysBetween`, `daysInclusive`, `monthKeyOf`, `monthRange`, `monthStart`, `monthEnd`, `daysInMonth`, `shiftMonth`, `eachMonthOverlap(start, end)`, `romeToday(nowMs)` | `src/lib/domain/dates.ts` | 02 | 03+ |
| C-8 | Denaro e formati: `allocateCentsByWeights(amountCents, weights)`, `unitPriceMicros(cents, quantity)`, `centsFromEuro(euro)`, `microsFromEuro(euro)` (`src/lib/domain/money.ts`); `formatEuro`, `formatUnitPrice`, `formatQuantity`, `formatDate`, `formatMonth`, `parseDecimalInput` (`src/lib/format.ts`; la 03 aggiunge `CATEGORY_LABELS`, `COMPONENT_LABELS`, `KIND_LABELS`, `REGISTER_LABELS`, `IDENTIFIER_HINTS`, `UNIT_LABELS`, `formatDecimalInput(value, maxFractionDigits, scale = 1)` (la `scale` dal ritiro della 04, 2026-10-24: divide lei, così il modulo della bolletta non divide), `formatLinePrice(micros, unit)`, `formatSupplyLabel(label, houseName, houseCount)` («Luce · Casa …» con più case); la 04 `formatEuroValue(euro)`, `formatUnitPriceValue(euroPerUnit, unit)` e — decisione dell'owner in implementazione, 2026-10-24 — `formatPercentChange(change)` («+10,0 %», «−4,5 %»); la 06 `formatUsd(microUsd)`) | vedi colonna | 02 | 03+ |
| C-9 | `BillInputSchema` (zod) → `BillInput` con `BillLineInput`, `BillReadingInput`; `SelfReadingInputSchema` → `SelfReadingInput` | `src/lib/domain/bill-input.ts` | 02 | 03, 06, 07 |
| C-10 | Controlli puri: `checkBillArithmetic(input): ArithmeticReport`, `arithmeticTolerance(lineCount)`, `findOverlappingBills(bill, existing): ExistingBillPeriod[]` | `src/lib/domain/bill-checks.ts` | 02 | 03, 06 |
| C-11 | Motore: `buildSupplyMonths(input: SupplyMonthsInput): SupplyMonth[]`, `buildHouseMonths(supplies): HouseMonth[]`, `yearOverYear(months, month)`, `rolling12(months, endMonth)`, `bandSharesOfBill(bill)`, `pickReadings(readings)`, `dailyFromReadings(readings, register)`; `SupplyMonth` con `totalCents` al netto dell'energia ceduta (D-43) e `hasCommodityBands` (D-44) | `src/lib/engine/*.ts` (un file per funzione principale; guida `doc/guide/calcoli.md`) | 02 | 03, 04, 08 |
| C-12 | Repository `(db, userId, …)`: `houses.ts`, `supplies.ts`, `bills.ts`, `readings.ts` (02; `readings.ts` ha anche `listBillReadings(db, userId, billId)`, per giorno e registro, che usa `getBillDetail`), `documents.ts`, `extractions.ts` (06); `reference-prices.ts` (08, globale: senza `userId`, l'unica eccezione) | `src/lib/db/repositories/*` | 02, 06, 08 | servizi |
| C-13 | Servizi: `createHouse`, `renameHouse`, `deleteHouse`, `createSupply`, `updateSupply`, `archiveSupply`, `deleteSupply` (`houses-supplies.ts`; la 03 aggiunge `listHousesWithSupplies`, `getSupplyDetail`, `getDeletionSummary`); `confirmBill(db, userId, input, options)`, `deleteBill`, `getBillDetail`, `listBills` (`bills.ts`; `listBills` e `listReadings` restituiscono `supplyLabel` da `formatSupplyLabel`; la 03 aggiunge `listLatestBills` e la pura `billInputFromDetail(detail)`); `createSelfReadings(db, userId, rawInput, { today })`, `deleteReading`, `listReadings` (`readings.ts`; la 03 aggiunge `suggestedRegisters(db, userId, supplyId)` e `latestReadings(db, userId, supplyId)`; la 09 rende `createSelfReadings` idempotente senza cambiarne la firma); `assertInputFitsSupply(supply, input)` (pura, in `bills.ts`); `getSupplyDashboard`, `getHouseDashboard`, `DashboardRange`, `SupplyDashboard`, `HouseDashboard` (`dashboard.ts`, 04; la 08 aggiunge a `SupplyDashboard` `references: ReferenceLine[]` e `latestCalorificValueGj: number \| null`). `deleteBill`, `deleteSupply`, `deleteHouse` restituiscono `{ documentPathnames }` (vuoto fino alla 06, che lo riempie) | `src/lib/services/*` | 02 (03 e 04 aggiungono, 08 e 09 estendono) | 03+ |
| C-14 | `BillForm` (componente client) con `supply`, `initialValue: BillInput`, `overlaps?: ExistingBillPeriod[]`, `submitLabel`, `blankAmounts?: boolean` (bolletta nuova a mano, D-51), `onSubmit(input): Promise<ActionResult<{ billId; nextPath? }>>` (dopo il salvataggio il modulo va a `nextPath`, altrimenti a `/bollette/<billId>`); `LineTemplate`, `lineTemplateFor(kind, hasPhotovoltaic)` ed `emptyBillInput(supply: { id; kind; supplierName; hasPhotovoltaic }, today)` (in `line-templates.ts`, modulo puro); `BillDraft`, `FieldErrors`, `draftFromInput(input, options?: { blankAmounts?: boolean })`, `inputFromDraft(draft)` (guida `doc/guide/app.md` § 5) | `src/components/bills/bill-form.tsx`, `line-templates.ts`, `bill-draft.ts` | 03 | 06, 07 |
| C-15 | Grafici: `src/components/charts/recharts.ts` (unico import di Recharts), `ConsumptionChart`, `UnitPriceChart` (prop `references?: ReferenceLine[]` e `note?`; disegna già le linee `reference-<key>` tratteggiate, le loro colonne e le fonti), `CostsChart`, `YearOverYearChart`, `KpiTile`; il tipo `ReferenceLine` e le serie in `src/lib/charts/series.ts` (la 08 aggiunge `withReferences`); guida `doc/guide/app.md` § 9 | `src/components/charts/*`, `src/lib/charts/series.ts` | 04 | 08 |
| C-16 | Blob: `BlobStore` (`readDocument(pathname)`, `deleteDocuments(pathnames)`, `deleteUserDocuments(userId)`, `listPathnames(prefix)`), `MAX_DOCUMENT_BYTES`, `MAX_PHOTO_BYTES`, `MAX_EXTRACTION_BYTES`, `maxBytesFor(contentType)`, `documentPathname(userId, documentId, contentType)`, `createVercelBlobStore(token)`, `createDiskBlobStore(dir)` (restituisce `DiskBlobStore`: il `BlobStore` più `writeDocument(pathname, bytes)`, per la route finta e i test), `uploadDocumentFile({ file, pathname, documentId, contentType })` (client); `compressPhoto(file)` (`src/lib/upload/compress-photo.ts`); `ERROR_STATUS` e `toErrorResponse(error)` (`src/lib/http/error-status.ts`) | `src/lib/blob/*` | 06 | 07, 09 |
| C-17 | Estrazione: `ExtractionSchema` (zod) e `Extraction`, `EXTRACTION_SYSTEM_PROMPT`, `buildExtractionInstruction`, `BillExtractor` (`extract(input): Promise<ExtractorOutcome>`), `createAnthropicExtractor`, `createFakeExtractor`, `validateExtraction`, `verifyDocument`, `toBillInput(extraction, context): ReviewDraft`, `EXTRACTION_MODEL`, `MODEL_PRICES`, `costMicroUsd(usage, model)`, `estimateExtractionCost({ pdfPages, photos })`; servizi `createExtraction`, `createAttachment`, `markExtractionUploaded`, `markAttachmentUploaded`, `runExtraction`, `getExtractionReview`, `confirmExtraction`, `discardExtraction`, `listPendingExtractions`, `countExtractedToReview`, `monthlyExtractionSpend`, `listBillDocuments`, `readDocumentFile`, `authorizeDocumentUpload` (06) e `listBatches`, `listBatchExtractions`, `nextExtractionToReview`, `listImportSupplies` (07); `createFakeExtractor(dir, options?: { delayMs })` (06, l'opzione dalla 07); la risposta «doppione» `{ duplicateOf, duplicateStatus, documents?, estimatedCostMicroUsd?, errorCode?, errorMessage? }` di `POST /api/extractions` (D-59); route di T-22 | `src/lib/extraction/*`, `src/lib/services/extractions.ts` | 06, 07 | 07, 09 |
| C-18 | Container: `getDb()` (01), `getBlobStore()`, `getBillExtractor()`, `isExtractionConfigured()`, `isBlobConfigured()` (06) | `src/lib/container.ts` | 01, 06 | 06+ |
| C-19 | Riferimenti: `fasciaOfHour(date, hour)`, `isNationalHoliday`, `easterSunday` (`fasce.ts`); `computePunMonthly(prices)`, `PunBand` (`pun.ts`); `ReferenceSeries`, `loadReferenceSeries(db)` (`series.ts`); `referenceLinesFor({ kind, months, series, calorificValueGj })`, `STANDARD_CALORIFIC_VALUE_GJ` (`reference-lines.ts`); `ReferenceLine` resta della 04 (C-15) | `src/lib/references/*` | 08 | — |
| C-20 | Coda offline: `offlineDb` (Dexie `segnabollette-offline`, tabelle `pendingBillUploads`, `pendingSelfReadings`, voci con `userId`), `QueueDeps`, `browserQueueDeps(userId)`, `enqueueBillUpload`, `enqueueSelfReading`, `drainQueue(deps)`, `retryItem(kind, id, deps)`, `removeItem`, `clearUserQueue(userId)`, `RETRY_DELAYS_MS`, `NETWORK_RETRY_DELAY_MS`, `QUEUE_LOCK_NAME`; `QueueUserProvider`, `useQueueDeps`, `useQueueItems`, `useQueueTriggers` (`src/components/offline/`); route `POST /api/readings` | `src/lib/offline/*` | 09 | — |
| C-21 | Seed: `SEED_USERS` (due utenti) e `seedDatabase(db)` (01; la 02 lo estende con i dati senza cambiarne la firma); `buildSeedBills(kind, supplyId, months)` (02). Gli utenti seed sono in sola lettura per Playwright (AGENTS.md § 9) | `scripts/seed-data.ts`, `scripts/seed.ts` | 01 (utenti), 02 (dati) | 03+, E2E |
| C-22 | Produzione dagli script: `readProductionTarget(env: Readonly<Record<string, string \| undefined>>): { url; authToken }` e `loadProductionTarget()` (legge `.env.turso-prod`); gli script che scrivono in produzione lo fanno solo dietro `--prod` | `scripts/production-target.ts` | 05 | 06 (`documents:prune`), 07 (le letture di produzione del collaudo), 08 (`riferimenti:pun`) |
| C-23 | Helper E2E: `signUpTestUser(page, prefix): Promise<{ email; password }>` (registra dalla UI un utente nuovo per ogni test che scrive dati) | `tests/e2e/helpers.ts` | 03 | 04+ |
| C-24 | `AppShell` (componente client) con props `{ children }` (03), `reviewCount: number` (06), `userId: string` (09), montato dal layout `(app)` dopo la guardia; cresce solo con props calcolate dal layout e componenti client al suo interno, e non ha un'intestazione (guida `doc/guide/app.md` § 4) | `src/components/shell/app-shell.tsx` | 03 | 06, 09 |

Regola: un contratto si cambia solo nella spec che lo crea; se cambia nome o firma, si aggiornano
questa tabella e OGNI spec viva che lo cita (testo e prompt in fondo).

## 7. Regole della serie

1. **Le etichette della serie non entrano nel codice**: niente «D-12», «T-3», «spec 04» in
   identificatori, commenti o messaggi di commit; nel codice si scrive il perché per esteso.
2. **Numeri di riga**: non esistono ancora; le spec citano file, funzioni e firme. Un nome o una
   firma sbagliati sono un rilievo, un numero di riga no.
3. **Limiti dei documenti**: CLAUDE.md sotto 40.000 caratteri (obiettivo 20.000; misura:
   `node -e "console.log([...require('fs').readFileSync('CLAUDE.md','utf8').replace(/\r/g,'')].length)"`),
   AGENTS.md ≤ 1000 righe (obiettivo 600), `doc/guide/<tema>.md` ≤ 500 righe. Chi sfora non taglia
   in chiusura: lo dice e propone lo scorporo (prompt 05/06).
4. **Stato**: ogni spec apre con la riga `> **Stato**: …` (scritta · in implementazione il <data>,
   branch · implementata il <data>, branch `feature/NN-…` (il commit precede la PR, quindi il
   numero della PR lo scrive il commit di chiusura, D-41) · in esercizio il <data>, PR #N · ritirata il
   <data>); lo stesso
   stato sta in § 5 qui e, per la spec corrente, in `CLAUDE.md § Current Status` → Latest. Si
   chiude con `grep -n "Stato" doc/v1/*.md` che dice la stessa cosa ovunque.
5. **In esercizio** vuol dire: PR mergiata su `main` E deploy di produzione su Vercel verde E la
   misura di chiusura della spec rifatta in produzione (ogni spec la dichiara in § 8). Per 01–04,
   che vivono prima del deploy: PR mergiata su `main` E il collaudo di § 7 annotato in CLAUDE.md;
   la 05 rifà in produzione le misure di chiusura di 01–04. Dalla 05 la misura in produzione si
   fa dopo il merge e il suo esito entra nel commit di chiusura della stessa sessione (D-41).
6. **Ritiro**: una spec in esercizio si ritira con `doc/v1/PROMPT-RITIRO.md` (generato il
   2026-10-24 con `claude-config/prompts/08_CREA_RITIRO_SPEC.md`, in una sessione a sé fra la
   lettura adversariale e la spec 01): verifica criterio per criterio, travaso in AGENTS.md /
   `doc/guide/` / CLAUDE.md, `git rm` della spec; l'indice resta finché vive una spec; l'ultimo
   ritiro porta via la cartella.
7. **Dati dell'owner**: nessuna bolletta vera, nessun POD/PDR, numero di fattura, codice cliente,
   indirizzo, nome, fornitore o importo dell'owner nei file tracciati, nei commit e nelle PR
   (WORKFLOW.md § 1.6, repo pubblico). Le bollette di prova sono **sintetiche e generate**
   (`pnpm fixture:bills`, fornitori inventati come «Fenicottero Energia», numeri tondi); il PUN
   non entra mai nel repo (D-32).
8. **Prove sui servizi veri**: Claude e Blob si testano con fixture e fake, mai contro i servizi;
   una chiamata reale si fa solo nel collaudo guidato (§ 7 di ogni spec) con l'OK dell'owner, ed è
   sempre dichiarata con il suo effetto (scrittura su Blob, riga nel DB) e il suo costo (≈ 0,30 $
   a bolletta con Opus 5.5: la stima di T-23 per una bolletta di 8 pagine è 0,31 $).
9. **Ogni rinvio ha un erede**: una spec successiva per nome o `CLAUDE.md § Not yet present`.
10. **Le regole di AGENTS.md** valgono dalla 01 in poi (il file nasce con la pianificazione e dice
    già come si lavora); ogni spec ne cita in § 5 quelle che contano «qui», con «qui vuol dire che».
11. **Isolamento per utente**: ogni spec che aggiunge una lettura o una scrittura di dati
    dell'utente aggiunge la coppia di test «risorsa propria (passa) / risorsa altrui (rifiutata)»
    (WORKFLOW § 2) e, se tocca una route, la stessa coppia in Playwright.
