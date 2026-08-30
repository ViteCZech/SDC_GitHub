# OFFLINE / LAN režim turnajů — architektonická analýza

## Rozsah a cíl

Tento dokument hodnotí proveditelnost čistě **offline / lokální LAN** režimu pro turnaje (bez internetu a bez Firebase runtime závislosti během turnaje) a navrhuje cílovou architekturu s 1-click spuštěním.

Inspekce byla provedena nad těmito klíčovými soubory:

- `src/services/tournamentSync.js`
- `src/services/publicResultsService.js`
- `src/components/GameX01.jsx`
- `src/components/TabletWaitingRoom.jsx`
- `src/components/VenueDisplayView.jsx`
- `src/components/TournamentSetup.jsx`
- `firestore.rules`
- doplňkově orchestrace v `src/App.jsx` a cloud endpointy ve `functions/src/*.ts`

---

## 1) Proveditelnost odpojení od Firebase (bez rozbití herní logiky)

## 1.1 Shrnutí

**Ano, je to proveditelné**, ale ne jako „výměna jednoho souboru“. Prakticky je nutné:

1. Zavést datovou abstrační vrstvu (`syncAdapter`), která skryje backend.
2. Přesměrovat orchestrace v `App.jsx` z přímých cloud volání na adaptér.
3. V LAN režimu nahradit cloud call flow lokálním relay serverem + lokální persistencí.

Klíčové pozitivum: většina herní logiky (X01, výpočty skupin, pavouk, statistiky, undo-like návraty) je už dnes lokální a oddělená od Firestore dokumentového schématu.

## 1.2 Co je už teď dobře oddělené

- `TournamentSetup.jsx` nepracuje přímo s Firestore. Stav generuje lokálně a předává `onComplete`.
- `TabletWaitingRoom.jsx` nečte Firestore přímo; volá servisní metody (heartbeat/unload release) přes `tournamentSync`.
- `VenueDisplayView.jsx` neobsahuje Firestore dotazy napřímo, používá `listenToCloudTournament` ze služby.
- `GameX01.jsx` drží game state lokálně; na turnajový cloud je napojen jen nepřímo kvůli tablet presence heartbeatu.
- `tournamentLogic` / generování skupin a pavouka běží lokálně v klientu.

To je výborný základ pro injektovatelný adapter bez podmínek `if (isOffline)` uvnitř těchto komponent.

## 1.3 Kde je dnes největší coupling na cloud

- `src/services/tournamentSync.js`:
  - přímé `setDoc/getDoc/onSnapshot` do `active_tournaments`, `past_tournaments`, `public_tournaments`
  - callable Cloud Functions (`submitTabletMatchUpdate`, `registerTabletBoardOnline`)
- `src/services/publicResultsService.js`:
  - veřejný feed je dnes čistě Firestore listener (public + active fallback)
- `src/App.jsx`:
  - orchestruje cloud sync timer, cloud listeners, tablet join verifikaci a cloud update flow
  - má více míst s podmínkami `cloudEnabled && user && !user.isAnonymous`

## 1.4 Dopad na klíčové funkce (Undo/Redo, statistiky, pavouk)

- **Undo/Redo / návrat ze score detailu**: logika je uvnitř `GameX01` a lokálního state flow; není závislá na Firestore transaction semantice.
- **Statistiky**: počítají se z `result/legDetails` v datech zápasu; backend je jen nosič dat.
- **Generování pavouka**: probíhá lokálně (`generateBracketStructure`, `propagateBracketWinners`, JIT board assignment).

Závěr: pokud `syncAdapter` zachová stejný datový kontrakt (`tournamentData`, `groups`, `groupMatches`, `tournamentBracket`), herní logika může běžet beze změn backendu.

---

## 2) Návrh `syncAdapter` (Data Service Abstraction Layer)

## 2.1 Návrhový princip

UI vrstva nesmí řešit, jestli je backend cloud nebo LAN. Rozhodnutí backendu proběhne při bootstrapu aplikace.

### Cílové API (koncept)

