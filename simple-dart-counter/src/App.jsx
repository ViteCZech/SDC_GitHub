import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, deleteUser } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { 
  AlertTriangle, ArrowLeft, Bot, CheckCircle, ChevronDown, Cpu, Delete, 
  DownloadCloud, FileText, Heart, History, Home, Info, Keyboard as KeyboardIcon, 
  Maximize, Mic, MicOff, MousePointer2, Play, RefreshCw, RotateCcw, 
  Target, Trash2, Trophy, Undo2, User, Cloud, X, BarChart2, List,
  TrendingUp, TrendingDown, Minus, WifiOff
} from 'lucide-react';

// --- VERZOVÁNÍ ---
const APP_VERSION = "v1.7.3"; 

// --- SAFE STORAGE HELPER ---
const safeStorage = {
  getItem: (key) => {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  setItem: (key, value) => {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
};

// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "AIzaSyCJuKUfdx5hC6jbtgBN_zXEnlVaq6mjcM0",
  authDomain: "simple-dart-counter-12ff2.firebaseapp.com",
  projectId: "simple-dart-counter-12ff2",
  storageBucket: "simple-dart-counter-12ff2.firebasestorage.app",
  messagingSenderId: "874074054437",
  appId: "1:874074054437:web:712eec6b4c4f8b9ed644cc",
  measurementId: "G-5NBXTH3LM7"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app, 'eur3');
} catch (e) {
    console.error("Firebase Init Error:", e);
}

const appId = 'sdc_global_production';

// --- PŘEKLADY ---
const translations = {
  cs: { 
    newGame: 'Nová hra', profile: 'Můj profil', friends: 'Přátelé/Cloud', tutorial: 'Průvodce', aboutApp: 'O aplikaci',
    setupTitle: 'Nastavení zápasu', players: 'Hráči', p1Default: 'Domácí', p2Default: 'Hosté', botDefault: 'Robot',
    p1Placeholder: 'Jméno hráče 1', p2Placeholder: 'Jméno hráče 2', matchFormat: 'Formát zápasu',
    firstTo: 'FIRST TO', firstToDesc: 'Kdo dřív vyhraje X legů', bestOf: 'BEST OF', bestOfDesc: 'Hraje se na X legů (většina)',
    startMatch: 'START ZÁPASU', matchHistory: 'Historie zápasů', noMatches: 'Zatím žádné odehrané zápasy',
    backMenu: 'Zpět do menu', legs: 'LEGS', avg: 'AVG', serving: 'HÁZÍ', legFor: 'LEG PRO', 
    matchWinner: 'VÍTĚZ ZÁPASU', quickCheckout: 'Rychlé zavření:', dart: 'šipkou', throw: 'Hod', 
    undo: 'Vrátit', closed: 'Zavřeno', impossible: 'Nemožné skóre', bust: 'PŘEHOZENO!', 
    matchStats: 'Statistiky zápasu', avg3: 'PRŮMĚR (3 š.)', first9: 'FIRST 9 AVG',
    detailWinner: 'Vítěz', detailDarts: 'Šipky', detailAvg: 'Avg Legu', detailCheckout: 'Zavření', 
    editThrow: 'Upravit hod', confirmDarts: 'š.', botDifficulty: 'Obtížnost Bota', 
    diffAmateur: 'Krocan (Avg 45)', diffJelito: 'JELITA (Avg 65)', diffPdc: 'PDC (Avg 100+)', 
    diffCustom: 'Vlastní', customAvg: 'Cílový průměr:', whoStarts: 'Kdo začíná?', 
    save: 'Uložit', cancel: 'Zrušit', rematch: 'Odveta', micError: 'Hlasové zadávání není podporováno',
    highScores: 'VYSOKÉ NÁHOZY', highestCheckout: 'NEJVYŠŠÍ ZAVŘENÍ', presetSaved: 'Uloženo!',
    howManyDarts: 'Kolik šipek?', playerName: 'Jméno',
    checkoutPhrases: ['zavřeno', 'hotovo', 'konec', 'check', 'zaviram', 'zavírám', 'double', 'out'],
    cmdNextLeg: ['další leg', 'pokračovat', 'další hra', 'next'],
    cmdRematch: ['odveta', 'nový zápas', 'znovu', 'další zápas'],
    cmdUndo: ['zpět', 'krok zpět', 'opravit', 'chyba'],
    offlineMode: 'Offline režim', localSave: 'Uloženo v zařízení',
    nextLeg: 'DALŠÍ LEG', updateApp: 'AKTUALIZOVAT APLIKACI',
    updateAvailable: 'NOVÁ VERZE - KLIKNI',
    kbdDone: 'ZAVŘÍT', kbdSpace: 'MEZERNÍK',
    updating: 'Stahuji aktualizaci...', installApp: 'Instalovat aplikaci',
    appError: 'Chyba aplikace',
    iosAddHome: 'Pro fullscreen: Sdílet -> Přidat na plochu',
    installIOS: 'Instalace na iOS',
    voiceCmdMatched: 'Příkaz rozpoznán:',
    micTimeout: 'Mikrofon vypnut (neaktivita)',
    rightsReserved: 'Všechna práva vyhrazena.',
    tutStartTitle: '1. Nastavení a Start',
    tutStartDesc: 'Vyberte jména hráčů, formát zápasu a typ hry (501/301). Kliknutím na terč u jména hráče určíte, kdo zápas začíná.',
    tutBotTitle: '2. Hra proti Botovi',
    tutBotDesc: 'Kliknutím na ikonu procesoru u Hráče 2 zapnete Bota. Můžete mu nastavit obtížnost od amatéra až po profíka, nebo nastavit přesný cílový průměr.',
    tutScoreTitle: '3. Zadávání skóre',
    tutScoreDesc: 'Skóre zadejte na klávesnici a potvrďte. Můžete zadat i zbývající body (zůstatek) – stačí napsat požadované číslo a kliknout přímo nahoře na kartu hráče s aktuálním skóre.',
    tutQuickTitle: '4. Rychlá tlačítka',
    tutQuickDesc: 'Tlačítka dole slouží k rychlému zadání hodů. Chcete vlastní? Napište číslo na klávesnici a poté dlouze podržte jedno z tlačítek pro jeho uložení.',
    tutCheckoutTitle: '5. Rychlé zavření',
    tutCheckoutDesc: 'Jakmile máte skóre, které lze zavřít, objeví se nahoře zelená tlačítka pro zavření 1, 2 nebo 3 šipkami. Stačí kliknout a je hotovo.',
    tutHistoryTitle: '6. Oprava chyb',
    tutHistoryDesc: 'Udělali jste chybu? Tlačítkem "Zpět" (šipka) vrátíte poslední hod. Při hře s Botem se nyní automaticky vrátí váš i botův hod, abyste mohli rovnou opravit svou chybu. Pro úpravu starších hodů klikněte přímo na daný hod v tabulce historie.',
    tutVoiceTitle: '7. Hlasové ovládání',
    tutVoiceDesc: 'Zapněte mikrofon a diktujte skóre (např. "sto čtyřicet"). Můžete také říkat "zavřeno", "další leg" nebo "odveta". Upozornění: V hlučném prostředí (např. v hospodě) může být rozpoznávání nepřesné.',
    tutCloudTitle: '8. Cloud a Statistiky',
    tutCloudDesc: 'Přihlaste se pomocí účtu Google na domovské obrazovce. Získáte tak trvalé ID a vaše odehrané zápasy se budou bezpečně ukládat do cloudu. I když změníte zařízení, vaše historie zůstane s vámi.',
    tutUpdateTitle: '9. Aktualizace aplikace',
    tutUpdateDesc: 'Když vyjde nová verze, v menu a nahoře se objeví blikající zelené tlačítko. Pokud spouštíte apku z plochy jako plnohodnotnou aplikaci, může se kvůli rychlosti nejprve načíst starší verze z paměti. V takovém případě stačí chvilku počkat na tlačítko aktualizace. Pro 100% jistotu aktuální verze je často nejlepší smazat starou ikonu a přidat si na plochu apku znovu z webu.',
    tutProfileTitle: '10. Osobní statistiky',
    tutProfileDesc: 'Najdete zde vývoj průměru, procento výher, úspěšnost kol a kompletní historii náhozů roztříděnou podle období. Data se berou lokálně, dokud se nepřihlásíte.',
    originalScore: 'Původní:',
    loginWithGoogle: 'Přihlásit přes Google (Cloud záloha)',
    logout: 'ODHLÁSIT SE',
    loggedInAs: 'Přihlášen:',
    loginSuccess: 'Přihlášeno!',
    loginError: 'Chyba přihlášení',
    loginDesc: 'Zálohujte své statistiky a propojte svá zařízení',
    loginForHistory: 'Zobrazují se pouze lokální zápasy. Pro cloudovou zálohu se přihlaste.',
    syncTitle: 'Nalezeny offline zápasy',
    syncDesc: 'Našli jsme %d zápasů odehraných na tomto zařízení bez přihlášení. Chcete je přiřadit ke svému účtu a zálohovat do cloudu?',
    syncYes: 'Ano, zálohovat',
    syncNo: 'Ne, ignorovat',
    historyLoginInfo: 'Vidíte pouze lokální zápasy. Pro zobrazení všech statistik a zálohu do cloudu se přihlaste.',
    historyLoginBtn: 'Přihlásit do Cloudu',
    statsToday: 'Dnes', statsAllTime: 'Celkově', stats7Days: '7 Dní', stats30Days: '30 Dní', stats90Days: '90 Dní',
    matchesPlayed: 'Zápasů', winRate: 'Úspěšnost', total180s: 'Počet 180', avgTrend: 'Vývoj průměru',
    checkout100: 'Zavření 100+', statsPersonal: 'Osobní statistiky', statsFirst9: 'First 9 Avg',
    stats100p: '100+', stats140p: '140+', statsAvgCheckout: 'Průměr zavření', statsRoundDist: 'Zavření (Kola)',
    statsRound: 'Kolo', statsCharts: 'Grafy', statsData: 'Data', statsUserFallback: 'Offline Hráč',
    statsMatchLeg: 'ZÁP | LEG', trendAvg: 'Průměr', trendFirst9: 'First 9', trendCheckoutRounds: 'Kola k výhře',
    noTrendData: 'Málo dat',
    deleteAccount: 'Smazat účet a všechna data',
    deleteAccountConfirm: 'Opravdu chcete nenávratně smazat svůj účet a veškerou historii zápasů? Tuto akci nelze vrátit.',
    privacyPolicy: 'Zásady ochrany osobních údajů',
    aboutText: 'Bezplatná aplikace pro počítání skóre a statistik v šipkách. Jsem amatér a apku dělám ve svém volném čase, pro radost ze hry a zcela bez reklam. Navrženo pro jednoduchost, rychlost a čistý design. 🎯'
  },
  en: {
    newGame: 'New Game', profil: 'My profile', friends: 'Friends/Cloud',tutorial: 'Tutorial', aboutApp: 'About App',
    setupTitle: 'Match Setup', players: 'Players', p1Default: 'Home', p2Default: 'Away', botDefault: 'Bot',
    p1Placeholder: 'Player 1 Name', p2Placeholder: 'Player 2 Name', matchFormat: 'Match Format',
    firstTo: 'FIRST TO', bestOf: 'BEST OF', startMatch: 'START MATCH', matchHistory: 'Match History', 
    noMatches: 'No matches yet', backMenu: 'Back to menu', legs: 'LEGS', avg: 'AVG', serving: 'THROWING', 
    legFor: 'LEG FOR', matchWinner: 'MATCH WINNER', quickCheckout: 'Quick Checkout:', dart: 'dart', 
    throw: 'Throw', undo: 'Undo', closed: 'Closed', impossible: 'Impossible score', bust: 'BUST!', 
    matchStats: 'Match Stats', avg3: 'AVG (3 darts)', first9: 'FIRST 9 AVG', detailWinner: 'Winner', 
    detailDarts: 'Darts', detailAvg: 'Leg Avg', detailCheckout: 'Checkout', editThrow: 'Edit Throw', 
    confirmDarts: 'd.', botDifficulty: 'Bot Difficulty', diffAmateur: 'Amateur (Avg 45)', 
    diffJelito: 'Semi-Pro (Avg 65)', diffPdc: 'PDC (Avg 100+)', diffCustom: 'Custom', 
    customAvg: 'Target Avg:', whoStarts: 'Who starts?', save: 'Save', cancel: 'Cancel', 
    rematch: 'Rematch', micError: 'Voice input not supported', highScores: 'HIGH SCORES', 
    highestCheckout: 'HIGHEST CHECKOUT', presetSaved: 'Saved!', howManyDarts: 'How many darts?',
    playerName: 'Name',
    checkoutPhrases: ['checkout', 'closed', 'game', 'finish', 'check', 'out', 'double', 'done'],
    cmdNextLeg: ['next leg', 'continue', 'next game', 'next'],
    cmdRematch: ['rematch', 'new match', 'play again', 'again'],
    cmdUndo: ['undo', 'back', 'mistake', 'wrong'],
    offlineMode: 'Offline Mode', localSave: 'Saved locally',
    nextLeg: 'NEXT LEG', updateApp: 'UPDATE APP',
    updateAvailable: 'UPDATE AVAILABLE',
    kbdDone: 'CLOSE', kbdSpace: 'SPACE',
    updating: 'Updating...', installApp: 'Install App',
    appError: 'Application Error',
    iosAddHome: 'For fullscreen: Share -> Add to Home Screen',
    installIOS: 'Install on iOS',
    voiceCmdMatched: 'Command matched:',
    micTimeout: 'Mic off (inactive)',
    rightsReserved: 'All rights reserved.',
    tutStartTitle: '1. Setup & Start',
    tutStartDesc: 'Select player names, match format, and game type (501/301). Click the target icon next to a player to set who starts the match.',
    tutBotTitle: '2. Playing vs Bot',
    tutBotDesc: 'Click the CPU icon at Player 2 to enable the Bot. You can set the difficulty from amateur to pro, or set a custom target average.',
    tutScoreTitle: '3. Entering Scores',
    tutScoreDesc: 'Enter your throw score using the numpad. You can also enter your remaining score directly: just type the number and tap your active score card at the top.',
    tutQuickTitle: '4. Quick Buttons',
    tutQuickDesc: 'Buttons at the bottom allow fast entry. Want a custom one? Type a number on the numpad first, then long-press any quick button to save it.',
    tutCheckoutTitle: '5. Quick Checkout',
    tutCheckoutDesc: 'When you are on a finish, green buttons will appear above the numpad to quickly checkout with 1, 2, or 3 darts.',
    tutHistoryTitle: '6. Fixing Mistakes',
    tutHistoryDesc: 'Use the Undo button to revert the last throw. When playing against a Bot, it now reverts both your and the bot\'s throw so you can fix your mistake immediately. To fix older throws, tap them directly in the history list.',
    tutVoiceTitle: '7. Voice Control',
    tutVoiceDesc: 'Enable the mic to dictate scores (e.g., "one hundred"). You can also say "checkout", "next leg", or "rematch". Note: Voice control may perform poorly in noisy environments.',
    tutCloudTitle: '8. Cloud & Stats',
    tutCloudDesc: 'Sign in with Google on the home screen to get a permanent ID and save your match history to the cloud. Even if you change devices, your stats stay with you.',
    tutUpdateTitle: '9. App Updates',
    tutUpdateDesc: 'When a new version is released, a blinking green Update button will appear. If you run the app from your home screen, an older version might load from memory first for speed. Just wait a moment for the update button to appear. To be absolutely sure you have the newest version, it is often best to delete the old icon and re-add the app to your home screen from the website.',
    tutProfileTitle: '10. Personal Stats',
    tutProfileDesc: 'Here you can find your averages, win rate, checkout rounds, and trend charts filtered by time. Data is local until you log in.',
    originalScore: 'Original:',
    loginWithGoogle: 'Sign in with Google (Cloud Backup)',
    logout: 'LOGOUT',
    loggedInAs: 'Logged In:',
    loginSuccess: 'Logged in!',
    loginError: 'Login error',
    loginDesc: 'Backup your stats and link your devices',
    loginForHistory: 'Showing local matches only. Log in for cloud backup.',
    syncTitle: 'Offline Matches Found',
    syncDesc: 'We found %d matches played offline on this device. Do you want to assign them to your account and back them up to the cloud?',
    syncYes: 'Yes, backup',
    syncNo: 'No, ignore',
    historyLoginInfo: 'You are viewing local matches only. Log in to see all stats and backup to the cloud.',
    historyLoginBtn: 'Sign in to Cloud',
    statsToday: 'Today', statsAllTime: 'All Time', stats7Days: '7 Days', stats30Days: '30 Days', stats90Days: '90 Days',
    matchesPlayed: 'Matches', winRate: 'Win Rate', total180s: 'Total 180s', avgTrend: 'Average Trend',
    checkout100: '100+ Checkouts', statsPersonal: 'Personal Stats', statsFirst9: 'First 9 Avg',
    stats100p: '100+', stats140p: '140+', statsAvgCheckout: 'Avg Checkout', statsRoundDist: 'Checkout (Rounds)',
    statsRound: 'Round', statsCharts: 'Charts', statsData: 'Data', statsUserFallback: 'Offline User',
    statsMatchLeg: 'MAT | LEG', trendAvg: 'Average', trendFirst9: 'First 9', trendCheckoutRounds: 'Checkout Rnds',
    noTrendData: 'No Data',
    deleteAccount: 'Delete Account & All Data',
    deleteAccountConfirm: 'Are you sure you want to permanently delete your account and all match history? This action cannot be undone.',
    privacyPolicy: 'Privacy Policy',
    aboutText: 'A free app for keeping dart scores and statistics. I am an amateur developer building this in my free time for the love of the game, and completely ad-free. Designed for simplicity, speed, and clean design. 🎯'
  },
  pl: {
    newGame: 'Nowa Gra', profile: 'Mój profil', friends: 'Znajomi/Cloud', tutorial: 'Samouczek', aboutApp: 'O aplikacji',
    setupTitle: 'Ustawienia meczu', players: 'Gracze', p1Default: 'Gospodarze', p2Default: 'Goście', botDefault: 'Bot',
    p1Placeholder: 'Nazwa gracza 1', p2Placeholder: 'Nazwa gracza 2', matchFormat: 'Format meczu',
    firstTo: 'FIRST TO', bestOf: 'BEST OF', startMatch: 'ROZPOCZNIJ MECZ', matchHistory: 'Historia meczów', 
    noMatches: 'Brak meczów', backMenu: 'Powrót', legs: 'LEGI', avg: 'ŚR.', serving: 'RZUCA', 
    legFor: 'LEG DLA', matchWinner: 'ZWYCIĘZCA MECZU', quickCheckout: 'Szybkie zakończenie:', 
    dart: 'lotką', throw: 'Rzut', undo: 'Cofnij', closed: 'Zamknięte!', impossible: 'Niemożliwy wynik', 
    bust: 'FURA!', matchStats: 'Statystyki meczu', avg3: 'ŚREDNIA (3 l.)', first9: 'ŚREDNIA 1. 9', 
    detailWinner: 'Zwycięzca', detailDarts: 'Lotki', detailAvg: 'Śr. lega', detailCheckout: 'Kasa', 
    editThrow: 'Edytuj rzut', confirmDarts: 'l.', botDifficulty: 'Poziom trudności', 
    diffAmateur: 'Amator (Śr 45)', diffJelito: 'Średni (Śr 65)', diffPdc: 'PDC (Śr 100+)', 
    diffCustom: 'Własny', customAvg: 'Celuj w średnią:', whoStarts: 'Kto zaczyna?', 
    save: 'Zapisz', cancel: 'Anuluj', rematch: 'Rewanż', micError: 'Głosowe wprowadzanie nieobsługiwane', 
    highScores: 'WYSOKIE WYNIKI', highestCheckout: 'NAJWYŻSZE ZAMKNIĘCIE', presetSaved: 'Zapisano!',
    howManyDarts: 'Ile rzutek?', playerName: 'Imię',
    checkoutPhrases: ['koniec', 'zamknięte', 'check', 'gotowe', 'szach', 'out', 'koniec lega'],
    cmdNextLeg: ['następny leg', 'dalej', 'kontynuuj', 'następna gra'],
    cmdRematch: ['rewanż', 'nowy mecz', 'jeszcze raz', 'od nowa'],
    cmdUndo: ['cofnij', 'wstecz', 'błąd', 'pomyłka'],
    offlineMode: 'Tryb offline', localSave: 'Zapisano lokalnie',
    nextLeg: 'NASTĘPNY LEG', updateApp: 'AKTUALIZUJ',
    updateAvailable: 'NOWA WERSJA DOSTĘPNA',
    kbdDone: 'ZAMKNIJ', kbdSpace: 'SPACJA',
    updating: 'Aktualizacja...', installApp: 'Zainstaluj',
    appError: 'Błąd aplikacji',
    iosAddHome: 'Pełny ekran: Udostępnij -> Do ekranu początk.',
    installIOS: 'Instalacja na iOS',
    voiceCmdMatched: 'Polecenie:',
    micTimeout: 'Mikrofon wyłączony (brak akt.)',
    rightsReserved: 'Wszelkie prawa zastrzeżone.',
    tutStartTitle: '1. Ustawienia i Start',
    tutStartDesc: 'Wybierz nazwy graczy, format meczu i typ gry (501/301). Kliknij ikonę tarczy przy graczu, aby ustalić, kto zaczyna mecz.',
    tutBotTitle: '2. Gra z Botem',
    tutBotDesc: 'Kliknij ikonę procesora przy Graczu 2, aby włączyć Bota. Możesz ustawić trudność od amatora do profesjonalisty lub podać własną średnią.',
    tutScoreTitle: '3. Wprowadzanie wyników',
    tutScoreDesc: 'Wpisuj wyniki za pomocą klawiatury. Możesz też podać wynik końcowy (pozostałe punkty): wpisz liczbę i kliknij bezpośrednio w kartę aktywnego gracza u góry.',
    tutQuickTitle: '4. Szybkie przyciski',
    tutQuickDesc: 'Przyciski na dole służą do szybkiego wpisywania. Chcesz własny? Wpisz najpierw liczbę, a następnie przytrzymaj dowolny przycisk, aby go zapisać.',
    tutCheckoutTitle: '5. Szybkie kończenie',
    tutCheckoutDesc: 'Gdy masz wynik możliwy do zamknięcia, nad klawiaturą pojawią się zielone przyciski, by szybko zamknąć 1, 2 lub 3 lotkami.',
    tutHistoryTitle: '6. Poprawa błędów',
    tutHistoryDesc: 'Użyj przycisku Cofnij, aby anulować rzut. Grając z Botem, przycisk cofa teraz zarówno Twój rzut, jak i bota, dzięki czemu możesz od razu poprawić błąd. Aby poprawić starsze rzuty, kliknij je bezpośrednio w historii.',
    tutVoiceTitle: '7. Sterowanie głosem',
    tutVoiceDesc: 'Włącz mikrofon, aby dyktować wyniki (np. "sto"). Możesz też powiedzieć "zamknięte", "następny leg" lub "rewanż". Uwaga: W hałaśliwym otoczeniu rozpoznawanie głosu może działać niedokładnie.',
    tutCloudTitle: '8. Chmura i Statystyki',
    tutCloudDesc: 'Zaloguj się przez Google na ekranie głównym, aby uzyskać stałe ID i zapisywać historię meczów w chmurze. Nawet przy zmianie urządzenia statystyki zostaną z tobą.',
    tutUpdateTitle: '9. Aktualizacje aplikacji',
    tutUpdateDesc: 'Gdy pojawi się nowa wersja, pojawi się migający zielony przycisk aktualizacji. Jeśli uruchamiasz aplikację z ekranu głównego, dla szybkości z pamięci może załadować się starsza wersja. Po prostu poczekaj chwilę na przycisk aktualizacji. Aby mieć absolutną pewność co do nowej wersji, często najlepiej jest usunąć starą ikonę i ponownie dodać aplikację do ekranu głównego z przeglądarki.',
    tutProfileTitle: '10. Moje Statystyki',
    tutProfileDesc: 'Znajdziesz tam swoje średnie, wskaźnik zwycięstw, podział na rundy kończące i wykresy trendów. Dane są lokalne do momentu logowania.',
    originalScore: 'Oryginał:',
    loginWithGoogle: 'Zaloguj przez Google (Kopia)',
    logout: 'WYLOGUJ',
    loggedInAs: 'Zalogowano:',
    loginSuccess: 'Zalogowano!',
    loginError: 'Błąd logowania',
    loginDesc: 'Kopia zapasowa w chmurze i synchronizacja',
    loginForHistory: 'Widzisz tylko mecze lokalne. Zaloguj się dla kopii w chmurze.',
    syncTitle: 'Znaleziono mecze offline',
    syncDesc: 'Znaleźliśmy %d meczów rozegranych offline na tym urządzeniu. Czy chcesz przypisać je do swojego konta i zapisać w chmurze?',
    syncYes: 'Tak, zapisz',
    syncNo: 'Nie, ignoruj',
    historyLoginInfo: 'Widzisz tylko mecze lokalne. Zaloguj się, aby zobaczyć wszystkie statystyki i kopię w chmurze.',
    historyLoginBtn: 'Zaloguj do Chmury',
    statsToday: 'Dzisiaj', statsAllTime: 'Zawsze', stats7Days: '7 Dni', stats30Days: '30 Dni', stats90Days: '90 Dni',
    matchesPlayed: 'Mecze', winRate: 'Wygrane', total180s: 'Ilość 180', avgTrend: 'Trend średniej',
    checkout100: 'Zamknięcia 100+', statsPersonal: 'Moje Statystyki', statsFirst9: 'Średnia 1. 9',
    stats100p: '100+', stats140p: '140+', statsAvgCheckout: 'Śr. Zamknięcia', statsRoundDist: 'Zamknięcie (Rundy)',
    statsRound: 'Runda', statsCharts: 'Wykresy', statsData: 'Dane', statsUserFallback: 'Gracz Offline',
    statsMatchLeg: 'MECZ | LEG', trendAvg: 'Średnia', trendFirst9: 'First 9', trendCheckoutRounds: 'Rundy Wygr.',
    noTrendData: 'Mało Danych',
    deleteAccount: 'Usuń konto i wszystkie dane',
    deleteAccountConfirm: 'Czy na pewno chcesz trwale usunąć swoje konto i całą historię meczów? Tej czynności nie można cofnąć.',
    privacyPolicy: 'Polityka prywatności',
    aboutText: 'Darmowa aplikacja do liczenia wyników i statystyk w rzutkach. Jestem amatorem, tworzę ją w wolnym czasie, dla przyjemności z gry i całkowicie bez reklam. Zaprojektowana z myślą o prostocie, szybkości i czystym wyglądzie. 🎯'
  }
};

