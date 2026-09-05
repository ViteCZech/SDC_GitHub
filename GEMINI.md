# Simple Dart Counter (SDC)

Kontextový dokument pro AI (Gemini / Cursor). Čti tento soubor před jakoukoli změnou kódu.

Aplikace: **Simple Dart Counter** (npm název `darts-cloud-pro`), verze UI `v1.10.2` v `simple-dart-counter/src/App.jsx`.
Produkt: PWA počítadlo šipek + správa klubových turnajů (Česko, ČŠO žebříčky). Jazyky UI: **cs / en / pl**.

Kód a komentáře jsou převážně česky. Překlady žijí v `simple-dart-counter/src/translations.js` (jeden velký objekt `translations`).

---

## Repozitář

```
SDC_GitHub/
  GEMINI.md                          ← tento soubor
  .github/workflows/                 ← Firebase Hosting + Functions deploy, update žebříčků
  simple-dart-counter/               ← CELÁ APLIKACE (pracovní kořen)
    src/App.jsx                      ← orchestrátor (stavy, auth, turnaj, online, UI)
    src/main.jsx                     ← React 19 + PWA service worker
    src/firebase.js                  ← Firebase Auth + Firestore DB `eur3`
    src/translations.js
    src/components/                  ← obrazovky a UI
    src/components/online/           ← online lobby / video / post-match
    src/components/prereg/           ← předregistrace turnajů
    src/services/                    ← Firebase klientské API
    src/utils/                       ← čistá herní / turnajová logika
    src/hooks/
    src/context/
    functions/                       ← Cloud Functions (Node 20, region europe-west1)
    firestore.rules
    firestore.indexes.json
    firebase.json
    public/                          ← PWA ikony, ČŠO JSON fallback, privacy.html
```

**Pracuj vždy v `simple-dart-counter/`.** Root repo jen obaluje GitHub Actions.

---

## Stack

| Vrstva | Technologie |
|---|---|
| UI | React 19, Vite 8, Tailwind 3, lucide-react, qrcode.react |
| Stav | Žádný Redux/Router. Jeden `appState` string v `App.jsx` |
| Backend | Firebase project `simple-dart-counter-12ff2` |
| DB | Firestore named database **`eur3`** |
| Auth | Google (admin/cloud) + anonymní (online hry) |
| Functions | `firebase-functions` v2, region **`europe-west1`** |
| PWA | `vite-plugin-pwa`, manifest v `public/manifest.json` |
| CI | Push na `main` → build web + deploy Hosting + Functions + rules |

Lokální běh: `cd simple-dart-counter && npm run dev`. Functions: `cd functions && npm run serve`.

---

## Architektura (důležité)

`App.jsx` (~6000 řádků) je **centrální orchestrátor**, ne „hloupý router“. Drží:

- `appState` — která obrazovka se kreslí
- `userRole` — `admin` | `viewer` | `tablet` | null
- nastavení zápasu, historii, turnajová data, cloud sync, parked session
- Google login, anonymous auth pro online

**Herní logika turnajů patří do `src/utils/`, ne do komponent.** Komponenty jen zobrazují a volají callbacky z `App.jsx`.

Navigace Domů/Zpět: `src/utils/appNavigation.js` (`resolveAppNav`). Herní plocha (`playing`, `match_finished`) má vlastní Pause menu, ne AppNavBar.

Při „Domů“ z běžícího turnaje se relace **parkne** (`ActiveSessionBanner`) — nesmí se tiše zahodit.

---

## Obrazovky (`appState`)

### Domů a zápasy
| Stav | Co to je | Hlavní soubor |
|---|---|---|
| `home` | Menu: Nová hra, Tutorial, Historie, Turnaj, Statistiky, Online, O aplikaci | `App.jsx` |
| `setup` | Nastavení lokálního zápasu | `App.jsx` |
| `playing` | Herní plocha X01 / Cricket | `GameX01.jsx`, `GameCricket.jsx` |
| `match_finished` | Statistiky po zápase | `App.jsx` + `Stats.jsx` |
| `history` | Historie zápasů | `App.jsx` |
| `profile` | Osobní statistiky (vyžaduje Google) | `App.jsx` |
| `tutorial` | Průvodce | `App.jsx` |
| `about` | O aplikaci | `App.jsx` |