```ts
type TournamentSnapshot = {
  tournamentData: object | null;
  groups: unknown[];
  groupMatches: unknown[];
  tournamentBracket: unknown[];
  status?: 'preparing' | 'running' | 'finished';
  lastUpdated?: string;
};

type TabletAuth = {
  board?: string;
  boardToken?: string;
  tabletPassword?: string;
};

type SyncAdapter = {
  mode: 'cloud' | 'lan';

  // turnajový dokument / stream
  listenTournament(pin: string, cb: (snap: TournamentSnapshot | null) => void): () => void;
  syncTournament(pin: string, snap: TournamentSnapshot): Promise<void>;
  deleteTournament(pin: string): Promise<void>;
  archiveTournament(ownerId: string, pin: string, name: string, snap: TournamentSnapshot): Promise<void>;

  // tablet + viewer join
  verifyTournamentPin(pin: string): Promise<boolean>;
  verifyTabletAccess(pin: string, tabletPassword?: string, opts?: TabletAuth): Promise<{ ok: boolean; reason?: string }>;
  registerTabletPresence(pin: string, board: string | number, token?: string, opts?: { status?: 'online' | 'offline'; tabletPassword?: string }): Promise<void>;
  updateMatchFromTablet(pin: string, matchType: 'group' | 'bracket', matchId: string, patch: Record<string, unknown>, opts?: TabletAuth): Promise<void>;

  // veřejné výsledky
  listenPublicFeed(cb: (data: unknown) => void, onError?: (e: unknown) => void): () => void;
  getPublicResultById(resultId: string): Promise<unknown | null>;
};
```

## 2.2 Implementace adapterů

- `cloudSyncAdapter`:
  - tenký wrapper nad dnešní `tournamentSync.js` + `publicResultsService.js`
  - minimum změn v chování, slouží jako kompatibilní mezikrok
- `lanSyncAdapter`:
  - mluví s lokálním relay (`ws://<organizer-ip>:<port>`) nebo `http://` API
  - stejné metody + stejné datové payloady jako cloud

## 2.3 Jak dostat adaptér do UI bez `if (isOffline)` v komponentách

1. Přidat `SyncAdapterContext` + hook `useSyncAdapter()`.
2. V `App.jsx` nahradit importy přímých cloud funkcí voláními přes context adapter.
3. Komponenty (`GameX01`, `TabletWaitingRoom`, `VenueDisplayView`) ponechat bez režimových větví:
   - dostanou stejné callbacky/props, jen jejich implementace přepne backend přes adapter.

---

## 3) LAN backend architektura

## 3.1 Doporučená cílová varianta

Pro více zařízení na síti (admin notebook + tablety + viewer TV) doporučuji:

- **Lokální relay server** (Node runtime zabalený v desktop shellu)
- **WebSocket transport** pro realtime
- **SQLite (WAL)** pro odolnost proti pádu/napájení
- **append-only event log** + periodické snapshoty turnaje

## 3.2 Proč ne pouze PWA bez helperu

Samotný browser/PWA na pořadatelském zařízení neumí spolehlivě hostovat příchozí LAN spojení z jiných zařízení bez samostatného lokálního serveru. To je zásadní „zavřená dveř“ pro čistý multi-device LAN režim.

## 3.3 LAN data model (doporučení)

- `tournaments/{pin}` snapshot
- `events/{pin}/{seq}` command/event stream:
  - `MATCH_UPDATED`
  - `BOARD_PRESENCE_CHANGED`
  - `TABLET_TIMEOUT_WARNING`
  - `TOURNAMENT_ARCHIVED`
- `sessions/{token}` lokální role tokeny (admin/tablet/viewer)

Tím získáme:

- deterministickou obnovu po pádu
- audit trail (kdo/odkud poslal update)
- idempotentní replay

---

## 4) 1-Click UX (spuštění „Lokální turnaj“)

## 4.1 UX cíl

Pořadatel nesmí otevírat terminál. Jediné kliknutí v appce spustí kompletní lokální režim.

## 4.2 Navržený flow

1. V turnajovém hubu tlačítko **„Lokální turnaj (LAN)”**.
2. App:
   - přepne backend na `lanSyncAdapter`
   - spustí/zkontroluje lokální relay proces
   - vygeneruje PIN + LAN QR odkazy pro tablety/viewery
3. Zobrazí „LAN status panel“:
   - IP pořadatele (např. `192.168.1.42`)
   - port
   - online/offline stav relay procesu
   - počet připojených tabletů

## 4.3 Technické varianty

### Varianta A (doporučeno): Electron desktop shell

- + skutečný one-click start procesu
- + kontrola životního cyklu relay služby
- + jednodušší onboarding pro ne-tech pořadatele
- - nový desktop packaging pipeline

### Varianta B: PWA + externí helper služba

- + menší zásah do UI
- - slabší UX (instalace helperu, servis na pozadí)
- - horší podpora uživatelů

Z pohledu požadavku „bez terminálu, 1-click“ je A výrazně robustnější.

---

## 5) Post-turnaj sync do Firebase po návratu internetu (bezpečně, bez přepisů)

## 5.1 Cíl „100% bezpečně“

Upload nesmí:

- přepsat cizí/novější data
- vytvořit duplicity při opakovaném uploadu
- ztratit vazbu na vlastníka

## 5.2 Povinné identity a metadata

Při založení LAN turnaje vytvořit:

- `offlineTournamentId` (UUIDv7)
- `localOrganizerId` (lokální profil)
- `startedAt`, `finishedAt`
- `snapshotHash` (SHA-256 přes canonical JSON)
- `schemaVersion`

## 5.3 Upload protokol (idempotentní)

1. Uživatel se přihlásí Google účtem (získá `ownerId = auth.uid`).
2. Klient pošle snapshot na Cloud Function `importOfflineTournament`.
3. Function v transakci:
   - ověří auth
   - ověří, že `offlineTournamentId` + `ownerId` ještě není importovaný
   - ověří hash a minimální schéma
   - vytvoří nový dokument v `past_tournaments` (append-only, nikdy update cizího)
   - zapíše mapping do `offline_imports/{ownerId}_{offlineTournamentId}` jako idempotency klíč
4. Pokud klient retryne stejný upload, Function vrátí původní `pastTournamentId` místo duplikace.

## 5.4 Ochrana proti přepisu dat

- Upload **nikdy nepoužije** `setDoc(..., merge: true)` na existujícím cloud turnaji.
- Import jde vždy do nového archivního záznamu (`past_tournaments`).
- Konflikty se řeší explicitně (např. stejný `offlineTournamentId` s jiným hashem = hard error + manuální řešení).

## 5.5 Párování na `ownerId`

- `ownerId` se bere výhradně z runtime auth (`request.auth.uid`) v Cloud Function.
- Klientem poslaný `ownerId` se ignoruje.
- Pro audit uložit i `localOrganizerId`, ale bez autorizační síly.

---

## 6) Risk matrix a „zavřené dveře“

| Riziko | Dopad | Pravděpodobnost | Mitigace |
|---|---|---|---|
| Offline režim bez Firebase Auth | Bez přihlášení nelze použít cloud rules/callables | Vysoká | Lokální session tokeny (HMAC/JWT) vydávané relay serverem, role admin/tablet/viewer |
| Výpadek napájení/pád notebooku | Ztráta průběhu turnaje | Střední až vysoká | SQLite WAL, autosave každé změny, event log + snapshot každých N změn, recovery wizard po restartu |
| Pořadatel nesmí používat terminál | Režim bude nepoužitelný | Vysoká | Electron wrapper se zabudovaným relay procesem + healthcheck |
| Kolize PIN v LAN | Tablety se připojí na špatný turnaj | Střední | PIN + turnajový fingerprint (název + startedAt) + QR token na terč |
| Duplicitní post-upload | Dvojitý záznam v historii | Střední | Idempotency key (`ownerId + offlineTournamentId`), hash kontrola |
| Částečný upload při výpadku internetu | Nekonzistentní cloud stav | Střední | Upload pouze přes jednu transakční Cloud Function, klientský retry s idempotencí |

### Zavřené dveře (v aktuální architektuře)

1. **Čistá PWA bez lokálního helperu** nezajistí spolehlivý multi-device LAN host.
2. **Stávající callable flow pro tablet** je internet-dependent.
3. **Pravidla Firestore** neřeší offline autoritu; tu musí řešit lokální backend.

---

## 7) Implementační roadmapa (4 fáze)

## Fáze 1 — Abstrakce a kompatibilita (bez funkční změny)

- Přidat `SyncAdapterContext` a `cloudSyncAdapter`.
- Přesměrovat `App.jsx` orchestrace na adapter API.
- Udržet stávající cloud chování 1:1.
- Přidat integrační testy pro adapter kontrakt.

## Fáze 2 — LAN relay MVP

- Vytvořit `lanSyncAdapter`.
- Implementovat lokální relay (WebSocket + SQLite).
- Tablet/viewer join + board presence + match update přes LAN.
- Jednozařízení + multi-device LAN smoke test.

## Fáze 3 — Offline auth + crash resilience

- Lokální role tokeny (admin/tablet/viewer).
- Event sourcing + recovery flow po pádu.
- QA scénáře: výpadek napájení, restart app, reconnect tabletů.

## Fáze 4 — Cloud import a 1-click produktizace

- Cloud Function `importOfflineTournament` s idempotencí a hash validací.
- UI „Nahrát do cloudu“ po přihlášení.
- Electron packaging: start relay bez terminálu, distribuční build.

---

## 8) Doporučení: první krok realizace

Nejlepší první krok je **Fáze 1: zavést `syncAdapter` kontrakt a přesměrovat `App.jsx` na adapter**, zatím pouze s cloud implementací.

Důvod: odstraní se coupling na konkrétní backend bez změny chování. Tím vznikne bezpečný prostor pro LAN implementaci bez zásahu do herních komponent a bez regresí v pravidlech X01/turnajové logice.