// --- LOGIKA ---
const getTranslatedName = (name, isPlayer1, currentLang) => {
    if (!name) return '';
    const p1Defaults = [translations.cs.p1Default, translations.en.p1Default, translations.pl.p1Default];
    const p2Defaults = [translations.cs.p2Default, translations.en.p2Default, translations.pl.p2Default];
    const botDefaults = [translations.cs.botDefault, translations.en.botDefault, translations.pl.botDefault];
    
    if (isPlayer1 && p1Defaults.includes(name)) return translations[currentLang].p1Default;
    if (!isPlayer1 && botDefaults.includes(name)) return translations[currentLang].botDefault;
    if (!isPlayer1 && p2Defaults.includes(name)) return translations[currentLang].p2Default;
    return name;
};

const IMPOSSIBLE_SCORES = [163, 166, 169, 172, 173, 175, 176, 178, 179];

const getMinDartsToCheckout = (score, outMode) => {
    if (score === 0) return 0;
    if (score > 180) return Infinity;
    if (IMPOSSIBLE_SCORES.includes(score)) return Infinity;
    if (outMode === 'single') { 
        if (score <= 60) return 1; 
        if (score <= 120) return 2; 
        return 3; 
    }
    if (score > 170) return Infinity; 
    const doubleOutBogeys = [159, 162, 163, 165, 166, 168, 169];
    if (doubleOutBogeys.includes(score)) return Infinity;
    if (score === 50 || (score <= 40 && score % 2 === 0 && score > 0)) return 1;
    if (score <= 110) return 2; 
    return 3;
};

const calculateStats = (legs, p1Name, p2Name) => {
    let p1DartsTotal=0, p1ScoreTotal=0, p2DartsTotal=0, p2ScoreTotal=0;
    const p1High={'60+':0,'100+':0,'140+':0,'180':0}, p2High={'60+':0,'100+':0,'140+':0,'180':0};
    let p1HighCheck=0, p2HighCheck=0;
    const updateHigh = (s, obj) => { if(s===180) obj['180']++; else if(s>=140) obj['140+']++; else if(s>=100) obj['100+']++; else if(s>=60) obj['60+']++; };

    const legDetails = (legs||[]).map((leg, i) => {
        const p1M = leg.history.filter(m => m.player === 'p1');
        const p2M = leg.history.filter(m => m.player === 'p2');
        p1M.forEach(m => updateHigh(m.score, p1High)); 
        p2M.forEach(m => updateHigh(m.score, p2High));
        const lP1S = p1M.reduce((a,b)=>a+(b.score||0),0); 
        const lP2S = p2M.reduce((a,b)=>a+(b.score||0),0);
        const lP1D = p1M.reduce((a,b)=>a+(b.dartsUsed||3),0); 
        const lP2D = p2M.reduce((a,b)=>a+(b.dartsUsed||3),0);
        p1ScoreTotal+=lP1S; p1DartsTotal+=lP1D; 
        p2ScoreTotal+=lP2S; p2DartsTotal+=lP2D;
        const winnerKey = leg.winner;
        const winnerName = winnerKey === 'p1' ? p1Name : p2Name;
        const winThrow = leg.history.find(m => m.player === winnerKey && m.remaining === 0);
        const check = winThrow ? winThrow.score : 0;
        if(winnerKey==='p1') p1HighCheck = Math.max(p1HighCheck, check); else p2HighCheck = Math.max(p2HighCheck, check);
        const winnerDarts = winnerKey === 'p1' ? lP1D : lP2D;
        const winnerScore = winnerKey === 'p1' ? lP1S : lP2S;
        const winnerAvg = winnerDarts > 0 ? (winnerScore / winnerDarts) * 3 : 0;
        return { index: i+1, winner: winnerName, winnerKey: winnerKey, darts: winnerDarts, avg: winnerAvg, checkout: check };
    });
    return { p1Avg: p1DartsTotal ? (p1ScoreTotal/p1DartsTotal)*3 : 0, p2Avg: p2DartsTotal ? (p2ScoreTotal/p2DartsTotal)*3 : 0, legDetails, p1High, p2High, p1HighCheckout: p1HighCheck, p2HighCheckout: p2HighCheck };
};

const randNormal = (mean, stdDev) => {
    let u=0, v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random();
    return Math.round((Math.sqrt(-2.0*Math.log(u))*Math.cos(2.0*Math.PI*v))*stdDev+mean);
};

const getBinLabel = (timestamp, strategy, lang) => {
    const d = new Date(timestamp);
    if (strategy === 'match') return d.toLocaleTimeString(lang, {hour: '2-digit', minute:'2-digit'});
    if (strategy === 'day') return d.toLocaleDateString(lang, {day: 'numeric', month: 'numeric'});
    if (strategy === 'week') {
        const day = d.getDay() === 0 ? 7 : d.getDay();
        const start = new Date(d.getTime() - (day - 1) * 24 * 60 * 60 * 1000);
        return start.toLocaleDateString(lang, {day: 'numeric', month: 'numeric'});
    }
    if (strategy === 'month') return d.toLocaleDateString(lang, {month: 'short', year: '2-digit'});
    return '';
};

// --- KOMPONENTY ---
const FlagIcon = ({ lang }) => {
    if (lang === 'cs') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" className="w-5 h-3.5 rounded-sm object-cover"><rect width="900" height="600" fill="#D7141A"/><rect width="900" height="300" fill="#FFF"/><polygon points="0,0 0,600 450,300" fill="#11457E"/></svg>;
    if (lang === 'en') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" className="w-5 h-3.5 rounded-sm object-cover"><clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/><path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#C8102E" strokeWidth="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/></svg>;
    if (lang === 'pl') return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10" className="w-5 h-3.5 rounded-sm object-cover border border-slate-700/50"><rect width="16" height="10" fill="#fff"/><rect width="16" height="5" y="5" fill="#dc143c"/></svg>;
    return null;
};