### Turnaj (živý běh)
| Stav | Krok stepperu | Role | Soubor |
|---|---|---|---|
| `tournament_hub` | — | všichni | `TournamentHub.jsx` |
| `tournament_setup` | 1–3 | admin | `TournamentSetup.jsx` |
| `tournament_board_assignment` | 4 | admin | `TournamentBoardAssignment.jsx` |
| `tournament_groups` | 5 | admin / viewer | `TournamentGroupsView.jsx` |
| `tournament_bracket` | 6 | admin / viewer | `TournamentBracketView.jsx` |
| `tournament_stats` | 7 | admin / viewer | `TournamentStatisticsView.jsx` |
| `tournament_tablet` | — | tablet | `TabletWaitingRoom.jsx` |
| `tournament_viewer_preparing` | — | viewer | `App.jsx` |
| `tournament_history` | — | admin (Google) | `TournamentHistory.jsx` |

### Předregistrace
| Stav | Co to je | Soubor |
|---|---|---|
| `prereg_list` | Moje turnaje | `MyPreRegTournamentsList.jsx` |
| `prereg_setup` | Založení předregistrace | `TournamentPreRegSetup.jsx` |
| `prereg_admin` | Admin přihlášek | `RegistrationAdminPanel.jsx` |
| `prereg_catalog` | Veřejný katalog `/tournaments` | `PublicTournamentDirectory.jsx` |
| `prereg_public` | Veřejná stránka `/t/:id` | `PublicTournamentPage.jsx` |

URL deep-linky (bez React Routeru, parsují se z `window.location`):

- `/t/:tournamentId` — veřejná předregistrace (`?invite=` pro spolupořadatele)
- `/tournaments` — katalog
- `/tv/:pin` — veřejná TV obrazovka haly (`VenueDisplayView.jsx`), mimo tok `App.jsx` (jen čte `active_tournaments/{pin}`). Kiosk: `100vh` + `overflow: hidden`, bez posuvníků. Pavouk se kreslí jen když už existuje; jinak 100 % plochy mají terče / skupiny. Terče max 6 / stránka, skupiny max 4 (mřížka 2×2), rotace 10 s.
- tablet QR: PIN + číslo terče + token (`tabletBoardQr.js`)

---

## Moduly funkcí

### 1. Lokální zápas (offline-first)

Domů → Nová hra (`setup`) → `playing`.

- Typ: **X01** (301/501, Single/Double Out) nebo **Cricket** (15–20 + bull)
- Formát: First To / Best Of, vlastní sety (1–9) × legy (až 21)
- Soupeř: člověk nebo **bot** (avg 45 / 65 / 100 / custom 40–120)
- Virtuální klávesnice na tabletu (`VirtualKeyboard.jsx`, `NumericKeyboard.jsx`)
- Undo, editace hodu, quick checkout, nemožná skóre (163, 166, …)
- Historie v `localStorage`; po Google loginu nabídka zálohy do cloudu

Klíčové: `GameX01.jsx`, `GameCricket.jsx`, `Stats.jsx`.

### 2. Online hra 1v1 (Firestore + WebRTC)

Domů → Online Hra.

- Host založí lobby (veřejná / soukromá PIN)
- Host: kamera povinná, guest se připojí jménem
- X01 nebo Cricket, 1–30 legů, SO/DO/MO, kdo začíná
- Live stav v `onlineGames/{id}.liveGameState`
- Heartbeat host/guest, reconnect (`onlineReconnectStorage.js`)
- Po legu čeká **OK od poraženého** než začne další
- Video: `OnlineVideo.jsx` / `OnlineVideoContainer.jsx`, `useLobbyMedia.js`
- Opustit zápas = `abandoned` (soupeř to uvidí); výpadek spojení ≠ abandon

Služba: `src/services/onlineGamesService.js`. Auth: **anonymní**. Kolekce `onlineGames` + subkolekce `webrtc`, `signaling`.

### 3. Turnaj — živý provoz (Admin / Tablet / Divák)

Vstup: Domů → Turnaj (`TournamentHub`).

**Role**
- **Admin** (Google, pokud cloud): setup, los, terče, řízení, statistiky, QR pro tablety
- **Tablet** (kiosk u terče): PIN + číslo desky + heslo/token → čekárna, check-in, zadávání zápasu
- **Viewer**: jen PIN → sleduje skupiny / pavouka / statistiky (live)

**Formáty** (`tournamentLogic.js`)
- `groups_bracket` — skupiny (round-robin, 3–5 hráčů) → pavouk
- čistý KO pavouk (`bracket` / `direct-ko`) — seeding podle ranku

**Stepper admina**
1. Turnaj (název, formát, legy, 501/out, počet terčů, ČŠO žebříček, cloud). Z předregistrace: název a typ soutěže zamčené.
2. Hráči (našeptávač ČŠO, duplicity, ranking). U `random_doubles` los párů (`drawRandomPairs`) — lichý = rezervní. Z předregistrace: soupiska jen náhled, editace ve správě přihlášek + re-import.
3. Formát skupin / postupující / odhad času
4. Přiřazení terčů skupinám
5. Skupiny — zápasy, walkovery, start na tabletu / adminovi
6. Pavouk — JIT desky + rozhodčí (chalker), postup vítězů
7. Statistiky, prize pool, konec turnaje

**Cloud turnaje** (volitelné, vyžaduje Google):
- `active_tournaments/{pin}` — živý stav (čtení veřejné, zápis jen auth)
- `past_tournaments` — archiv po skončení
- `tournament_pins/{pin}` — vlastnictví PINu
- Tablety posílají výsledky přes CF `submitTabletMatchUpdate` / `registerTabletBoardOnline`
- Check-in timeout + varování adminovi (`tabletCheckInTimeout.js`)
- Po startu se **zamkne ranking/los** (`tournamentRanking.js`)

Logika: `tournamentLogic.js`, `tournamentGenerator.js`, `tournamentRanking.js`, `prizePool.js`.
Sync: `services/tournamentSync.js`.

### 4. Předregistrace turnajů (Fáze 1)

Samostatný modul od živého turnaje. Kolekce `tournaments/{id}` + `registrations/{regId}`.

Stavy turnaje: `DRAFT` → `REGISTRATION_OPEN` → `REGISTRATION_CLOSED` → `IN_PROGRESS` → `FINISHED`.

Stavy přihlášky: `PENDING_PAYMENT` | `CONFIRMED` | `WAITLIST` | `CANCELLED` | `NO_SHOW`.
Hráč se může sám odhlásit (`unregisterPlayer`) jen při `REGISTRATION_OPEN`. Storno uvolní místo a případně posune waitlist; zaplacené startovné označí `payment.refundDue`.

Formát: `meta.competitionType` = `singles` | `doubles` | `mixed` | `random_doubles`.
Dvojice / mix: kapacita je v **párech** (`counters.confirmedTeams`). Sólo nebo `WAITING_PARTNER` místo nebere. Párování jen přes CF (`listAvailablePartners`, `requestPair`, `confirmPair`, `declinePair`). Potvrzuje hráč vybraný ze seznamu. Mix = 1 M + 1 F. `finance.feeMode` = `pair` (jedno startovné) | `split`. `random_doubles` se hlásí jako jednotlivci; páry se losují v `TournamentSetup` (`drawRandomPairs`) až po soupisce, před generováním skupin. Lichý počet = rezervní (mimo soupisku dvojic). Cricket a online 1v1 dvojice nemají.

Funkce:
- Založení (název, místo, kapacita, waitlist, deadline, startovné, QR/hotovost, bankovní účet, VS, podmínky)
- Veřejný katalog + stránka turnaje
- Registrace hráče **jen přes Cloud Function** (ne přímý zápis z klienta)
- Platba QR (SPD string, `spdQr.js`) nebo hotově
- Admin: potvrzení platby, check-in (přítomnost v den turnaje), ruční přihláška, **import potvrzených** do živého turnaje. Check-in u terče **není** podmínka importu ani losu skupin — los jde udělat dny před `meta.startsAt`. Potvrzená dvojice je 1 řádek (`Jalůvka/Armlich`); přítomnost vždy po hráčích. Platba a storno: `feeMode=pair` = 1 ikona za pár, `split` = zvlášť.
- Import do `TournamentSetup` **není** založení nového rychlého turnaje: název, typ soutěže a soupiska jsou z předregistrace (zamčené). Hráče se přidávají ve správě přihlášek a znovu importují. Krok 1 u importu = formát / PIN / tablety / terče, ne přejmenování.
- Spolupořadatel přes invite token (`?invite=`)
- „Mé přihlášky“ přes CF `listMyRegistrations` (index `player_registration_links` — klient nesmí číst)