const VirtualKeyboard = ({ onChar, onDelete, onClose, lang }) => {
    const t = (k) => translations[lang][k] || k;
    const [popup, setPopup] = useState(null);
    const timerRef = useRef(null);
    const pressedRef = useRef(false);
    const specialChars = { 'A':['Á','Ą','Ä'], 'C':['Č','Ć'], 'D':['Ď'], 'E':['É','Ě','Ę','Ë'], 'I':['Í'], 'L':['Ł','Ĺ'], 'N':['Ň','Ń'], 'O':['Ó','Ö'], 'R':['Ř'], 'S':['Š','Ś'], 'T':['Ť'], 'U':['Ú','Ů','Ü'], 'Y':['Ý'], 'Z':['Ž','Ź','Ż'] };
    
    const rows = [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['Q','W','E','R','T','Z','U','I','O','P'], 
        ['A','S','D','F','G','H','J','K','L'], 
        ['Y','X','C','V','B','N','M']
    ];
    if (lang === 'en' || lang === 'pl') { rows[1][5] = 'Y'; rows[3][0] = 'Z'; }

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Backspace') { e.preventDefault(); onDelete(); }
            else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                onChar(e.key.toUpperCase());
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onChar, onDelete, onClose]);

    const handleDown = (char) => {
        if (popup) return;
        pressedRef.current = true;
        if (specialChars[char]) {
            timerRef.current = setTimeout(() => {
                if (pressedRef.current) {
                    setPopup({ char, variants: specialChars[char] });
                    pressedRef.current = false; 
                }
            }, 400);
        }
    };

    const handleUp = (char) => {
        clearTimeout(timerRef.current);
        if (pressedRef.current) {
            onChar(char);
            pressedRef.current = false;
        }
    };

    const handleLeave = () => {
        clearTimeout(timerRef.current);
        pressedRef.current = false;
    };

    return (
        <>
            {popup && <div className="fixed inset-0 z-[600]" onClick={() => setPopup(null)} onTouchStart={() => setPopup(null)}></div>}
            <div className="fixed bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700 p-1.5 sm:p-2 pb-4 sm:pb-6 z-[600] shadow-2xl animate-in slide-in-from-bottom duration-200 select-none">
                <div className="bg-slate-800 p-2 flex justify-between items-center border-b border-slate-700 mb-2 rounded-t-lg max-w-lg mx-auto shadow-sm">
                    <span className="text-[10px] text-slate-500 font-bold uppercase ml-2 tracking-widest">{t('players')}</span>
                    <button onClick={onClose} className="px-5 py-1.5 bg-slate-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-black transition-colors shadow-sm">{t('kbdDone')}</button>
                </div>
                
                <div className="flex flex-col gap-1 max-w-lg mx-auto relative z-[610]">
                    {rows.map((row, i) => (
                        <div key={i} className="flex justify-center gap-1">
                            {row.map(char => (
                                <div key={char} className="relative flex-1 max-w-[40px]">
                                    {popup && popup.char === char && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex bg-slate-800 p-1 rounded-lg border border-slate-600 shadow-xl animate-in zoom-in duration-100">
                                            {popup.variants.map(v => (
                                                <button key={v} onClick={(e) => { e.stopPropagation(); onChar(v); setPopup(null); }} className="w-10 h-10 sm:h-12 text-white font-bold text-lg hover:bg-emerald-600 rounded">
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <button 
                                        onPointerDown={(e) => { e.preventDefault(); handleDown(char); }} 
                                        onPointerUp={(e) => { e.preventDefault(); handleUp(char); }} 
                                        onPointerLeave={handleLeave} 
                                        className={`w-full h-9 sm:h-12 bg-slate-800 text-white font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-slate-700 transition-all text-xs sm:text-base ${popup && popup.char === char ? 'bg-slate-700' : ''}`}
                                    >
                                        {char}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                    <div className="flex justify-center gap-1 mt-1">
                        <button onClick={() => onChar(' ')} className="flex-1 max-w-[280px] bg-slate-800 text-slate-400 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-slate-700 py-2 sm:py-3 text-xs uppercase tracking-widest">{t('kbdSpace')}</button>
                        <button onClick={onDelete} className="flex-1 max-w-[80px] bg-red-900/30 text-red-400 font-bold rounded shadow border-b-2 border-slate-950 active:translate-y-0.5 active:border-b-0 active:bg-red-900/50 flex items-center justify-center"><Delete className="w-5 h-5 sm:w-6 sm:h-6"/></button>
                    </div>
                </div>
            </div>
        </>
    );
};

const EditScoreModal = ({ initialScore, initialDarts, isFinish, scoreBefore, outMode, onSave, onCancel, lang }) => {
    const [score, setScore] = useState(initialScore.toString());
    const [darts, setDarts] = useState(initialDarts);
    const [isFirstEntry, setIsFirstEntry] = useState(true); 
    const t = (k) => translations[lang][k] || k;

    const handleNum = (n) => { if (isFirstEntry) { setScore(n); setIsFirstEntry(false); } else { if (score.length >= 3) return; setScore(score === '0' ? n : score + n); } };
    const handleDel = () => { setIsFirstEntry(false); setScore(score.length > 1 ? score.slice(0, -1) : '0'); };

    const currentScoreInt = parseInt(score) || 0;
    const isNewFinish = (scoreBefore - currentScoreInt) === 0;
    const minDartsNeeded = isNewFinish ? getMinDartsToCheckout(scoreBefore, outMode) : 1;
    
    const btnBase = "h-12 sm:h-14 landscape:h-8 bg-slate-800 text-xl font-bold rounded-xl active:bg-slate-700 border border-slate-700/50 select-none touch-manipulation flex items-center justify-center";

    useEffect(() => {
        const handleKeyDown = (e) => {
            const key = e.key;
            if (/^[0-9]$/.test(key)) { e.preventDefault(); handleNum(key); }
            else if (key === 'Backspace') { e.preventDefault(); handleDel(); }
            else if (key === 'Enter') { e.preventDefault(); onSave(currentScoreInt, isNewFinish ? (darts < minDartsNeeded ? minDartsNeeded : darts) : 3); }
            else if (key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [score, isFirstEntry, darts, minDartsNeeded, currentScoreInt, isNewFinish]);

    return (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center p-2 sm:p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-3 landscape:p-1.5 sm:p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0">
                    <div className="flex flex-col">
                        <h3 className="font-bold text-slate-300 uppercase tracking-widest text-xs landscape:text-[10px]">{t('editThrow')}</h3>
                        <span className="text-[10px] landscape:text-[8px] text-slate-500 italic">{t('originalScore')} {initialScore}</span>
                    </div>
                    <button onClick={onCancel} className="p-1 text-slate-500 hover:text-white"><X className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                </div>
                <div className="p-4 landscape:p-2 sm:p-6 flex flex-col items-center gap-2 landscape:gap-1 sm:gap-4 overflow-y-auto">
                    <div className={`text-5xl landscape:text-3xl sm:text-6xl font-black font-mono px-6 py-2 landscape:py-1 sm:py-4 rounded-xl border shadow-inner transition-colors ${isFirstEntry ? 'text-slate-500 bg-slate-900 border-slate-800' : 'text-emerald-500 bg-slate-950 border-emerald-500/30'}`}>{score}</div>
                    
                    {isNewFinish && (
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] landscape:text-[8px] font-bold text-slate-500 uppercase tracking-widest">{t('howManyDarts')}</span>
                            <div className="flex gap-2">
                                {[1, 2, 3].map(d => <button key={d} disabled={d < minDartsNeeded} onClick={() => setDarts(d)} className={`w-10 h-10 landscape:w-8 landscape:h-8 rounded-lg font-bold border transition-all ${d < minDartsNeeded ? 'opacity-10 cursor-not-allowed bg-slate-900' : (darts === d ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400')}`}>{d}</button>)}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5 landscape:gap-1 sm:gap-2 w-full mt-1 sm:mt-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (<button key={n} onClick={() => handleNum(n.toString())} className={btnBase}>{n}</button>))}
                        <button onClick={handleDel} className={`${btnBase} text-red-400 active:bg-red-900/20`}><Delete className="w-5 h-5 sm:w-6 sm:h-6"/></button>
                        <button onClick={() => handleNum('0')} className={btnBase}>0</button>
                        <button onClick={() => onSave(currentScoreInt, isNewFinish ? (darts < minDartsNeeded ? minDartsNeeded : darts) : 3)} className={`${btnBase} bg-emerald-600 text-white border-emerald-500 active:scale-95 shadow-lg shadow-emerald-900/20`}><CheckCircle className="w-6 h-6 sm:w-8 sm:h-8"/></button>
                    </div>
                    <button onClick={onCancel} className="w-full py-1.5 sm:py-2 text-slate-500 text-xs landscape:text-[10px] font-bold uppercase tracking-widest hover:text-slate-300 transition-colors mt-1">{t('cancel')}</button>
                </div>
            </div>
        </div>
    );
};

const FinishDartsSelector = ({ points, minDarts, onConfirm, onCancel, lang, player }) => {
    const t = (k) => translations[lang][k] || k;
    const isP1 = player === 'p1';
    const borderColor = isP1 ? 'border-emerald-500' : 'border-purple-500';
    const textColor = isP1 ? 'text-emerald-500' : 'text-purple-500';
    const btnActiveColor = isP1 ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40 border-emerald-800' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/40 border-purple-800';

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex flex-col items-center justify-center p-4">
            <div className={`bg-slate-900 border-2 ${borderColor} w-full max-w-xs rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-6 animate-in zoom-in duration-200`}>
                <div className="text-center"><h3 className={`${textColor} font-black text-2xl uppercase tracking-tighter italic`}>{t('closed')}!</h3><p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">{t('howManyDarts')}</p></div>
                <div className="text-5xl font-mono font-black text-white bg-slate-950 px-6 py-3 rounded-lg border border-slate-800">{points}</div>
                <div className="grid grid-cols-3 gap-3 w-full">{[1, 2, 3].map(d => <button key={d} disabled={d < minDarts} onClick={() => onConfirm(d)} className={`h-20 text-white rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 shadow-lg border-b-4 transition-all ${d < minDarts ? 'bg-slate-800 opacity-20 cursor-not-allowed' : btnActiveColor}`}><span className="text-3xl font-black">{d}</span><span className="text-[10px] uppercase font-bold">{t('confirmDarts')}</span></button>)}</div>
                <button onClick={onCancel} className="text-slate-500 text-xs font-bold uppercase hover:text-slate-300 transition-colors">{t('cancel')}</button>
            </div>
        </div>
    );
};

const SyncModal = ({ matches, onAccept, onDecline, lang }) => {
    const t = (k) => translations[lang][k] || k;
    const count = matches.length;
    return (
        <div className="fixed inset-0 bg-slate-950/90 z-[600] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center animate-in zoom-in duration-300 delay-100">
                <DownloadCloud className="w-16 h-16 text-emerald-500 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                <h3 className="text-white font-black mb-3 text-xl tracking-wider uppercase">{t('syncTitle')}</h3>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">{t('syncDesc').replace('%d', count)}</p>
                <div className="space-y-3">
                    <button onClick={onAccept} className="w-full bg-emerald-600 hover:bg-emerald-500 py-3.5 rounded-xl font-bold text-white shadow-lg shadow-emerald-900/40 transition-all active:scale-95">{t('syncYes')}</button>
                    <button onClick={onDecline} className="w-full text-slate-500 hover:bg-slate-800 rounded-xl text-xs uppercase font-bold py-3 transition-colors">{t('syncNo')}</button>
                </div>
            </div>
        </div>
    );
};

const MatchStatsView = ({ data, onClose, title, lang, onStartMatch }) => {
    const t = (k) => translations[lang][k] || k;
    const displayP1Name = getTranslatedName(data.p1Name, true, lang);
    const displayP2Name = getTranslatedName(data.p2Name, false, lang);
    const stats = calculateStats(data.completedLegs, displayP1Name, displayP2Name);
    const isP1 = data.matchWinner === 'p1';
    const winColorText = isP1 ? 'text-emerald-500' : 'text-purple-500';
    const winColorBg = isP1 ? 'from-emerald-500/20 to-emerald-600/10' : 'from-purple-500/20 to-purple-600/10';
    const winBorder = isP1 ? 'border-emerald-500/50' : 'border-purple-500/50';
    const winIconColor = isP1 ? 'text-emerald-500' : 'text-purple-500';

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 fixed inset-0 z-[1000] overflow-hidden">
            <div className="shrink-0 relative flex items-center justify-center px-4 pb-4 pt-14 sm:p-4 bg-slate-950 z-20 border-b border-slate-900/50 w-full">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 mt-5 sm:mt-0 flex gap-2 z-50">
                    <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white border border-slate-700 transition-colors shadow-lg"><ArrowLeft className="w-5 h-5" /></button>
                    {title === t('matchWinner') && (<button onClick={onStartMatch} className="p-2 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-500 rounded-lg border border-emerald-500/20 transition-colors shadow-lg"><RotateCcw className="w-5 h-5" /></button>)}
                </div>
                <div className="text-center w-full">
                    <h2 className={`text-xl sm:text-2xl font-bold uppercase tracking-widest leading-none ${winColorText}`}>{title}</h2>
                    <div className="text-xs sm:text-sm text-slate-500">{data.date}</div>
                </div>
            </div>
            
            <div className="flex-1 w-full bg-slate-950 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-800">
                <div className="p-4 space-y-6 w-full max-w-4xl mx-auto">
                    <div className="flex justify-center">
                        <div className={`bg-gradient-to-br ${winColorBg} border ${winBorder} rounded-xl px-6 py-3 flex items-center gap-3 shadow-lg animate-pulse`}>
                            <Trophy className={`w-8 h-8 ${winIconColor}`} />
                            <div className="text-center">
                                <div className={`text-[10px] uppercase font-bold tracking-widest ${isP1 ? 'text-emerald-300' : 'text-purple-300'}`}>{t('matchWinner')}</div>
                                <div className="text-2xl font-black text-white">{data.matchWinner === 'p1' ? displayP1Name : displayP2Name}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center items-center gap-6">
                        <div className="text-center">
                            <div className="text-xs text-slate-400 font-bold mb-1">{displayP1Name}</div>
                            <div className={`text-5xl font-black ${data.matchWinner === 'p1' ? 'text-emerald-500' : 'text-slate-600'}`}>{data.p1Legs}</div>
                        </div>
                        <div className="text-xl font-bold text-slate-700">vs</div>
                        <div className="text-center">
                            <div className="text-xs text-slate-400 font-bold mb-1">{displayP2Name}</div>
                            <div className={`text-5xl font-black ${data.matchWinner === 'p2' ? 'text-purple-500' : 'text-slate-600'}`}>{data.p2Legs}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                            <div className="text-center text-xs font-bold text-slate-500 mb-2">{t('avg3')}</div>
                            <div className="flex justify-between font-mono font-bold text-lg"><span className="text-emerald-400">{stats.p1Avg.toFixed(1)}</span><span className="text-purple-400">{stats.p2Avg.toFixed(1)}</span></div>
                        </div>
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                            <div className="text-center text-xs font-bold text-slate-500 mb-2">{t('highestCheckout')}</div>
                            <div className="flex justify-between font-mono font-bold text-lg"><span className="text-emerald-400">{stats.p1HighCheckout}</span><span className="text-purple-400">{stats.p2HighCheckout}</span></div>
                        </div>
                    </div>
                    
                    <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden w-full">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] uppercase bg-slate-800 text-slate-400">
                                <tr>
                                    <th className="px-3 py-2">#</th>
                                    <th className="px-3 py-2">{t('detailWinner')}</th>
                                    <th className="px-3 py-2 text-center">{t('detailDarts')}</th>
                                    <th className="px-3 py-2 text-right">{t('detailCheckout')}</th>
                                    <th className="px-3 py-2 text-right">{t('detailAvg')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {stats.legDetails.map(l => {
                                    const rowColor = l.winnerKey === 'p1' ? 'text-emerald-400' : 'text-purple-400';
                                    return (
                                        <tr key={l.index}>
                                            <td className="px-3 py-2 font-bold text-slate-500">{l.index}</td>
                                            <td className={`px-3 py-2 font-bold ${rowColor}`}>{l.winner}</td>
                                            <td className={`px-3 py-2 text-center font-mono ${rowColor}`}>{l.darts}</td>
                                            <td className={`px-3 py-2 text-right font-mono ${rowColor}`}>{l.checkout || '-'}</td>
                                            <td className={`px-3 py-2 text-right font-mono ${rowColor}`}>{l.avg.toFixed(1)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- KOMPONENTA OSOBNÍCH STATISTIK ---
const UserProfile = ({ user, matches, onLogout, onDeleteAccount, lang }) => {
    const t = (k) => translations[lang][k] || k;
    const [timeRange, setTimeRange] = useState('today');
    const [tab, setTab] = useState('data');

    const isOffline = !user || user.isAnonymous;

    // ČASOVÁ OBDOBÍ PRO AKTUÁLNÍ A PŘEDCHOZÍ BLOK
    const nowTs = Date.now();
    const todayStartTs = new Date(new Date().setHours(0,0,0,0)).getTime();
    
    let currentStart, prevStart, binStrategy;
    if (timeRange === 'today') {
        currentStart = todayStartTs;
        prevStart = todayStartTs - 24 * 60 * 60 * 1000;
        binStrategy = 'match';
    } else if (timeRange === 7) {
        currentStart = nowTs - 7 * 24 * 60 * 60 * 1000;
        prevStart = currentStart - 7 * 24 * 60 * 60 * 1000;
        binStrategy = 'day';
    } else if (timeRange === 30) {
        currentStart = nowTs - 30 * 24 * 60 * 60 * 1000;
        prevStart = currentStart - 30 * 24 * 60 * 60 * 1000;
        binStrategy = 'day';
    } else if (timeRange === 90) {
        currentStart = nowTs - 90 * 24 * 60 * 60 * 1000;
        prevStart = currentStart - 90 * 24 * 60 * 60 * 1000;
        binStrategy = 'week';
    } else { // all
        currentStart = 0;
        prevStart = 0;
        binStrategy = 'month';
    }

    // Pokud je uživatel offline, bereme všechny lokální zápasy. 
    // Pokud je online, bereme jen ty s jeho uid.
    const myMatches = isOffline 
        ? matches 
        : matches.filter(m => m.p1Id === user.uid || m.p2Id === user.uid);
        
    const currentMatches = myMatches.filter(m => m.id >= currentStart);
    const prevMatches = timeRange !== 'all' ? myMatches.filter(m => m.id >= prevStart && m.id < currentStart) : [];

    // DATA AKTUÁLNÍHO OBDOBÍ
    let totalWins = 0, total180s = 0, total140s = 0, total100s = 0, checkouts100plus = 0, highestCheckout = 0;
    let totalLegsPlayed = 0, totalLegsWon = 0;
    
    let curSumScore = 0, curSumDarts = 0;
    let curSumF9Score = 0, curSumF9Darts = 0;
    let curSumChkRounds = 0, curChkCount = 0;
    let sumCheckouts = 0;

    const roundsDist = {}; 
    const binsMap = {};

    [...currentMatches].reverse().forEach(m => {
        // Z offline pohledu hrajeme vždy za p1. Z online podle p1Id.
        const isP1 = isOffline ? true : (m.p1Id === user?.uid);
        const myKey = isP1 ? 'p1' : 'p2';
        if (m.matchWinner === myKey) totalWins++;

        const binLabel = getBinLabel(m.id, binStrategy, lang);
        if (!binsMap[binLabel]) binsMap[binLabel] = { score: 0, darts: 0, label: binLabel, ts: m.id };

        m.completedLegs.forEach(leg => {
            totalLegsPlayed++;
            if (leg.winner === myKey) totalLegsWon++;

            const myThrows = leg.history.filter(h => h.player === myKey);
            
            myThrows.forEach(th => {
                if (th.score >= 180) total180s++;
                else if (th.score >= 140) total140s++;
                else if (th.score >= 100) total100s++;
            });

            const lScore = myThrows.reduce((a,b)=>a+(b.score||0),0);
            const lDarts = myThrows.reduce((a,b)=>a+(b.dartsUsed||3),0);
            curSumScore += lScore; curSumDarts += lDarts;
            
            binsMap[binLabel].score += lScore; 
            binsMap[binLabel].darts += lDarts;

            const f9Throws = myThrows.slice(0, 3);
            curSumF9Score += f9Throws.reduce((a, b) => a + b.score, 0);
            curSumF9Darts += f9Throws.reduce((a, b) => a + (b.dartsUsed || 3), 0);

            if (leg.winner === myKey) {
                const winThrow = myThrows.find(th => th.remaining === 0 && !th.isBust);
                if (winThrow) {
                    sumCheckouts += winThrow.score;
                    if (winThrow.score > highestCheckout) highestCheckout = winThrow.score;
                    if (winThrow.score >= 100) checkouts100plus++;
                }
                const chkRounds = Math.ceil(lDarts / 3);
                curSumChkRounds += chkRounds;
                curChkCount++;
                roundsDist[chkRounds] = (roundsDist[chkRounds] || 0) + 1;
            }
        });
    });

    // DATA PŘEDCHOZÍHO OBDOBÍ
    let prevSumScore = 0, prevSumDarts = 0, prevSumF9Score = 0, prevSumF9Darts = 0, prevSumChkRounds = 0, prevChkCount = 0;
    prevMatches.forEach(m => {
        const isP1 = isOffline ? true : (m.p1Id === user?.uid);
        const myKey = isP1 ? 'p1' : 'p2';
        m.completedLegs.forEach(leg => {
            const myThrows = leg.history.filter(h => h.player === myKey);
            prevSumScore += myThrows.reduce((a,b)=>a+(b.score||0),0);
            prevSumDarts += myThrows.reduce((a,b)=>a+(b.dartsUsed||3),0);
            
            const f9 = myThrows.slice(0, 3);
            prevSumF9Score += f9.reduce((a,b)=>a+b.score,0);
            prevSumF9Darts += f9.reduce((a,b)=>a+(b.dartsUsed||3),0);

            if (leg.winner === myKey) {
                const lDarts = myThrows.reduce((a,b)=>a+(b.dartsUsed||3),0);
                prevSumChkRounds += Math.ceil(lDarts / 3);
                prevChkCount++;
            }
        });
    });

    // PRŮMĚRY AKTUÁLNÍHO OBDOBÍ
    const overallAvgRaw = curSumDarts > 0 ? (curSumScore / curSumDarts) * 3 : 0;
    const overallAvg = overallAvgRaw > 0 ? overallAvgRaw.toFixed(1) : '0.0';

    const overallFirst9Raw = curSumF9Darts > 0 ? (curSumF9Score / curSumF9Darts) * 3 : 0;
    const overallFirst9 = overallFirst9Raw > 0 ? overallFirst9Raw.toFixed(1) : '0.0';

    const overallChkRaw = curChkCount > 0 ? (curSumChkRounds / curChkCount) : 0;

    const winRate = currentMatches.length > 0 ? Math.round((totalWins / currentMatches.length) * 100) : 0;
    const legWinRate = totalLegsPlayed > 0 ? Math.round((totalLegsWon / totalLegsPlayed) * 100) : 0;
    const avgCheckout = curChkCount > 0 ? Math.round(sumCheckouts / curChkCount) : 0;

    // PRŮMĚRY PŘEDCHOZÍHO OBDOBÍ
    const prevAvg = prevSumDarts > 0 ? (prevSumScore / prevSumDarts) * 3 : null;
    const prevF9Avg = prevSumF9Darts > 0 ? (prevSumF9Score / prevSumF9Darts) * 3 : null;
    const prevChk = prevChkCount > 0 ? (prevSumChkRounds / prevChkCount) : null;

    // VÝPOČET TRENDŮ
    const getTrend = (current, prev, isInverse = false) => {
        if (prev === null || current === 0) return null;
        const diff = current - prev;
        if (Math.abs(diff) < 0.1) return { val: '0.0', color: 'text-slate-500', Icon: Minus };
        
        let isGood = diff > 0;
        if (isInverse) isGood = diff < 0; 

        return {
            val: (diff > 0 ? '+' : '') + diff.toFixed(1),
            color: isGood ? 'text-emerald-500' : 'text-red-500',
            Icon: diff > 0 ? TrendingUp : TrendingDown
        };
    };

    const trendAvgObj = timeRange !== 'all' ? getTrend(overallAvgRaw, prevAvg) : null;
    const trendF9Obj = timeRange !== 'all' ? getTrend(overallFirst9Raw, prevF9Avg) : null;
    const trendChkObj = timeRange !== 'all' ? getTrend(overallChkRaw, prevChk, true) : null;

    // PŘÍPRAVA DAT GRAFU
    let maxRoundCount = 0;
    Object.values(roundsDist).forEach(val => { if (val > maxRoundCount) maxRoundCount = val; });

    const chartData = Object.values(binsMap).sort((a,b)=>a.ts-b.ts).map(b => ({
        date: b.label,
        avg: b.darts > 0 ? (b.score / b.darts) * 3 : 0
    })).filter(d => d.avg > 0);

    const chartHeight = 160;
    const pointWidth = 60; 
    const minRaw = chartData.length > 0 ? Math.min(...chartData.map(d => d.avg)) : 0;
    const maxRaw = chartData.length > 0 ? Math.max(...chartData.map(d => d.avg)) : 100;
    const minAvg = Math.max(0, Math.floor((minRaw - 5) / 10) * 10);
    const maxAvg = Math.ceil((maxRaw + 5) / 10) * 10;
    const svgWidth = Math.max(300, chartData.length * pointWidth + 30); 
    const gridLines = [];
    for (let v = minAvg; v <= maxAvg; v += 10) gridLines.push(v);

    return (
        <main className="flex-1 overflow-y-auto w-full bg-slate-950 relative z-10">
            <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 pb-24 flex flex-col gap-4">
                <div className={`bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 shadow-md flex items-center justify-between ${isOffline ? 'opacity-80' : ''}`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`${isOffline ? 'bg-slate-800' : 'bg-emerald-900/30'} p-2 rounded-full shrink-0`}>
                            {isOffline ? <WifiOff className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" /> : <User className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-sm sm:text-base font-black text-white tracking-widest uppercase truncate">
                                {isOffline ? t('statsUserFallback') : (user?.displayName ? user.displayName.split(' ')[0] : t('statsUserFallback'))}
                            </h2>
                            <span className="text-[9px] sm:text-[10px] text-slate-500 truncate">{isOffline ? t('offlineMode') : user?.email}</span>
                        </div>
                    </div>
                    {!isOffline && (
                        <button onClick={onLogout} className="bg-red-900/20 hover:bg-red-900/40 text-red-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border border-red-500/30 transition-colors shrink-0 ml-2">
                            {t('logout')}
                        </button>
                    )}
                </div>

                <div className="flex bg-slate-900 rounded-lg border border-slate-800 p-1">
                    {[{v:'today', l:t('statsToday')}, {v:7, l:t('stats7Days')}, {v:30, l:t('stats30Days')}, {v:90, l:t('stats90Days')}, {v:'all', l:t('statsAllTime')}].map(f => (
                        <button key={f.v} onClick={() => setTimeRange(f.v)} className={`flex-1 py-2 text-[9px] sm:text-[11px] font-bold rounded-md uppercase tracking-wider transition-colors ${timeRange === f.v ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                            {f.l}
                        </button>
                    ))}
                </div>

                <div className="flex gap-2 w-full">
                    <button onClick={() => setTab('data')} className={`flex-1 py-2 rounded-lg font-black uppercase text-xs sm:text-sm transition-all border flex justify-center items-center gap-2 ${tab === 'data' ? 'bg-slate-100 text-slate-900 border-white shadow-md' : 'bg-slate-900 text-slate-500 border-slate-800 hover:bg-slate-800'}`}>
                        <List className="w-4 h-4" /> {t('statsData')}
                    </button>
                    <button onClick={() => setTab('charts')} className={`flex-1 py-2 rounded-lg font-black uppercase text-xs sm:text-sm transition-all border flex justify-center items-center gap-2 ${tab === 'charts' ? 'bg-slate-100 text-slate-900 border-white shadow-md' : 'bg-slate-900 text-slate-500 border-slate-800 hover:bg-slate-800'}`}>
                        <BarChart2 className="w-4 h-4" /> {t('statsCharts')}
                    </button>
                </div>

                {tab === 'data' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                            <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('avg3')}</span>
                                <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">{overallAvg}</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsFirst9')}</span>
                                <span className="text-2xl sm:text-3xl font-black text-indigo-400 font-mono">{overallFirst9}</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                <span className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('winRate')} ({t('statsMatchLeg')})</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl sm:text-3xl font-black text-blue-400 font-mono">{winRate}%</span>
                                    <span className="text-sm font-bold text-slate-600">|</span>
                                    <span className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">{legWinRate}%</span>
                                </div>
                                <span className="text-[8px] sm:text-[9px] text-slate-500 mt-1">{currentMatches.length} {t('matchesPlayed')} / {totalLegsPlayed} {t('legs').toLowerCase()}</span>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{t('statsAvgCheckout')}</span>
                                <span className="text-2xl sm:text-3xl font-black text-orange-400 font-mono">{avgCheckout}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 landscape:grid-cols-6 gap-2 sm:gap-3">
                            <div className="bg-slate-900 border border-slate-800 p-2 sm:p-3 rounded-xl flex flex-col items-center justify-center text-center"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats100p')}</span><span className="text-xl font-black text-white font-mono">{total100s}</span></div>
                            <div className="bg-slate-900 border border-slate-800 p-2 sm:p-3 rounded-xl flex flex-col items-center justify-center text-center"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('stats140p')}</span><span className="text-xl font-black text-white font-mono">{total140s}</span></div>
                            <div className="bg-slate-900 border border-slate-800 p-2 sm:p-3 rounded-xl flex flex-col items-center justify-center text-center"><span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('total180s')}</span><span className="text-xl font-black text-red-400 font-mono">{total180s}</span></div>
                            <div className="bg-slate-900 border border-slate-800 p-2 sm:p-3 rounded-xl flex flex-col items-center justify-center text-center col-span-3 landscape:col-span-3">
                                <span className="text-[9px] text-slate-500 font-bold uppercase mb-1">{t('highestCheckout')}</span>
                                <div className="flex items-center gap-3"><span className="text-2xl font-black text-yellow-400 font-mono">{highestCheckout}</span><span className="text-[9px] text-slate-500 border-l border-slate-700 pl-3">{checkouts100plus}x {t('checkout100')}</span></div>
                            </div>
                        </div>

                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4">{t('statsRoundDist')}</span>
                            <div className="flex flex-col gap-2">
                                {Object.keys(roundsDist).length > 0 ? Object.entries(roundsDist).sort((a,b) => Number(a[0]) - Number(b[0])).map(([round, count]) => {
                                    const percentage = (count / curChkCount) * 100;
                                    const widthPct = (count / maxRoundCount) * 100;
                                    return (
                                        <div key={round} className="flex items-center gap-3">
                                            <div className="w-12 text-right text-xs font-bold text-slate-400 shrink-0">{round}. {t('statsRound')}</div>
                                            <div className="flex-1 h-5 bg-slate-800 rounded-full overflow-hidden relative">
                                                <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${widthPct}%` }}></div>
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white shadow-black drop-shadow-md">{percentage.toFixed(1)}% ({count}x)</span>
                                            </div>
                                        </div>
                                    );
                                }) : <div className="text-center text-slate-600 text-xs py-4">Nemáte zatím žádné vyhrané legy v tomto období.</div>}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'charts' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4">{t('avgTrend')}</span>
                            {chartData.length > 1 ? (
                                <div className="w-full overflow-x-auto no-scrollbar border-b border-l border-slate-800 pb-2 pl-2">
                                    <div style={{ width: `${svgWidth}px`, height: `${chartHeight}px` }} className="relative mt-2">
                                        <svg width="100%" height="100%" className="overflow-visible">
                                            <defs>
                                                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.5"/>
                                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0"/>
                                                </linearGradient>
                                                <pattern id="diagonalHatch" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                                                    <line x1="0" y1="0" x2="0" y2="6" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.3" />
                                                </pattern>
                                            </defs>
                                            {gridLines.map(val => {
                                                const y = chartHeight - ((val - minAvg) / (maxAvg - minAvg)) * chartHeight;
                                                return (
                                                    <g key={`grid-${val}`}>
                                                        <line x1="15" y1={y} x2="100%" y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                                                        <text x="0" y={y + 3} fill="#64748b" fontSize="9" fontWeight="bold" className="font-mono">{val}</text>
                                                    </g>
                                                );
                                            })}
                                            <polygon 
                                                points={`15,${chartHeight} ${chartData.map((d, i) => `${(i * pointWidth) + 15},${chartHeight - ((d.avg - minAvg) / (maxAvg - minAvg)) * chartHeight}`).join(' ')} ${(chartData.length - 1) * pointWidth + 15},${chartHeight}`}
                                                fill="url(#chartFill)" 
                                            />
                                            <polygon 
                                                points={`15,${chartHeight} ${chartData.map((d, i) => `${(i * pointWidth) + 15},${chartHeight - ((d.avg - minAvg) / (maxAvg - minAvg)) * chartHeight}`).join(' ')} ${(chartData.length - 1) * pointWidth + 15},${chartHeight}`}
                                                fill="url(#diagonalHatch)" 
                                            />
                                            <polyline
                                                fill="none"
                                                stroke="#10b981"
                                                strokeWidth="3"
                                                points={chartData.map((d, i) => `${(i * pointWidth) + 15},${chartHeight - ((d.avg - minAvg) / (maxAvg - minAvg)) * chartHeight}`).join(' ')}
                                            />
                                            {chartData.map((d, i) => {
                                                const x = (i * pointWidth) + 15;
                                                const y = chartHeight - ((d.avg - minAvg) / (maxAvg - minAvg)) * chartHeight;
                                                return (
                                                    <g key={`point-${i}`}>
                                                        <circle cx={x} cy={y} r="4" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
                                                        <text x={x} y={y - 12} fill="#94a3b8" fontSize="10" textAnchor="middle" fontWeight="bold" className="font-mono">{d.avg.toFixed(1)}</text>
                                                        <text x={x} y={chartHeight + 15} fill="#64748b" fontSize="8" textAnchor="middle">{d.date}</text>
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center text-slate-600 text-xs py-10">Málo dat pro vykreslení grafu. Odehrajte více zápasů v tomto období.</div>
                            )}
                        </div>

                        {/* TRENDY SROVNÁVAJÍCÍ OBDOBÍ */}
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { title: t('trendAvg'), current: overallAvg, trend: trendAvgObj },
                                { title: t('trendFirst9'), current: overallFirst9, trend: trendF9Obj },
                                { title: t('trendCheckoutRounds'), current: overallChkRaw ? overallChkRaw.toFixed(1) : '-', trend: trendChkObj }
                            ].map((item, i) => (
                                <div key={i} className="bg-slate-800/40 border border-slate-700/50 p-2 sm:p-3 rounded-xl flex flex-col items-center justify-center text-center shadow-inner">
                                    <span className="text-[8px] sm:text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1 leading-tight h-6 flex items-center">{item.title}</span>
                                    <span className="text-xl sm:text-2xl font-black text-white font-mono leading-none my-1">{item.current}</span>
                                    {item.trend ? (
                                        <div className={`text-[10px] sm:text-xs font-bold font-mono mt-1 ${item.trend.color} flex items-center justify-center gap-0.5 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50`}>
                                            <item.trend.Icon className="w-3 h-3 stroke-[3]" /> {item.trend.val}
                                        </div>
                                    ) : (
                                        <div className="text-[8px] sm:text-[9px] font-bold text-slate-600 mt-1 uppercase tracking-widest bg-slate-900/50 px-2 py-1 rounded border border-slate-800">
                                            {timeRange === 'all' ? '-' : t('noTrendData')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                <button onClick={onDeleteAccount} className="w-full bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 text-red-400 py-3 rounded-xl font-bold uppercase tracking-widest text-sm transition-all shadow-md mt-4 active:scale-95">
                    {t('deleteAccount')}
                </button>
            </div>
        </main>
    );
};

// --- HLAVNÍ APLIKACE ---
export default function App() {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white p-6 text-center">
              <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Application Error</h2>
              <p className="text-slate-400 mb-6">Something went wrong while loading the application.</p>
              <button onClick={() => window.location.reload()} className="px-6 py-3 bg-slate-800 rounded-lg font-bold hover:bg-slate-700">Reload App</button>
          </div>
      );
  }
  try {
      return <AppContent onError={() => setHasError(true)} />;
  } catch (e) {
      setHasError(true);
      return null;
  }
}

function AppContent({ onError }) {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [deviceId] = useState(() => { 
      let id = safeStorage.getItem('sdc_device_id'); 
      if (!id) { id = crypto.randomUUID(); safeStorage.setItem('sdc_device_id', id); } 
      return id; 
  });
  const [offlineMode, setOfflineMode] = useState(false);

  const [activeKeyboardInput, setActiveKeyboardInput] = useState(null);
  const [inputPristine, setInputPristine] = useState(true);
  
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isReady, setIsReady] = useState(false); 
  const [splashState, setSplashState] = useState('visible');
  
  const [isLandscape, setIsLandscape] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isPC, setIsPC] = useState(false);
  
  const [appState, setAppState] = useState('home');
  const [lang, setLang] = useState('cs'); 
  
  const t = (k) => translations[lang][k] || k;

  const [showBotLevels, setShowBotLevels] = useState(false);
  const [selectedMatchDetail, setSelectedMatchDetail] = useState(null); 

  const [isListening, setIsListening] = useState(false); 
  const [isMicActive, setIsMicActive] = useState(false); 

  const [syncPromptMatches, setSyncPromptMatches] = useState([]);

  const [settings, setSettings] = useState({
    startScore: 501, outMode: 'double',
    p1Name: translations[lang].p1Default, p1Id: null,
    p2Name: translations[lang].p2Default, p2Id: null,
    quickButtons: [41, 45, 60, 100, 140, 180],
    matchMode: 'first_to', matchTarget: 3,
    isBot: false, botLevel: 'amateur', botAvg: 50,
    startPlayer: 'p1'
  });

  const [gameState, setGameState] = useState({
    p1Score: 501, p2Score: 501, p1Legs: 0, p2Legs: 0,
    currentPlayer: 'p1', startingPlayer: 'p1',
    winner: null, matchWinner: null, history: [], completedLegs: [] 
  });

  const [matchHistory, setMatchHistory] = useState(() => { try { const saved = safeStorage.getItem('dartsMatchHistory'); return saved ? JSON.parse(saved) : []; } catch(e){ return []; } });
  const [currentInput, setCurrentInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [editingMove, setEditingMove] = useState(null); 
  const [finishData, setFinishData] = useState(null);

  const [longPressIdx, setLongPressIdx] = useState(null);
  const longPressTimer = useRef(null);
  const historyRef = useRef(null);

  const recognitionRef = useRef(null);
  const gameStateRef = useRef(gameState);
  const isMicActiveRef = useRef(isMicActive);
  const settingsRef = useRef(settings);
  const appStateRef = useRef(appState); 
  const currentInputRef = useRef(currentInput);
  const finishDataRef = useRef(finishData);
  const processTurnRef = useRef(null);
  const handleTurnCommitRef = useRef(null);

  // --- OBOUSMĚRNÁ SYNCHRONIZACE S CLOUDEM ---
  useEffect(() => {
    if (!user || user.isAnonymous || !db) return;
    const matchesRef = collection(db, 'artifacts', appId, 'public', 'data', 'matches');
    const q = query(matchesRef, where('p1Id', '==', user.uid));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const cloudMatches = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        setMatchHistory(prevLocal => {
            const merged = [...prevLocal];
            let changed = false;
            cloudMatches.forEach(cloudMatch => {
                const existingIdx = merged.findIndex(m => m.id === cloudMatch.id);
                if (existingIdx >= 0) {
                    if (!merged[existingIdx].docId) {
                        merged[existingIdx] = { ...merged[existingIdx], ...cloudMatch };
                        changed = true;
                    }
                } else {
                    merged.push(cloudMatch);
                    changed = true;
                }
            });
            if (changed) {
                return merged.sort((a, b) => b.id - a.id);
            }
            return prevLocal;
        });
    }, (error) => {
        console.error("Cloud sync error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- SPLASH SCREEN LOGIKA ---
  useEffect(() => {
      if (isReady) {
          const t1 = setTimeout(() => {
              setSplashState('zooming');
              const t2 = setTimeout(() => {
                  setSplashState('hidden');
              }, 600);
          }, 600);
          return () => clearTimeout(t1);
      }
  }, [isReady]);

  // --- MIKROFON: PLNÁ IMPLEMENTACE SPEECH RECOGNITION ---
  useEffect(() => {
      let recognition = recognitionRef.current;
      
      if (isMicActive) {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!SpeechRecognition) {
              setIsMicActive(false);
              setErrorMsg(String(translations[lang].micError));
              setTimeout(() => setErrorMsg(''), 2000);
              return;
          }
          
          recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = lang === 'en' ? 'en-US' : (lang === 'pl' ? 'pl-PL' : 'cs-CZ');
          recognition.onstart = () => setIsListening(true);
          
          recognition.onend = () => {
              setIsListening(false);
              if (isMicActiveRef.current) {
                  try { recognition.start(); } catch(e) {}
              }
          };

          recognition.onresult = (event) => {
              const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
              handleVoiceCommand(transcript);
          };

          recognition.onerror = (event) => {
              if (event.error === 'not-allowed') {
                  setIsMicActive(false);
                  setErrorMsg('Přístup k mikrofonu byl odepřen.');
                  setTimeout(() => setErrorMsg(''), 2500);
              }
          };

          try { recognition.start(); } catch(e) {}
          recognitionRef.current = recognition;
      } else {
          if (recognition) {
              recognition.onend = null; 
              recognition.stop();
              setIsListening(false);
          }
      }

      return () => {
          if (recognition) {
              recognition.onend = null;
              recognition.stop();
          }
      };
  }, [isMicActive, lang]);

  const handleVoiceCommand = (transcript) => {
      const st = appStateRef.current;
      const tMap = translations[lang];

      if (finishDataRef.current) {
          const numbers = transcript.match(/\d+/g);
          if (numbers) {
              const num = parseInt(numbers.join(''));
              if (num >= finishDataRef.current.minD && num <= 3) {
                  processTurnRef.current(finishDataRef.current.points, num);
                  setFinishData(null);
              } else {
                  setErrorMsg(`Nemožné zavřít ${finishDataRef.current.points} na ${num} šipek`);
                  setTimeout(() => setErrorMsg(''), 2000);
              }
          }
          return; 
      }

      if (tMap.checkoutPhrases.some(p => transcript.includes(p))) {
          if (st === 'playing') {
              const cScore = gameStateRef.current.currentPlayer === 'p1' ? gameStateRef.current.p1Score : gameStateRef.current.p2Score;
              handleTurnCommitRef.current(cScore);
          }
          return;
      }
      
      if (tMap.cmdUndo.some(p => transcript.includes(p))) {
           if (st === 'playing' && gameStateRef.current.history.length > 0) {
               let sliceCount = 1;
               if (settingsRef.current.isBot && gameStateRef.current.currentPlayer === 'p1' && gameStateRef.current.history.length >= 2) {
                   if (gameStateRef.current.history[0].player === 'p2') {
                       sliceCount = 2;
                   }
               }
               setGameState(recalculateGame(gameStateRef.current.history.slice(sliceCount)));
               setErrorMsg(translations[lang].cmdUndo[0]); 
               setTimeout(() => setErrorMsg(''), 1000);
           }
           return;
      }

      if (tMap.cmdNextLeg.some(p => transcript.includes(p))) {
          if (st === 'leg_finished') {
              const nS = gameStateRef.current.startingPlayer === 'p1' ? 'p2' : 'p1'; 
              setGameState(prev => ({ ...prev, p1Score: settingsRef.current.startScore, p2Score: settingsRef.current.startScore, winner: null, history: [], currentPlayer: nS, startingPlayer: nS })); 
              setAppState('playing');
          }
          return;
      }

      if (tMap.cmdRematch.some(p => transcript.includes(p))) {
          if (st === 'match_finished') {
              const p1Final = settingsRef.current.p1Name || tMap.p1Default;
              const p2Final = settingsRef.current.p2Name || (settingsRef.current.isBot ? tMap.botDefault : tMap.p2Default);
              setGameState({ p1Score: settingsRef.current.startScore, p2Score: settingsRef.current.startScore, p1Legs: 0, p2Legs: 0, currentPlayer: settingsRef.current.startPlayer, startingPlayer: settingsRef.current.startPlayer, winner: null, matchWinner: null, history: [], completedLegs: [] }); 
              setAppState('playing');
          }
          return;
      }

      if (st === 'playing') {
          const numbers = transcript.match(/\d+/g);
          if (numbers) {
              const num = parseInt(numbers.join(''));
              if (num >= 0 && num <= 180) {
                  handleTurnCommitRef.current(num);
              }
          } else {
              setErrorMsg(`? "${transcript}"`);
              setTimeout(() => setErrorMsg(''), 1500);
          }
      }
  };

  useEffect(() => {
      if (user && !user.isAnonymous) {
          const rawLocal = safeStorage.getItem('dartsMatchHistory');
          if (rawLocal) {
              try {
                  const localHist = JSON.parse(rawLocal);
                  const unsynced = localHist.filter(m => !m.p1Id && !m.p2Id && !m.ignoredSync);
                  if (unsynced.length > 0) setSyncPromptMatches(unsynced);
              } catch(e) {}
          }
      }
  }, [user]);

  const handleSyncAccept = async () => {
      const toSync = [...syncPromptMatches];
      setSyncPromptMatches([]);
      const rawLocal = safeStorage.getItem('dartsMatchHistory');
      let localHist = rawLocal ? JSON.parse(rawLocal) : matchHistory;
      const syncedIds = toSync.map(m => m.id);
      
      localHist = localHist.map(m => syncedIds.includes(m.id) ? { ...m, ignoredSync: true, p1Id: user.uid } : m);
      safeStorage.setItem('dartsMatchHistory', JSON.stringify(localHist));
      setMatchHistory(localHist);

      let syncedCount = 0;
      let errorsCount = 0;

      for (const m of toSync) {
          const updatedMatch = { 
              ...m, 
              p1Id: user.uid, 
              p1Name: user.displayName ? user.displayName.split(' ')[0] : m.p1Name,
              ignoredSync: true 
          };
          if (db) {
              try {
                  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), updatedMatch);
                  syncedCount++;
              } catch(e) { errorsCount++; }
          }
      }
      if (syncedCount > 0) {
          setErrorMsg(`Zálohováno ${syncedCount} zápasů!`);
      } else if (errorsCount > 0) {
          setErrorMsg("Chyba synchronizace (Firebase pravidla blokují zápis).");
      }
      setTimeout(() => setErrorMsg(''), 4000);
  };

  const handleSyncDecline = () => {
      const toIgnoreIds = syncPromptMatches.map(m => m.id);
      setSyncPromptMatches([]);
      const rawLocal = safeStorage.getItem('dartsMatchHistory');
      let localHist = rawLocal ? JSON.parse(rawLocal) : matchHistory;
      localHist = localHist.map(m => toIgnoreIds.includes(m.id) ? { ...m, ignoredSync: true } : m);
      safeStorage.setItem('dartsMatchHistory', JSON.stringify(localHist));
      setMatchHistory(localHist);
  };

  useEffect(() => {
      if (user && !user.isAnonymous) {
          const savedNick = safeStorage.getItem(`sdc_nickname_${user.uid}`);
          setSettings(s => ({
              ...s,
              p1Name: savedNick || (user.displayName ? user.displayName.split(' ')[0] : translations[lang].p1Default),
              p1Id: user.uid
          }));
      } else {
          setSettings(s => ({ ...s, p1Id: null }));
      }
  }, [user, lang]);

  useEffect(() => {
      if (user && !user.isAnonymous && settings.p1Name) {
          const p1Defaults = [translations.cs.p1Default, translations.en.p1Default, translations.pl.p1Default];
          if (!p1Defaults.includes(settings.p1Name)) {
              safeStorage.setItem(`sdc_nickname_${user.uid}`, settings.p1Name);
          }
      }
  }, [settings.p1Name, user]);

  const handleLogin = async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      try {
          await signInWithPopup(auth, provider);
      } catch (error) {
          console.error("Login popup error:", error);
          if (error.code === 'auth/popup-blocked') {
              setErrorMsg("Zablokováno! Povolte vyskakovací okna.");
          } else if (error.code === 'auth/popup-closed-by-user') {
              setErrorMsg("Přihlášení zrušeno (okno zavřeno).");
          } else {
              setErrorMsg("Chyba přihlášení. (Běžíte v Preview?)");
          }
          setTimeout(() => setErrorMsg(''), 4000);
      }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch (error) {} };

  const handleDeleteAccount = async () => {
      if (!window.confirm(translations[lang].deleteAccountConfirm)) return;
      try {
          if (db && user && !user.isAnonymous) {
              const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), where('p1Id', '==', user.uid));
              const snap = await getDocs(q);
              const batch = writeBatch(db);
              snap.docs.forEach(d => batch.delete(d.ref));
              await batch.commit();
          }
          if (user && !user.isAnonymous) {
              await deleteUser(user);
          } else {
              setMatchHistory([]);
              safeStorage.setItem('dartsMatchHistory', JSON.stringify([]));
          }
          setAppState('home');
          setErrorMsg("Smazáno.");
          setTimeout(()=>setErrorMsg(''), 2000);
      } catch (error) {
          console.error(error);
          if (error.code === 'auth/requires-recent-login') {
              setErrorMsg("Pro smazání účtu se musíte znovu přihlásit.");
          } else {
              setErrorMsg("Chyba při mazání.");
          }
          setTimeout(()=>setErrorMsg(''), 3000);
      }
  };

  const resetSetupNames = () => {
      setSettings(s => ({ 
          ...s, 
          p1Name: user && !user.isAnonymous && user.displayName ? user.displayName.split(' ')[0] : translations[lang].p1Default, 
          p2Name: s.isBot ? translations[lang].botDefault : translations[lang].p2Default 
      }));
  };

  useEffect(() => {
    setSettings(s => {
        const next = { ...s };
        next.p1Name = getTranslatedName(s.p1Name, true, lang);
        next.p2Name = getTranslatedName(s.p2Name, false, lang);
        return next;
    });
  }, [lang]);

  useEffect(() => {
    let swRegistration = null;
    const stored = safeStorage.getItem('sdc_app_version');
    
    if (stored && stored !== APP_VERSION) {
        setIsUpdating(true);
        safeStorage.setItem('sdc_app_version', APP_VERSION);
        
        const forceClearCache = async () => {
            try {
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    for (const reg of regs) {
                        await reg.unregister();
                    }
                }
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(key => caches.delete(key)));
                }
            } catch (e) {
                console.error("Cache clear error", e);
            } finally {
                setTimeout(() => window.location.reload(true), 1500);
            }
        };
        forceClearCache();
        return; 
    } else if (!stored) { 
        safeStorage.setItem('sdc_app_version', APP_VERSION); 
    }

    if ('serviceWorker' in navigator) {
        try {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (!reg) return;
                swRegistration = reg;
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) setUpdateAvailable(true);
                        });
                    }
                });
            }).catch(err => {});

            const handleVisibilityChange = () => { if (document.visibilityState === 'visible' && swRegistration) swRegistration.update().catch(() => {}); };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
        } catch (err) {}
    }
  }, []);

  const handleInstallClick = async () => {
      if (!installPrompt) return;
      try {
          installPrompt.prompt();
          const { outcome } = await installPrompt.userChoice;
          if (outcome === 'accepted') setInstallPrompt(null);
      } catch (e) {}
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const check = () => {
            setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth > 500);
            setIsPC(window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 768);
        };
        let timeout;
        const debouncedCheck = () => { clearTimeout(timeout); timeout = setTimeout(check, 100); };
        check();
        window.addEventListener('resize', debouncedCheck);
        setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream);
        setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
        
        return () => { window.removeEventListener('resize', debouncedCheck); clearTimeout(timeout); };
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const finishLoading = () => { if (isMounted) setTimeout(() => setIsReady(true), 250); };

    try {
        const existingScript = document.getElementById('tailwind-script');
        if (!existingScript) {
            const script = document.createElement('script');
            script.id = 'tailwind-script'; script.src = "https://cdn.tailwindcss.com";
            script.onload = finishLoading; script.onerror = finishLoading; 
            document.head.appendChild(script);
        } else { finishLoading(); }
        
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) { meta = document.createElement('meta'); meta.name = "viewport"; document.head.appendChild(meta); }
        meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
    } catch(e) {}
  }, []);

  useEffect(() => {
    const handler = (event) => { if (event.reason && (event.reason.code === 'permission-denied' || event.reason.toString().includes('segments'))) { event.preventDefault(); } };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); if (window.matchMedia('(display-mode: standalone)').matches) return; setInstallPrompt(e); };
    const installHandler = () => { setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', handler); window.addEventListener('appinstalled', installHandler);
    return () => { window.removeEventListener('beforeinstallprompt', handler); window.removeEventListener('appinstalled', installHandler); };
  }, []);

  useEffect(() => {
    if (!auth) return;
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
        if (u) { setUser(u); } else {
            try { await signInAnonymously(auth);
            } catch (e) { setOfflineMode(true); }
        }
        setLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => { safeStorage.setItem('dartsMatchHistory', JSON.stringify(matchHistory)); }, [matchHistory]);

  useEffect(() => {
      gameStateRef.current = gameState; isMicActiveRef.current = isMicActive;
      settingsRef.current = settings; appStateRef.current = appState; currentInputRef.current = currentInput; finishDataRef.current = finishData;
      if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; 
  }, [gameState, isMicActive, appState, settings, currentInput, finishData]);

  useEffect(() => {
      window.history.pushState({ sdc: 'trap' }, "", window.location.href);
      const handlePopState = (e) => {
          const st = appStateRef.current;
          if (st === 'playing' || st === 'leg_finished' || st === 'match_finished') {
              window.history.pushState({ sdc: 'trap' }, "", window.location.href);
          } else if (st !== 'home') {
              setAppState('home');
              window.history.pushState({ sdc: 'trap' }, "", window.location.href);
          }
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
      const handleGlobalKeyDown = (e) => {
          if (appStateRef.current !== 'playing' || editingMove || finishData) return;
          const isPC = window.matchMedia("(pointer: fine)").matches && window.innerWidth >= 768;
          if (!isPC) return;
          const key = e.key;
          if (/^[0-9]$/.test(key)) { e.preventDefault(); setCurrentInput(prev => prev.length < 3 ? prev + key : prev); }
          else if (key === 'Backspace') { e.preventDefault(); setCurrentInput(prev => prev.slice(0, -1)); }
          else if (key === 'Enter') { e.preventDefault(); const cVal = currentInputRef.current; if (cVal !== '') handleTurnCommitRef.current(parseInt(cVal)); }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingMove, finishData]);

  const toggleMic = () => { setIsMicActive(!isMicActive); };

  useEffect(() => {
      if (settings.isBot && gameState.currentPlayer === 'p2' && ['playing'].includes(appState) && !gameState.winner) {
          const timeout = setTimeout(() => playBotTurn(), 1500);
          return () => clearTimeout(timeout);
      }
  }, [gameState.currentPlayer, appState, settings.isBot]);

  const playBotTurn = () => {
      const cScore = gameState.p2Score; let pts = 0; const lvl = settings.botLevel;
      const canOut = cScore <= 170 && ![169, 168, 166, 165, 163, 162, 159].includes(cScore);
      const neighbors = { 20: [1, 5], 19: [7, 3], 18: [4, 1], 17: [2, 3] };
      const getThrow = (target, tProb, sProb) => { const nb = neighbors[target] || [1, 5]; let s = 0; for(let i=0; i<3; i++) { const r = Math.random(); if(r < tProb) s += target * 3; else if(r < tProb + sProb) s += target; else s += nb[Math.floor(Math.random()*nb.length)]; } return s; };

      if (lvl === 'pdc') {
          let isCheckout = false;
          if (canOut) { if (cScore > 100) isCheckout = Math.random() < 0.45; else isCheckout = Math.random() < 0.80; }
          if (isCheckout) { pts = cScore; } else { let target = 20; const rTarget = Math.random(); if (rTarget > 0.98) target = 18; else if (rTarget > 0.92) target = 19; let attempt = getThrow(target, 0.38, 0.58); if (cScore - attempt <= 1) pts = Math.max(0, cScore - 32); else pts = attempt; }
      } else if (lvl === 'amateur') {
          let isCheckout = false;
          if (canOut) { if (cScore > 60) isCheckout = Math.random() < 0.01; else isCheckout = Math.random() < 0.15; }
          if (isCheckout) { pts = cScore; } else { let attempt = getThrow(20, 0.02, 0.65); if (cScore - attempt < 0 || cScore - attempt === 1) pts = attempt; else pts = attempt; }
      } else if (lvl === 'jelito') {
          let isCheckout = false;
          if (canOut) { if (cScore > 100) isCheckout = Math.random() < 0.04; else if (cScore > 60) isCheckout = Math.random() < 0.12; else isCheckout = Math.random() < 0.35; }
          if (isCheckout) { pts = cScore; } else { let attempt = getThrow(Math.random()<0.85?20:19, 0.14, 0.55); if (cScore - attempt <= 1) { if (cScore <= 60) { pts = Math.floor(cScore / 2); if (pts === 0) pts = 1; } else { pts = Math.max(0, cScore - 32); } } else { pts = attempt; } }
      } else if (lvl === 'custom') {
          const tAvg = parseInt(settings.botAvg) || 50;
          if (canOut && Math.random() < Math.min(0.95, tAvg/110)) pts = cScore; else pts = canOut ? 0 : randNormal(tAvg, 22);
      } else { pts = randNormal(50, 20); }

      processTurn(Math.min(180, Math.max(0, pts)), cScore === pts ? getMinDartsToCheckout(cScore, settings.outMode) : 3);
  };

  const toggleFullScreen = () => { 
      if (isIOS) { setErrorMsg(translations[lang].iosAddHome); setTimeout(() => setErrorMsg(''), 4000); return; }
      const doc = document.documentElement; const isFull = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isFull) { if (doc.requestFullscreen) doc.requestFullscreen().catch(e => {}); else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen(); } 
      else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); }
  };

  const recalculateGame = (baseHistory) => {
    const moves = [...baseHistory].reverse();
    let p1 = settings.startScore, p2 = settings.startScore, winner = null;
    const rec = moves.map((move, i) => {
      if (winner) return move;
      const cS = move.player === 'p1' ? p1 : p2; let nS = cS - move.score;
      let isBust = nS < 0 || (settings.outMode === 'double' && nS === 1);
      if (!isBust) { if (move.player === 'p1') p1 = nS; else p2 = nS; }
      if (!isBust && nS === 0) winner = move.player;
      return { ...move, remaining: move.player === 'p1' ? p1 : p2, isBust, turn: i + 1 };
    });
    let nP = rec.length > 0 ? (rec[rec.length - 1].player === 'p1' ? 'p2' : 'p1') : gameState.startingPlayer;
    return { ...gameState, p1Score: p1, p2Score: p2, history: rec.reverse(), winner, currentPlayer: winner ? winner : nP };
  };

  const processTurn = (points, dartsCount = 3) => {
    const pts = parseInt(points);
    if (isNaN(pts) || pts < 0 || pts > 180 || IMPOSSIBLE_SCORES.includes(pts)) { 
        setErrorMsg(String(translations[lang].impossible)); setTimeout(() => setErrorMsg(''), 1500); setCurrentInput(''); return; 
    }

    const nm = { id: Date.now(), player: gameState.currentPlayer, score: pts, dartsUsed: dartsCount };
    const ns = recalculateGame([nm, ...gameState.history]);
    if (ns.history[0].isBust) { setErrorMsg(String(translations[lang].bust)); setTimeout(() => setErrorMsg(''), 1500); }

    if (ns.winner) {
      const p1W = ns.winner === 'p1' ? gameState.p1Legs + 1 : gameState.p1Legs;
      const p2W = ns.winner === 'p2' ? gameState.p2Legs + 1 : gameState.p2Legs;
      const tgt = settings.matchMode === 'first_to' ? settings.matchTarget : Math.ceil(settings.matchTarget / 2);
      const isOver = p1W >= tgt || p2W >= tgt;
      const uLegs = [...gameState.completedLegs, { history: ns.history, winner: ns.winner }];

      if (isOver) {
        const record = { id: Date.now(), date: new Date().toLocaleString(), p1Name: settings.p1Name, p1Id: settings.p1Id || null, p2Name: settings.p2Name, p2Id: settings.p2Id || null, p1Legs: p1W, p2Legs: p2W, matchWinner: ns.winner, completedLegs: uLegs, isBot: settings.isBot, botLevel: settings.botLevel, botAvg: settings.botAvg };
        setMatchHistory(prev => [record, ...prev]);
        
        if(db && user && !user.isAnonymous) {
            addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), record)
            .catch(err => {
                console.error("Firebase Upload Error:", err);
                setErrorMsg("Zápas neodeslán! Firebase chyba: " + err.code);
                setTimeout(() => setErrorMsg(''), 5000);
            }); 
        }
      }
      
      setGameState({ ...ns, p1Legs: p1W, p2Legs: p2W, matchWinner: isOver ? ns.winner : null, completedLegs: uLegs });
      setAppState(isOver ? 'match_finished' : 'leg_finished');
    } else { 
      setGameState(ns); 
    }
    
    setCurrentInput('');
  };
  processTurnRef.current = processTurn;

  const handleTurnCommit = (points, darts = 3, force = false) => {
    const cS = gameState.currentPlayer === 'p1' ? gameState.p1Score : gameState.p2Score;
    if ((cS - points) === 0 && !force) {
        const minD = getMinDartsToCheckout(cS, settings.outMode);
        if (minD === Infinity) { setErrorMsg(String(translations[lang].impossible)); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; }
        setFinishData({ points, minD });
    } else { processTurn(points, darts); }
  };
  handleTurnCommitRef.current = handleTurnCommit;

  const handleUndoClick = () => {
    if (gameState.history.length === 0) return;
    let sliceCount = 1;
    if (settings.isBot && gameState.currentPlayer === 'p1' && gameState.history.length >= 2) {
        if (gameState.history[0].player === 'p2') sliceCount = 2;
    }
    setGameState(recalculateGame(gameState.history.slice(sliceCount)));
  };

  const handleQuickBtnDown = (idx) => { setLongPressIdx(idx); longPressTimer.current = setTimeout(() => { if (currentInput && parseInt(currentInput) <= 180) { const newB = [...settings.quickButtons]; newB[idx] = parseInt(currentInput); setSettings({...settings, quickButtons: newB}); setCurrentInput(''); setErrorMsg(String(translations[lang].presetSaved)); setTimeout(()=>setErrorMsg(''), 1000); } setLongPressIdx(null); }, 700); };
  const handleQuickBtnUp = (val) => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); if (longPressIdx !== null) handleTurnCommit(val); setLongPressIdx(null); } };

  const handleScoreClick = (pKey) => {
    if (pKey !== gameState.currentPlayer) return;
    if (!currentInput) { const cS = pKey === 'p1' ? gameState.p1Score : gameState.p2Score; const minD = getMinDartsToCheckout(cS, settings.outMode); if (minD !== Infinity) setFinishData({ points: cS, minD }); return; }
    const rem = parseInt(currentInput); if (isNaN(rem)) return;
    const cS = pKey === 'p1' ? gameState.p1Score : gameState.p2Score; const thr = cS - rem;
    if (thr < 0 || thr > 180 || IMPOSSIBLE_SCORES.includes(thr)) { setErrorMsg(String(translations[lang].impossible)); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; }
    if (rem === 0) { const minD = getMinDartsToCheckout(cS, settings.outMode); if (minD === Infinity) { setErrorMsg(String(translations[lang].impossible)); setTimeout(()=>setErrorMsg(''), 1500); setCurrentInput(''); return; } setFinishData({ points: thr, minD }); } else handleTurnCommit(thr);
  };

  const handleSaveEdit = (newS, newD) => {
    if (isNaN(newS) || newS < 0 || newS > 180 || IMPOSSIBLE_SCORES.includes(newS)) { setErrorMsg(String(translations[lang].impossible)); return; }
    const uh = gameState.history.map(m => m.id === editingMove.id ? { ...m, score: newS, dartsUsed: (m.remaining+m.score-newS)===0 ? newD : 3 } : m);
    const ns = recalculateGame(uh);
    
    let nextAppState = appState;
    let nextP1Legs = gameState.p1Legs;
    let nextP2Legs = gameState.p2Legs;
    let nextCompletedLegs = [...gameState.completedLegs];

    if (gameState.winner && !ns.winner) {
        nextAppState = 'playing';
        if (gameState.winner === 'p1') nextP1Legs = Math.max(0, nextP1Legs - 1);
        if (gameState.winner === 'p2') nextP2Legs = Math.max(0, nextP2Legs - 1);
        nextCompletedLegs.pop();
        ns.matchWinner = null;
        if (appState === 'match_finished') setMatchHistory(prev => [record, ...prev]);
    }
    else if (!gameState.winner && ns.winner) {
        if (ns.winner === 'p1') nextP1Legs++;
        if (ns.winner === 'p2') nextP2Legs++;
        nextCompletedLegs.push({ history: ns.history, winner: ns.winner });

        const tgt = settings.matchMode === 'first_to' ? settings.matchTarget : Math.ceil(settings.matchTarget / 2);
        const isOver = nextP1Legs >= tgt || nextP2Legs >= tgt;
        ns.matchWinner = isOver ? ns.winner : null;
        nextAppState = isOver ? 'match_finished' : 'leg_finished';

        if (isOver) {
           const record = { id: Date.now(), date: new Date().toLocaleString(), p1Name: settings.p1Name, p1Id: settings.p1Id || null, p2Name: settings.p2Name, p2Id: settings.p2Id || null, p1Legs: nextP1Legs, p2Legs: nextP2Legs, matchWinner: ns.winner, completedLegs: nextCompletedLegs, isBot: settings.isBot, botLevel: settings.botLevel, botAvg: settings.botAvg };
           setMatchHistory(prev => [record, ...prev]);
           if(db && user && !user.isAnonymous) {
                addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), record)
                .catch(err => {
                    console.error("Firebase Upload Error:", err);
                    setErrorMsg("Zápas neodeslán! Firebase chyba: " + err.code);
                    setTimeout(() => setErrorMsg(''), 5000);
                }); 
            }
        }
    }
    setGameState({ ...ns, p1Legs: nextP1Legs, p2Legs: nextP2Legs, completedLegs: nextCompletedLegs });
    setAppState(nextAppState); setEditingMove(null);
  };

  const startMatch = () => { 
      const p1Final = settings.p1Name && settings.p1Name.trim() !== '' ? settings.p1Name : translations[lang].p1Default;
      const p2Final = settings.p2Name && settings.p2Name.trim() !== '' ? settings.p2Name : (settings.isBot ? translations[lang].botDefault : translations[lang].p2Default);
      if (p1Final !== settings.p1Name || p2Final !== settings.p2Name) { setSettings(s => ({ ...s, p1Name: p1Final, p2Name: p2Final })); }
      
      setGameState({ p1Score: settings.startScore, p2Score: settings.startScore, p1Legs: 0, p2Legs: 0, currentPlayer: settings.startPlayer, startingPlayer: settings.startPlayer, winner: null, matchWinner: null, history: [], completedLegs: [] }); 
      setAppState('playing'); 
  };

  const renderUnifiedHistory = () => {
    const rounds = []; let cR = {}; [...gameState.history].reverse().forEach(move => { const rN = Math.ceil(move.turn / 2); if (!cR[rN]) { const n = { id: rN, p1: null, p2: null }; cR[rN] = n; rounds.push(n); } if (move.player === 'p1') cR[rN].p1 = move; else cR[rN].p2 = move; });
    const renderMove = (move) => {
        if (!move) return <div className="h-8 md:h-12"></div>;
        const isCheckout = move.remaining === 0 && !move.isBust;
        let cls = 'text-slate-200'; if (isCheckout) cls = 'text-yellow-400'; else if (move.score >= 100) cls = move.player === 'p1' ? 'text-emerald-400' : 'text-purple-400';
        return (<div className={`flex items-center w-full ${move.player === 'p1' ? 'justify-between pr-2 md:pr-4' : 'justify-between pl-2 md:pl-4'}`}>{move.player === 'p1' && <div className="text-[10px] md:text-sm lg:text-base font-mono text-slate-500 font-bold w-8 md:w-12 text-left">{move.remaining}</div>}<div onClick={() => setEditingMove(move)} className={`cursor-pointer hover:bg-slate-800/50 rounded px-1 md:px-3 flex items-center gap-1 md:gap-2 ${move.player==='p1'?'text-right':'text-left'} ${move.isBust?'opacity-50':''}`}><div className={`${isCheckout?'text-2xl md:text-3xl lg:text-4xl':'text-xl md:text-2xl lg:text-3xl'} font-bold font-mono ${cls} flex items-baseline gap-1 md:gap-2`}>{move.isBust ? <span className="text-red-400 line-through decoration-2">{move.score}</span> : <span>{move.score}</span>}{isCheckout && <span className="text-xs md:text-sm text-yellow-400 italic">({move.dartsUsed}.{translations[lang].confirmDarts})</span>}</div></div>{move.player === 'p2' && <div className="text-[10px] md:text-sm lg:text-base font-mono text-slate-500 font-bold w-8 md:w-12 text-right">{move.remaining}</div>}</div>);
    };
    return (<div ref={historyRef} className="history-container bg-slate-900/50 rounded-lg border border-slate-800">{rounds.map(r => <div key={r.id} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center border-b border-slate-800/60 py-2 md:py-3 last:border-0">{renderMove(r.p1)}<div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-800 border border-slate-700 shadow-sm text-[10px] md:text-xs font-bold text-slate-500">{r.id}</div>{renderMove(r.p2)}</div>)}{rounds.length === 0 && <div className="text-center text-slate-600 text-xs md:text-sm py-10">- Zatím bez hodů -</div>}</div>);
  };

  const handleKeyboardInput = (char) => { if (!activeKeyboardInput) return; if (inputPristine) { setSettings(s => ({ ...s, [activeKeyboardInput]: char })); setInputPristine(false); } else { const currentVal = settings[activeKeyboardInput] || ''; if (currentVal.length >= 15) return; setSettings(s => ({ ...s, [activeKeyboardInput]: currentVal + char })); } };
  const handleKeyboardDelete = () => { if (!activeKeyboardInput) return; if (inputPristine) { setInputPristine(false); const currentVal = settings[activeKeyboardInput] || ''; setSettings(s => ({ ...s, [activeKeyboardInput]: currentVal.slice(0, -1) })); } else { setSettings(s => ({ ...s, [activeKeyboardInput]: s[activeKeyboardInput].slice(0, -1) })); } };
  
  const closeKeyboard = () => { 
      const currentVal = settings[activeKeyboardInput]; 
      if (!currentVal || currentVal.trim() === '') { 
          const defaultName = activeKeyboardInput === 'p1Name' ? translations[lang].p1Default : (settings.isBot ? translations[lang].botDefault : translations[lang].p2Default); 
          setSettings(s => ({ ...s, [activeKeyboardInput]: defaultName })); 
      } 
      setActiveKeyboardInput(null); 
  };
  
  const openKeyboard = (field) => { 
      const prevField = activeKeyboardInput; setActiveKeyboardInput(field);
      setSettings(prev => {
          const next = { ...prev };
          const p1Defaults = [translations.cs.p1Default, translations.en.p1Default, translations.pl.p1Default];
          const p2Defaults = [translations.cs.p2Default, translations.en.p2Default, translations.pl.p2Default, translations.cs.botDefault, translations.en.botDefault, translations.pl.botDefault];
          
          if (prevField && prevField !== field) { const val = next[prevField]; if (!val || val.trim() === '') next[prevField] = prevField === 'p1Name' ? translations[lang].p1Default : (next.isBot ? translations[lang].botDefault : translations[lang].p2Default); }
          const defaults = field === 'p1Name' ? p1Defaults : p2Defaults;
          if (defaults.includes(next[field])) { next[field] = ''; setInputPristine(false); } else { setInputPristine(false); }
          return next;
      });
  };

  const handleP1Focus = () => { const p1Defaults = [translations.cs.p1Default, translations.en.p1Default, translations.pl.p1Default]; if(p1Defaults.includes(settings.p1Name)) setSettings({...settings, p1Name: ''}); };
  const handleP1Blur = () => { if(settings.p1Name.trim() === '') setSettings({...settings, p1Name: translations[lang].p1Default}); };
  const handleP2Focus = () => { const p2Defaults = [translations.cs.p2Default, translations.en.p2Default, translations.pl.p2Default, translations.cs.botDefault, translations.en.botDefault, translations.pl.botDefault]; if(p2Defaults.includes(settings.p2Name)) setSettings({...settings, p2Name: ''}); };
  const handleP2Blur = () => { if(settings.p2Name.trim() === '') setSettings({...settings, p2Name: translations[lang].p2Default}); };
  const handleBotToggle = () => {
      const nextState = !settings.isBot; 
      const p2Defaults = [translations.cs.p2Default, translations.en.p2Default, translations.pl.p2Default, translations.cs.botDefault, translations.en.botDefault, translations.pl.botDefault];
      let newP2Name = settings.p2Name;
      if (p2Defaults.includes(newP2Name) || newP2Name.trim() === '') newP2Name = nextState ? translations[lang].botDefault : translations[lang].p2Default;
      setSettings({...settings, isBot: nextState, p2Name: newP2Name}); 
      if (nextState) setShowBotLevels(true); 
  };

  const handleNextLeg = () => {
      const nS = gameState.startingPlayer === 'p1' ? 'p2' : 'p1'; 
      setGameState(prev => ({ ...prev, p1Score: settings.startScore, p2Score: settings.startScore, winner: null, history: [], currentPlayer: nS, startingPlayer: nS })); 
      setAppState('playing');
  };

  const btnGameBase = "text-white font-bold py-2 rounded text-[10px] sm:text-xs transition-all select-none touch-manipulation active:scale-95";
  const numBtnBase = "h-full bg-slate-800 text-xl sm:text-2xl font-bold rounded hover:bg-slate-700 active:bg-slate-600 select-none touch-manipulation flex items-center justify-center";

  if (!isReady) {
      return (
          <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ width: '40px', height: '40px', border: '4px solid #0f172a', borderTop: '4px solid #10b981', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
      );
  }

  if (isUpdating) return (<div className="fixed inset-0 bg-slate-900 z-[9999] flex flex-col items-center justify-center text-white"><RefreshCw className="w-16 h-16 animate-spin text-emerald-500 mb-4" /><h2 className="text-2xl font-black">{translations[lang].updating}</h2><p className="text-slate-500 mt-2 text-sm">{APP_VERSION} {'->'} ...</p></div>);

  if (appState === 'match_finished' || selectedMatchDetail) {
    const d = selectedMatchDetail || { date: new Date().toLocaleString(), p1Name: settings.p1Name, p2Name: settings.p2Name, p1Legs: gameState.p1Legs, p2Legs: gameState.p2Legs, matchWinner: gameState.matchWinner, completedLegs: gameState.completedLegs, isBot: settings.isBot };
    return (
        <div className="flex flex-col bg-slate-950 text-slate-100 font-sans relative overflow-hidden w-full h-[100dvh]">
            <MatchStatsView 
                data={d} 
                onClose={() => { setSelectedMatchDetail(null); setAppState('setup'); resetSetupNames(); }} 
                title={translations[lang][selectedMatchDetail ? 'matchStats' : 'matchWinner']} 
                lang={lang} 
                onStartMatch={startMatch} 
            />
            {editingMove && <EditScoreModal initialScore={editingMove.score} initialDarts={editingMove.dartsUsed} isFinish={(editingMove.remaining+editingMove.score)-editingMove.score===0} scoreBefore={editingMove.remaining+editingMove.score} outMode={settings.outMode} onSave={handleSaveEdit} onCancel={()=>setEditingMove(null)} lang={lang} />}
        </div>
    );
  }

  const renderScoreCards = () => (
      <div className={`flex ${isLandscape ? 'flex-col min-h-0' : 'flex-row w-full'} flex-1 gap-1.5 h-full`}>
        {['p1', 'p2'].map(pKey => {
            const act = gameState.currentPlayer === pKey && !gameState.winner; const isP1 = pKey === 'p1';
            return (
                <div key={pKey} className={`flex-1 relative p-2 sm:p-4 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${act ? `bg-slate-800 ${isP1?'border-emerald-500':'border-purple-500'} shadow-xl` : 'bg-slate-900 border-slate-800 opacity-90'}`} onClick={() => handleScoreClick(pKey)}>
                  {act && <div className={`absolute -top-1 sm:-top-1.5 ${isP1?'bg-emerald-500 border-emerald-400':'bg-purple-600 border-purple-400'} text-slate-900 text-[9px] font-bold px-3 py-0.5 rounded-full z-10 border leading-none`}>{translations[lang].serving}</div>}
                  {gameState.startingPlayer === pKey && <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-slate-500"></div>}
                  <div className="w-full flex justify-between items-center mb-1">
                      <div className="flex flex-col min-w-0 flex-1 mr-1">
                          <h2 className="text-slate-300 text-[10px] sm:text-xs uppercase font-bold truncate">{isP1?settings.p1Name:settings.p2Name}</h2>
                          {pKey === 'p2' && settings.isBot && <span className="text-[8px] text-slate-500 font-medium truncate">{settings.botLevel === 'custom' ? `${translations[lang].diffCustom.split('(')[0]} (Avg ${settings.botAvg})` : translations[lang][`diff${settings.botLevel.charAt(0).toUpperCase() + settings.botLevel.slice(1)}`]}</span>}
                      </div>
                      <div className="bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-yellow-400 font-black text-lg sm:text-xl leading-tight shrink-0">{isP1?gameState.p1Legs:gameState.p2Legs}</div>
                  </div>
                  <div className={`font-mono font-black text-white mb-0 sm:mb-2 leading-none transition-transform select-none ${act ? `active:scale-95 cursor-pointer ${isP1 ? 'active:text-emerald-400' : 'active:text-purple-400'}` : ''}`} style={{ fontSize: isLandscape ? 'clamp(4rem, 15vh + 5vw, 15rem)' : 'clamp(4rem, 20vw, 10rem)' }}>
                      {isP1?gameState.p1Score:gameState.p2Score}
                  </div>
                  <div className="text-[9px] sm:text-[11px] text-slate-500 font-mono mt-auto">AVG: {((((isP1 ? settings.startScore - gameState.p1Score : settings.startScore - gameState.p2Score) / (gameState.history.filter(h => h.player === pKey).reduce((acc, h) => acc + (h.dartsUsed || 3), 0) || 1)) * 3) || 0).toFixed(1)}</div>
                </div>
            );
        })}
      </div>
  );

  const renderControls = () => (
      <div className={`flex flex-col gap-1 shrink-0 transition-opacity w-full h-full justify-center ${settings.isBot && gameState.currentPlayer === 'p2' ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className={`flex items-center gap-1 p-1 sm:p-1.5 rounded-lg border bg-opacity-10 border-opacity-10 ${gameState.currentPlayer === 'p1' ? 'bg-emerald-900 border-emerald-500' : 'bg-purple-900 border-purple-500'}`}>
          <span className={`text-[8px] font-bold uppercase px-1 ${gameState.currentPlayer === 'p1' ? 'text-emerald-600/60' : 'text-purple-600/60'}`}>{translations[lang].quickCheckout}</span>
          {[1, 2, 3].map(d => {
            const cS = gameState.currentPlayer === 'p1' ? gameState.p1Score : gameState.p2Score; const minD = getMinDartsToCheckout(cS, settings.outMode); const isP = d >= minD && minD !== Infinity;
            return <button key={d} disabled={!isP} onClick={() => handleTurnCommit(cS, d, true)} className={`${btnGameBase} flex-1 ${!isP ? 'bg-slate-800/40 opacity-10 cursor-default' : `${gameState.currentPlayer === 'p1' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'} shadow-lg`}`}>{d}. {translations[lang].dart}</button>;
          })}
        </div>
      <div className="mobile-input-area bg-slate-900 px-2 sm:px-4 py-1 sm:py-2 rounded-lg border border-slate-800 flex justify-between items-center h-12 sm:h-20 shrink-0">
         <div className="flex flex-col min-w-0 flex-1 mr-2 justify-center"><span className="text-[9px] text-slate-500 uppercase font-bold shrink-0">{translations[lang].throw}</span><div className={`font-bold flex-1 flex items-center ${errorMsg ? 'text-red-500 text-sm sm:text-xl leading-tight whitespace-normal' : 'text-white text-3xl sm:text-5xl font-mono truncate'}`}>{errorMsg || currentInput || <span className="text-slate-700">0</span>}</div></div>
         <div className="flex gap-1.5 sm:gap-2 shrink-0">
             <button onClick={toggleMic} className={`w-10 h-10 sm:w-12 sm:h-12 rounded flex items-center justify-center border transition-all ${isMicActive ? (isListening ? 'bg-red-600 border-red-500 animate-pulse text-white' : 'bg-red-900/50 border-red-500/50 text-red-200') : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}>{isMicActive ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6" />}</button>
             <button onClick={handleUndoClick} className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-800 text-slate-400 rounded flex items-center justify-center border border-slate-700 hover:text-white hover:bg-slate-700"><Undo2 className="w-5 h-5 sm:w-6 sm:h-6" /></button>
             <button onClick={() => handleTurnCommit(parseInt(currentInput))} disabled={!currentInput} className={`bg-emerald-600 text-white h-10 sm:h-12 w-14 sm:w-20 rounded flex items-center justify-center transition-all ${!currentInput ? 'opacity-30' : 'hover:bg-emerald-500'}`}><CheckCircle className="w-6 h-6 sm:w-8 sm:h-8" /></button>
         </div>
      </div>
      
      <div className="grid grid-cols-6 gap-1 shrink-0">
          {settings.quickButtons.map((val, i) => <button key={i} onPointerDown={() => handleQuickBtnDown(i)} onPointerUp={() => handleQuickBtnUp(val)} onPointerLeave={() => { if(longPressTimer.current) { clearTimeout(longPressTimer.current); setLongPressIdx(null); } }} className={`bg-slate-800 text-slate-300 text-xs sm:text-sm font-bold min-h-[2.5rem] sm:min-h-[3rem] rounded-lg sm:rounded-xl border border-slate-700/50 shadow-md transition-all select-none touch-manipulation ${longPressIdx === i ? 'bg-emerald-900 border-emerald-400 shaking' : ''}`}>{val}</button>)}
      </div>
      
      <div className="flex-1 grid grid-cols-4 gap-1 min-h-[120px]">
        {[7, 8, 9].map(n => <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>{n}</button>)}<button onClick={() => setCurrentInput(prev => prev.length < 3 ? prev + '0' : prev)} className={numBtnBase}>0</button>
        {[4, 5, 6].map(n => <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>{n}</button>)}<button onClick={() => setCurrentInput(prev => prev.slice(0, -1))} className={`${numBtnBase} text-red-400 active:bg-red-900/20`}><Delete className="w-5 h-5 sm:w-6 sm:h-6"/></button>
        {[1, 2, 3].map(n => <button key={n} onClick={() => setCurrentInput(p => p.length < 3 ? p + n : p)} className={numBtnBase}>{n}</button>)}
      </div>
    </div>
  );

  const nextLegBlock = (
    <div className={`w-full h-full flex flex-col items-center justify-center ${gameState.winner === 'p1' ? 'bg-emerald-900/40 border-emerald-500/50' : 'bg-purple-900/40 border-purple-500/50'} border-2 p-4 rounded-xl text-center animate-in zoom-in duration-300 shadow-2xl shadow-black/50`}>
        <Trophy className={`w-10 h-10 sm:w-12 sm:h-12 mb-2 ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'}`} />
        <h3 className={`text-lg sm:text-2xl font-black uppercase tracking-widest ${gameState.winner === 'p1' ? 'text-emerald-400' : 'text-purple-400'} mb-2`}>
            {translations[lang].legFor} {gameState.winner === 'p1' ? settings.p1Name : settings.p2Name}
        </h3>
        <button onClick={handleNextLeg} className={`w-full max-w-[250px] ${gameState.winner === 'p1' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'} text-white py-3 sm:py-4 rounded-xl font-black text-base sm:text-lg mt-2 sm:mt-4 shadow-lg active:scale-95 transition-all`}>
            {translations[lang].nextLeg}
        </button>
    </div>
  );

  const isSuccessMsg = errorMsg && ['!', 'Přihlášeno', 'Uloženo', 'Zálohováno', 'Recognized', 'Matched', 'Smazáno'].some(w => String(errorMsg).includes(w));

  return (
    <div className="bg-slate-950 text-slate-100 font-sans flex flex-col relative w-full h-[100dvh] overflow-hidden">
      <style>{`
        html, body { width: 100%; height: 100%; overflow: hidden; overscroll-behavior-y: none; background-color: #0f172a; margin: 0; padding: 0; }
        #root { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
        * { -webkit-tap-highlight-color: transparent; }
        button, [role="button"], div { touch-action: manipulation; }
        .history-container { height: 100%; width: 100%; overflow-y: auto; border-top: 1px solid #1e293b; scroll-behavior: smooth; }
        @media (max-height: 500px) and (orientation: landscape) { .mobile-input-area { height: 3rem !important; } header { min-height: 2.5rem !important; padding: 0.25rem 0.5rem !important; } }
        .no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .shaking { animation: shake 0.2s ease-in-out infinite; }
        @keyframes shake { 0% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } 100% { transform: translateX(0); } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
      `}</style>

      {/* --- EFEKTNÍ SPLASH SCREEN (PRŮLET IKONOU) --- */}
      {splashState !== 'hidden' && (
          <div className="fixed inset-0 z-[99999] bg-slate-950 flex items-center justify-center overflow-hidden pointer-events-none">
              <div className={`transition-all duration-700 ease-in-out transform origin-center ${splashState === 'zooming' ? 'scale-[60] opacity-0' : 'scale-100 opacity-100'}`}>
                  <svg className="w-32 h-32 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="48" fill="#0f172a" stroke="#10b981" strokeWidth="4"/>
                      <circle cx="50" cy="50" r="32" fill="none" stroke="#10b981" strokeWidth="2"/>
                      <circle cx="50" cy="50" r="16" fill="#ef4444"/>
                      <path d="M50 2 L50 98 M2 50 L98 50 M16 16 L84 84 M16 84 L84 16" stroke="#10b981" strokeWidth="1" opacity="0.4"/>
                      <text x="50" y="61" fontFamily="Arial, sans-serif" fontSize="32" fontWeight="900" fill="#ffffff" textAnchor="middle" letterSpacing="1">SDC</text>
                  </svg>
              </div>
          </div>
      )}

      {/* iOS Smart Banner */}
      {isIOS && !isStandalone && appState === 'home' && (
          <div className="bg-emerald-600 p-2 text-center text-[10px] sm:text-xs font-bold flex items-center justify-center gap-2 z-50 shadow-md w-full shrink-0 animate-bounce cursor-pointer" onClick={() => {setErrorMsg(translations[lang].iosAddHome); setTimeout(() => setErrorMsg(''), 4000);}}>
            <DownloadCloud className="w-4 h-4" /> {translations[lang].iosAddHome}
          </div>
      )}

      {syncPromptMatches.length > 0 && <SyncModal matches={syncPromptMatches} onAccept={handleSyncAccept} onDecline={handleSyncDecline} lang={lang} />}
      
      {finishData && <FinishDartsSelector points={finishData.points} minDarts={finishData.minD} onConfirm={(d) => { processTurn(finishData.points, d); setFinishData(null); }} onCancel={() => setFinishData(null)} lang={lang} player={gameState.currentPlayer} />}
      {editingMove && <EditScoreModal initialScore={editingMove.score} initialDarts={editingMove.dartsUsed} isFinish={(editingMove.remaining+editingMove.score)-editingMove.score===0} scoreBefore={editingMove.remaining+editingMove.score} outMode={settings.outMode} onSave={handleSaveEdit} onCancel={()=>setEditingMove(null)} lang={lang} />}
      
      {activeKeyboardInput && <VirtualKeyboard onChar={handleKeyboardInput} onDelete={handleKeyboardDelete} onClose={closeKeyboard} lang={lang} />}

      <header className={`relative p-2 min-h-16 landscape:min-h-10 h-auto bg-slate-900 border-b border-slate-800 flex justify-between items-center shadow-md shrink-0 sticky top-0 z-20 transition-all duration-300`}>
        <div className={`absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none z-10 pr-12 sm:pr-16 transition-opacity duration-300 ${appState === 'home' ? 'opacity-0' : 'opacity-100'}`}>
            <div className="flex items-center gap-1.5 sm:gap-4 whitespace-nowrap bg-slate-900/40 backdrop-blur-sm rounded-xl px-2 py-0.5 border border-white/5 transform scale-90 sm:scale-100 landscape:scale-[0.65] origin-top sm:origin-center mt-1 sm:mt-0">
                <div className="flex items-baseline gap-1"><span className="text-2xl sm:text-3xl font-black text-emerald-500 tracking-tight leading-none">{settings.startScore}</span><span className="text-white-500 text-sm sm:text-base font-bold self-end mb-0.5">{settings.outMode==='double'?'DO':'SO'}</span></div>
                <div className="w-px h-6 bg-slate-700/50 rotate-12 mx-1"></div>
                <div className="flex items-baseline gap-1.5"><span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider self-center">{settings.matchMode==='first_to'?t('firstTo'):t('bestOf')}</span><span className="text-xl sm:text-2xl font-black text-white leading-none">{settings.matchTarget}</span></div>
            </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 w-auto min-w-[2.5rem] relative z-30">
            {appState === 'home' ? (
                <div className="flex items-center gap-2">
                    <div className="text-[10px] font-mono text-slate-500 border border-slate-800 rounded px-1.5 py-0.5">{APP_VERSION}</div>
                    {installPrompt && ( <button onClick={handleInstallClick} className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white shadow-lg animate-pulse"><DownloadCloud className="w-4 h-4" /></button> )}
                </div>
            ) : appState === 'setup' || appState === 'tutorial' || appState === 'about' || appState === 'history' || appState === 'profile' ? (
                <button onClick={() => setAppState('home')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><Home className="w-6 h-6" /></button>
            ) : (
                <button onClick={() => { setAppState('setup'); resetSetupNames(); }} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><ArrowLeft className="w-6 h-6" /></button>
            )}
        </div>

        <div className="flex gap-2 items-center shrink-0 relative z-30">
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">{['cs','en','pl'].map(l=><button key={l} onClick={()=>setLang(l)} className={`p-1 rounded flex items-center justify-center transition-all ${lang===l?'bg-slate-600 opacity-100 shadow-sm':'opacity-40 grayscale hover:opacity-75'}`}><FlagIcon lang={l} /></button>)}</div>
            {!isStandalone && ( <button onClick={toggleFullScreen} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><Maximize className="w-5 h-5" /></button> )}
        </div>
      </header>

      {/* --- HOME ROZCESTNÍK --- */}
      {appState === 'home' && (
        <main className="flex-1 overflow-y-auto w-full relative z-10 flex flex-col">
            <div className="my-auto flex flex-col items-center justify-center p-6 gap-6 max-w-md mx-auto py-8 w-full">
                <div className="mb-2 flex flex-col items-center">
                    <div className="w-20 h-20 bg-emerald-600 rounded-full flex items-center justify-center mb-3 shadow-lg shadow-emerald-900/50">
                        <Target className="w-10 h-10 text-slate-900" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-widest text-center leading-none">SIMPLE DART</h1>
                    <h2 className="text-emerald-500 font-bold tracking-widest text-sm mt-1">COUNTER</h2>
                </div>
                
                <button onClick={() => setAppState('setup')} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl text-xl shadow-lg shadow-emerald-900/20 transition-transform active:scale-95 flex items-center justify-center gap-3">
                    <Play className="w-7 h-7 fill-current" /> {t('newGame')}
                </button>

                <div className="grid grid-cols-2 gap-3 w-full">
                    <button onClick={() => setAppState('tutorial')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 shadow-md">
                        <FileText className="w-7 h-7 text-emerald-400" />
                        <span className="text-sm font-bold text-white">{t('tutorial')}</span>
                    </button>
                    <button onClick={() => { setAppState('history'); }} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 shadow-md">
                        <History className="w-7 h-7 text-blue-400" />
                        <span className="text-sm font-bold text-white">{t('matchHistory')}</span>
                    </button>
                    <button onClick={() => setAppState('profile')} className="bg-slate-800 hover:bg-slate-700 border border-emerald-500/30 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 shadow-md relative overflow-hidden">
                        {(!user || user.isAnonymous) && <div className="absolute top-1 right-1"><WifiOff className="w-3 h-3 text-slate-500" /></div>}
                        <Cloud className={`w-7 h-7 ${user && !user.isAnonymous ? 'text-emerald-500' : 'text-slate-400'}`} />
                        <span className="text-sm font-bold text-white text-center leading-tight">{t('statsPersonal')}</span>
                    </button>
                    <button onClick={() => setAppState('about')} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95 shadow-md">
                        <Info className="w-7 h-7 text-purple-400" />
                        <span className="text-sm font-bold text-white">{t('aboutApp')}</span>
                    </button>
                </div>

                {(!user || user.isAnonymous) && !loadingUser && (
                    <div className="w-full mt-2">
                        <button onClick={handleLogin} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl p-3 flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-md">
                            <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                            <span className="text-xs font-bold text-slate-300">{t('loginWithGoogle')}</span>
                        </button>
                    </div>
                )}
            </div>
        </main>
      )}

      {/* --- MŮJ PROFIL --- */}
      {appState === 'profile' && (
          <UserProfile user={user} matches={matchHistory} onLogout={() => { handleLogout(); setAppState('home'); }} onDeleteAccount={handleDeleteAccount} lang={lang} />
      )}

      {/* --- PRŮVODCE (TUTORIAL) --- */}
      {appState === 'tutorial' && (
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center w-full relative z-10 pb-20">
            <h2 className="text-2xl font-black text-white mb-6 tracking-widest uppercase flex items-center gap-2">
                <FileText className="w-6 h-6 text-emerald-500"/> {t('tutorial')}
            </h2>
            
            <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                    { icon: <Target className="w-6 h-6 text-blue-400" />, title: t('tutStartTitle'), desc: t('tutStartDesc') },
                    { icon: <Cpu className="w-6 h-6 text-purple-400" />, title: t('tutBotTitle'), desc: t('tutBotDesc') },
                    { icon: <KeyboardIcon className="w-6 h-6 text-emerald-400" />, title: t('tutScoreTitle'), desc: t('tutScoreDesc') },
                    { icon: <MousePointer2 className="w-6 h-6 text-yellow-400" />, title: t('tutQuickTitle'), desc: t('tutQuickDesc') },
                    { icon: <CheckCircle className="w-6 h-6 text-emerald-500" />, title: t('tutCheckoutTitle'), desc: t('tutCheckoutDesc') },
                    { icon: <Undo2 className="w-6 h-6 text-orange-400" />, title: t('tutHistoryTitle'), desc: t('tutHistoryDesc') },
                    { icon: <Mic className="w-6 h-6 text-red-400" />, title: t('tutVoiceTitle'), desc: t('tutVoiceDesc') },
                    { icon: <Cloud className="w-6 h-6 text-blue-400" />, title: t('tutCloudTitle'), desc: t('tutCloudDesc') },
                    { icon: <RefreshCw className="w-6 h-6 text-emerald-500" />, title: t('tutUpdateTitle'), desc: t('tutUpdateDesc') },
                    { icon: <User className="w-6 h-6 text-purple-400" />, title: t('tutProfileTitle'), desc: t('tutProfileDesc') }
                ].map((item, index) => (
                    <div key={index} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg flex gap-4 items-start h-full">
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 shrink-0">
                            {item.icon}
                        </div>
                        <div className="flex-1 pt-0.5">
                            <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-1">{item.title}</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                        </div>
                    </div>
                ))}
            </div>
        </main>
      )}

      {/* --- O APLIKACI --- */}
      {appState === 'about' && (
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center w-full max-w-lg mx-auto relative z-10 pb-20">
            <h2 className="text-2xl font-black text-white mb-6 tracking-widest uppercase flex items-center gap-2"><Info className="w-6 h-6 text-emerald-500"/> {t('aboutApp')}</h2>
            
            <div className="bg-slate-900 w-full p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
                <div className="text-center space-y-2 border-b border-slate-800 pb-6">
                    <div className="w-20 h-20 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-900/50">
                        <Target className="w-10 h-10 text-slate-900" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-widest">SIMPLE DART</h1>
                    <h2 className="text-emerald-500 font-bold tracking-widest text-sm">COUNTER</h2>
                    <div className="text-slate-500 font-mono text-xs mt-2">Verze {APP_VERSION}</div>
                </div>

                <div className="text-center pt-2">
                    <p className="text-slate-400 text-sm">
                        {t('aboutText')}
                    </p>
                    <button 
                        onClick={() => window.location.href = '/privacy.html'}
                        className="text-emerald-500 hover:text-emerald-400 font-bold text-sm mt-8 flex justify-center items-center gap-2 underline uppercase tracking-widest">
                        {typeof t === 'function' ? t('privacyPolicy') : 'Zásady ochrany soukromí'}
                    </button>
                </div>

                <div className="text-center text-[10px] text-slate-500 pt-4 border-t border-slate-800">
                    &copy; {new Date().getFullYear()} Vít (ViteCZech).<br/> {t('rightsReserved')}
                </div>
            </div>
        </main>
      )}

      {/* --- SETUP (NASTAVENÍ) --- */}
      {appState === 'setup' && (
        <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center w-full">
          <div className="w-full max-w-4xl space-y-4 pb-20">
            <div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-3">
                    <h3 className="text-center text-xs font-black uppercase text-slate-500 tracking-[0.2em] mb-4">SIMPLE DART COUNTER</h3>
                <div className="flex justify-between items-center mb-3"><label className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider"><User className="w-4 h-4" /> {translations[lang].players}</label><span className="flex items-center gap-1 text-slate-400 text-xs font-bold uppercase tracking-wider">{translations[lang].whoStarts} <Target className="w-4 h-4" /></span></div>
                
                <div className="flex gap-2">
                    {isPC ? (
                        <input
                            type="text"
                            value={settings.p1Name}
                            onChange={(e) => setSettings({...settings, p1Name: e.target.value})}
                            onFocus={handleP1Focus}
                            onBlur={handleP1Blur}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-colors w-full"
                            placeholder={translations[lang].p1Placeholder}
                        />
                    ) : (
                        <div onClick={() => openKeyboard('p1Name')} className={`flex-1 bg-slate-800 border ${activeKeyboardInput === 'p1Name' ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-700'} rounded-lg px-3 py-2 text-sm flex items-center cursor-pointer transition-colors relative`}>
                            {settings.p1Name || <span className="text-slate-500">{translations[lang].p1Placeholder}</span>}
                            {activeKeyboardInput === 'p1Name' && <div className="w-0.5 h-4 bg-emerald-500 animate-pulse ml-0.5"></div>}
                            <KeyboardIcon className="w-4 h-4 absolute right-3 text-slate-600" />
                        </div>
                    )}
                    
                    <button onClick={toggleMic} className={`px-3 rounded-lg border flex items-center justify-center transition-all shadow-sm ${isMicActive ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-red-900/50' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}>
                        {isMicActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </button>
                    <button onClick={()=>setSettings({...settings, startPlayer:'p1'})} className={`px-3 rounded-lg border flex items-center justify-center ${settings.startPlayer==='p1'?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-800 border-slate-700 text-slate-600'}`}><Target className="w-5 h-5" /></button>
                </div>

                <div className="flex gap-2">
                    <div className="flex-1 flex gap-2">
                        {!settings.isBot ? <>
                            {isPC ? (
                                <input
                                    type="text"
                                    value={settings.p2Name}
                                    onChange={(e) => setSettings({...settings, p2Name: e.target.value})}
                                    onFocus={handleP2Focus}
                                    onBlur={handleP2Blur}
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors min-w-0"
                                    placeholder={translations[lang].p2Placeholder}
                                />
                            ) : (
                                <div onClick={() => openKeyboard('p2Name')} className={`flex-1 bg-slate-800 border ${activeKeyboardInput === 'p2Name' ? 'border-purple-500 ring-1 ring-purple-500' : 'border-slate-700'} rounded-lg px-3 py-2 text-sm flex items-center cursor-pointer transition-colors relative`}>
                                    {settings.p2Name || <span className="text-slate-500">{translations[lang].p2Placeholder}</span>}
                                    {activeKeyboardInput === 'p2Name' && <div className="w-0.5 h-4 bg-purple-500 animate-pulse ml-0.5"></div>}
                                    <KeyboardIcon className="w-4 h-4 absolute right-3 text-slate-600" />
                                </div>
                            )}
                        </> : 
                        <button onClick={() => setShowBotLevels(!showBotLevels)} className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1 text-sm text-purple-400 font-bold flex flex-col justify-center items-start gap-0.5 relative overflow-hidden"><div className="flex items-center gap-2"><Bot className="w-4 h-4" /> <span>{settings.p2Name}</span></div><span className="text-[9px] text-slate-500 font-normal ml-6 truncate w-full text-left">{settings.botLevel === 'custom' ? `${translations[lang].diffCustom.split('(')[0]} (Avg ${settings.botAvg})` : translations[lang][`diff${settings.botLevel.charAt(0).toUpperCase() + settings.botLevel.slice(1)}`]}</span><ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 transition-transform ${showBotLevels ? 'rotate-180' : ''}`} /></button>}
                        
                        <button onClick={handleBotToggle} className={`px-3 rounded-lg border flex items-center justify-center ${settings.isBot?'bg-purple-600 border-purple-500 text-white':'bg-slate-800 border-slate-700 text-slate-500'}`}><Cpu className="w-5 h-5" /></button>
                    </div>
                    <button onClick={()=>setSettings({...settings, startPlayer:'p2'})} className={`px-3 rounded-lg border flex items-center justify-center ${settings.startPlayer==='p2'?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-800 border-slate-700 text-slate-600'}`}><Target className="w-5 h-5" /></button>
                </div>
                {settings.isBot && showBotLevels && <div className="animate-in slide-in-from-top-2 duration-300 bg-slate-800/30 p-2 rounded-lg border border-slate-700/50"><div className="grid grid-cols-1 gap-1">{['amateur', 'jelito', 'pdc', 'custom'].map(l => <button key={l} onClick={() => { setSettings({...settings, botLevel:l}); if(l!=='custom') setShowBotLevels(false); }} className={`p-1.5 rounded-md text-left text-[11px] font-bold border ${settings.botLevel===l?'bg-slate-700 border-purple-500 text-white':'bg-slate-800/50 border-slate-700 text-slate-500'}`}>{translations[lang][`diff${l.charAt(0).toUpperCase() + l.slice(1)}`]}</button>)}</div>{settings.botLevel === 'custom' && <div className="mt-3 pt-2 border-t border-slate-700/50"><div className="flex justify-between items-center mb-1"><label className="text-[10px] font-bold text-purple-400">{translations[lang].customAvg}</label><span className="text-xs font-mono font-bold text-white">{settings.botAvg}</span></div><input type="range" min="30" max="120" step="1" value={settings.botAvg} onChange={(e) => setSettings({...settings, botAvg:parseInt(e.target.value)})} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" /><button onClick={() => setShowBotLevels(false)} className="w-full mt-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-[10px] font-bold py-1 rounded border border-purple-500/30">OK</button></div>}</div>}
                </div>

                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 mt-4">
                <label className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2"><Trophy className="w-4 h-4" /> {translations[lang].matchFormat}</label>
                <div className="grid grid-cols-2 gap-3 mb-2"><button onClick={()=>setSettings({...settings, matchMode:'first_to'})} className={`p-2 rounded-lg text-left border ${settings.matchMode==='first_to'?'bg-indigo-600 border-indigo-500 text-white shadow-lg':'bg-slate-800 border-slate-700 text-slate-400'}`}><div className="font-bold text-sm">{translations[lang].firstTo}</div></button><button onClick={()=>setSettings({...settings, matchMode:'best_of'})} className={`p-2 rounded-lg text-left border ${settings.matchMode==='best_of'?'bg-indigo-600 border-indigo-500 text-white shadow-lg':'bg-slate-800 border-slate-700 text-slate-400'}`}><div className="font-bold text-sm">{translations[lang].bestOf}</div></button></div>
                <div className="grid grid-cols-5 gap-2">{(settings.matchMode === 'best_of' ? [3,5,7,9,11,13,15,17,19,21] : [1,2,3,4,5,6,7,8,9,10]).map(n => <button key={n} onClick={()=>setSettings({...settings, matchTarget:n})} className={`py-1.5 rounded font-bold border ${settings.matchTarget===n?'bg-slate-100 text-slate-900 border-white shadow-md':'bg-slate-800 border-slate-700 text-slate-400'}`}>{n}</button>)}</div>
                </div>

                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 mt-4">
                <label className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-2"><Target className="w-4 h-4" /> {translations[lang].game}</label>
                <div className="grid grid-cols-2 gap-2 mb-2">{[301, 501].map(s => <button key={s} onClick={()=>setSettings({...settings, startScore:s})} className={`py-1.5 px-3 rounded-lg font-bold border ${settings.startScore===s?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{s}</button>)}</div>
                <div className="grid grid-cols-2 gap-2">{['single', 'double'].map(m => <button key={m} onClick={()=>setSettings({...settings, outMode:m})} className={`py-1.5 px-3 rounded-lg font-bold text-sm border uppercase ${settings.outMode===m?'bg-blue-600 border-blue-500 text-white':'bg-slate-800 border-slate-700 text-slate-400'}`}>{m} OUT</button>)}</div>
                </div>

                <button onClick={startMatch} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-4 rounded-xl text-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 mt-4"><Play className="w-6 h-6 fill-current" /> {translations[lang].startMatch}</button>
            </div>
          </div>
        </main>
      )}

      {/* --- HISTORIE ZÁPASŮ --- */}
      {appState === 'history' && (
        <main className="flex-1 overflow-y-auto p-4 flex flex-col items-center w-full">
            <div className="w-full max-w-lg space-y-4 pb-20">
                <h2 className="text-2xl font-black text-white mb-6 tracking-widest uppercase flex items-center justify-center gap-2 mt-4">
                    <History className="w-6 h-6 text-emerald-500"/> {translations[lang].matchHistory}
                </h2>
                
                {(!user || user.isAnonymous) && (
                    <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl flex flex-col items-center text-center mb-4">
                        <Info className="w-6 h-6 text-blue-400 mb-2" />
                        <p className="text-xs text-blue-200 mb-3 leading-relaxed">{translations[lang].historyLoginInfo}</p>
                        <button onClick={handleLogin} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase transition-transform active:scale-95 shadow-lg">{translations[lang].historyLoginBtn}</button>
                    </div>
                )}

                <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden mt-2">
                    {(() => {
                        const myMatches = (user && !user.isAnonymous) 
                            ? matchHistory.filter(m => m.p1Id === user.uid || m.p2Id === user.uid)
                            : matchHistory;
                        
                        if (myMatches.length === 0) {
                            return <div className="p-8 text-center text-slate-500">{translations[lang].noMatches}</div>;
                        }

                        return (
                            <div className="divide-y divide-slate-800">
                                {myMatches.map(m => (
                                    <div key={m.id} className="p-4 hover:bg-slate-800/50 transition-colors flex justify-between items-center group cursor-pointer" onClick={() => setSelectedMatchDetail(m)}>
                                        <div className="flex-1">
                                            <div className="text-xs text-slate-500 mb-1">{m.date}</div>
                                            <div className="flex items-center gap-3">
                                                <div className={`font-bold ${m.matchWinner === 'p1' ? 'text-emerald-400' : 'text-slate-400'}`}>{getTranslatedName(m.p1Name, true, lang)}</div>
                                                <div className="bg-slate-950 px-3 py-0.5 rounded text-sm font-mono font-bold border border-slate-800 flex gap-1">
                                                    <span className={m.matchWinner === 'p1' ? 'text-emerald-500' : 'text-slate-500'}>{m.p1Legs}</span>
                                                    <span className="text-slate-600">-</span>
                                                    <span className={m.matchWinner === 'p2' ? 'text-purple-500' : 'text-slate-500'}>{m.p2Legs}</span>
                                                </div>
                                                <div className={`font-bold ${m.matchWinner === 'p2' ? 'text-purple-400' : 'text-slate-400'}`}>{getTranslatedName(m.p2Name, false, lang)}</div>
                                            </div>
                                        </div>
                                        <button onClick={async (e) => { 
                                            e.stopPropagation(); 
                                            setMatchHistory(p => p.filter(x => x.id !== m.id)); 
                                            if (m.docId && db && user && !offlineMode) {
                                                try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'matches', m.docId)); } catch(err) {}
                                            }
                                        }} className="p-3 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </main>
      )}

      {/* --- HRA (PLAYING / LEG FINISHED) --- */}
      {['playing', 'leg_finished'].includes(appState) && (
        <main className={`flex-1 overflow-hidden p-1 sm:p-2 grid gap-1 sm:gap-2 ${isLandscape ? 'grid-cols-[1fr_1.5fr_1fr]' : 'flex flex-col'}`}>
          
          {/* LEVÁ ČÁST / HORNÍ ČÁST (Skóre) */}
          <div className={`flex flex-col gap-1 sm:gap-2 w-full ${isLandscape ? 'h-full min-h-0' : 'h-auto shrink-0'}`}>
              {renderScoreCards()}
          </div>

          {/* STŘEDNÍ ČÁST (Klávesnice nebo Další leg) */}
          <div className="flex flex-col gap-1 min-h-0 justify-center h-full flex-1">
            {appState === 'playing' ? renderControls() : nextLegBlock}
          </div>

          {/* PRAVÁ ČÁST / SPODNÍ ČÁST (Historie) */}
          <div className={`bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden flex flex-col ${isLandscape ? 'h-full' : 'shrink-0 h-[22vh] sm:h-48'}`}>
             <div className="bg-slate-800/80 p-1.5 border-b border-slate-700 text-[9px] font-black uppercase text-center text-slate-500 tracking-widest hidden landscape:block">Historie náhozů</div>
             <div className="flex-1 overflow-hidden">
                {renderUnifiedHistory()}
             </div>
          </div>
        </main>
      )}
      
      {errorMsg && (
        <div className={`fixed bottom-10 inset-x-0 mx-auto w-[90%] max-w-sm text-white px-6 py-3 sm:px-8 sm:py-4 rounded-full font-black shadow-2xl border-2 z-[1000] animate-bounce text-center text-xs sm:text-sm uppercase tracking-widest ${isSuccessMsg ? 'bg-emerald-600 border-emerald-400' : 'bg-red-600 border-red-400'}`}>
            {String(errorMsg)}
        </div>
      )}

      {/* --- GLOBÁLNÍ UPOZORNĚNÍ NA AKTUALIZACI --- */}
      {updateAvailable && (
        <button onClick={() => window.location.reload(true)} className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black px-6 py-4 rounded-full shadow-[0_0_30px_rgba(16,185,129,1)] animate-bounce flex items-center gap-3 border-4 border-slate-900 transition-transform active:scale-95">
            <RefreshCw className="w-6 h-6 animate-spin" /> {translations[lang].updateAvailable}
        </button>
      )}
    </div>
  );
}