Typy: `src/types/tournamentPreReg.d.ts` a `functions/src/types.ts` — držet v synchronu.

### 5. Žebříček ČŠO (Stedar)

- Firestore `cso_rankings/{men|women|doubles}` — write jen Admin SDK
- Fallback JSON v `public/data/cso-ranking-*.json`
- Klient: `utils/csoRanking.js` (našeptávač jmen, live rank)
- **Singles / online 1v1 / lokální zápas:** jen `men` (rankingId=1) a `women` (rankingId=2)
- **Dvojice / mix / losované dvojice:** `doubles` = Stedar ČP nasazovací (rankingId=6). Nikdy ne id=5.
- Nasazení páru: součet obou doubles ranků → lepší individuální rank → `seedTieBreak`
- Import předregistrace u dvojic skládá `players[]` jako týmy (`kind: 'team'`, `members`). U `random_doubles` importuje jednotlivce; admin v kroku 2 spustí los párů. Seed páru = součet ČP dvojice.
- **X01 dvojice:** `settings.doubles` + `settings.teams.{p1,p2}.members`. Zápas zůstává 2 sloty (`player1Id`/`player2Id` = tým). Každý leg: začínající dvojice musí vybrat házejícího; druhá může hned, nebo až po prvním hodu. Pak střídání uvnitř páru. Historie hodu má `throwerId`. Výsledek: `result.p1Avg/p2Avg` = pár, `result.members` = 4 hráči, `result.legStarters`. Tablet check-in = 4 hráči + 1 počtář. Skupinová tabulka bere **týmový** průměr. Počtář je **osoba** — sériový rozvrh jako u jednotlivců (`chalkerId` = slot), z páru vždy 1 hráč, střídání napříč zápasy. **1 terč = sériový ČŠO rozvrh.** Až admin skupině (singles i dvojice) dá 2+ terče, `adaptGroupParallelPlay` pustí jen zápasy bez společných hráčů (`pickParallelGroupMatches`); volní počítají. U 6 jednotlivců na 2 terčích hrají 4 + 2 počítají (nikdo nečeká). Počtář se může lišit od sériového slotu. Cricket a online 1v1 dvojice nemají.
- Scheduled CF denně 7:00 Europe/Prague + ruční tlačítko `CsoRankingUpdateButton`
- Identita hráče: `playerIdentity.js` / `functions/src/playerIdentity.ts` (nameKey + `csoPlayerId`)

---

## Cloud Functions (`functions/src/`)

Region **europe-west1**, DB **eur3**. Export v `index.ts`:

| Funkce | Účel |
|---|---|
| `registerPlayer` | Veřejná přihláška na předregistraci |
| `createManualRegistration` | Admin ruční přihláška |
| `unregisterPlayer` | Hráč stornuje přihlášku (jen REGISTRATION_OPEN) |
| `listAvailablePartners` | Nespárovaní hráči (jen jména) pro výběr partnera |
| `requestPair` | Žádost o pár — vybraný hráč potvrzuje |
| `confirmPair` / `declinePair` | Potvrzení / odmítnutí žádosti o pár |
| `listMyRegistrations` | Přihlášky přihlášeného hráče |
| `submitTabletMatchUpdate` | Tablet zapíše výsledek zápasu do `active_tournaments` |
| `registerTabletBoardOnline` | Tablet se ohlásí jako online na desce |
| `verifyTabletBoardAccess` | Ověření PIN + token/heslo tabletu (tajemství mimo public doc) |
| `claimAdminInvite` / `verifyAdminInvite` | Spolupořadatel jen přes CF (invite token) |
| `lookupPrivateOnlineGame` / `joinPrivateOnlineGame` | Soukromá online lobby podle PINu |
| `updateCsoRankingsScheduled` | Cron 7:00 |
| `updateCsoRankingsNow` | Callable, jen Google účet |

Po změně `functions/src` vždy `npm run build` v `functions/` (tsc → `lib/`).

---

## Firestore kolekce (zjednodušeně)

| Kolekce | Kdo čte | Kdo píše |
|---|---|---|
| `onlineGames` | veřejné waiting; soukromé waiting jen host; po joinu účastník | host create; veřejný join/heartbeat/live; soukromý join jen CF |
| `active_tournaments/{pin}` | kdokoli | Google `ownerUid` (ne anonymous); tablety přes CF |
| `tournament_secrets/{pin}` | Google vlastník | Google vlastník (heslo tabletů, board tokeny) |
| `past_tournaments` | vlastník (`ownerId` / `userId`) | vlastník |
| `public_tournaments` | kdokoli | Google `ownerUid` |
| `tournaments` | non-DRAFT veřejně; DRAFT jen owner | owner create/update (`ownerUid` zamčený); co-admin claim jen CF |
| `tournaments/{id}/admin_private` | owner | owner (invite tokeny, admin PIN hash) |
| `tournaments/{id}/registrations` | admin turnaje | admin; veřejnost jen přes CF |
| `tournament_pins` | vlastník PINu | owner |
| `cso_rankings` | kdokoli | jen Functions |
| `player_registration_links` | nikdo z klienta | jen Functions |

Při změně datového modelu **uprav i `firestore.rules`**.

---

## Konvence při úpravách

1. **Nová obrazovka** = nový `appState` + větev v `App.jsx` + záznam v `appNavigation.js`.
2. **Nový text UI** = klíč v `translations.js` pro cs, en i pl. Nehardcodovat stringy v komponentách (výjimka: pár starších míst v Cricket).
3. **Turnajová pravidla** (postup, pavouk, rozhodčí, odhad času) → `tournamentLogic.js`. Testuj edge cases: lichý počet, bye, walkover, JIT desky.
4. **Identita hráče** (duplicity ČŠO vs rekreační) → `playerIdentity.js`, stejná logika na CF.
5. **Nedávej tajemství do gitu.** Firebase web config v `firebase.js` je veřejný klientský klíč — OK. Service account nikdy.
6. **App.jsx je velký.** Novou logiku extrahuj do `utils/` / `services/` / komponenty. Do App.jsx jen wiring.
7. **Tablet = kiosk.** Žádný Google login na tabletu. Přístup PIN + board + heslo/token.
8. **Cloud turnaje** vyžaduje Google účet. Offline turnaj musí dál fungovat bez cloudu.
9. **PWA:** po změně chování ověř, že service worker neservíruje starý bundle; `registerSW({ immediate: true })`.
10. Neměň Firebase project ID, název DB `eur3`, ani region functions bez výslovného zadání.

---

## Kde začít při typickém úkolu

| Úkol | Soubory |
|---|---|
| Chování X01 (bust, checkout, undo, online ACK) | `GameX01.jsx` |
| Cricket značky / MPR | `GameCricket.jsx` |
| Setup lokálního zápasu / bot | `App.jsx` (`setup`) |
| Online lobby / join / abandon | `onlineGamesService.js`, `OnlineHub.jsx`, `online/*` |
| Los skupin, pavouk, rozhodčí | `tournamentLogic.js`, `tournamentGenerator.js` |
| Stepper turnaje / lock rankingu | `App.jsx`, `TournamentSetup.jsx`, `tournamentRanking.js` |
| Tablet čekárna / check-in timeout | `TabletWaitingRoom.jsx`, `tabletCheckInTimeout.js` |
| QR tabletu | `tabletBoardQr.js`, `TabletBoardQrPanel.jsx` |
| TV obrazovka haly `/tv/:pin` | `VenueDisplayView.jsx`, `utils/venueDisplay.js` |
| Předregistrace / platby | `tournamentPreRegService.js`, `prereg/*`, `functions/src/registerPlayer.ts` |
| ČŠO našeptávač | `csoRanking.js`, `CsoPlayerNameField.jsx` |
| Navigace Domů/Zpět | `appNavigation.js`, `AppNavBar.jsx` |
| Firestore oprávnění | `firestore.rules` |

---

## Co aplikace záměrně nemá

- React Router, Redux, TypeScript na klientovi (jen Functions + JSDoc typy)
- Uživatelské účty mimo Google / anonymní Firebase
- Mobilní native app (je to PWA)
- Kompletní „přátelé“ síť — v překladech je relikt `friends`, reálně cloud = Google backup + online lobby
