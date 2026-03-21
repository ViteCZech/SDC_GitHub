/**
 * Web Speech API – sdílená normalizace, mapování mluvených čísel a povely (CS/EN/PL).
 */

export const SPEECH_LANG_MAP = {
  cs: 'cs-CZ',
  en: 'en-US',
  pl: 'pl-PL',
};

const IMPOSSIBLE_SCORES = [163, 166, 169, 172, 173, 175, 176, 178, 179];

/** trim, lower, odstranění běžné interpunkce, zjednodušení mezer */
export function normalizeSpeechCommand(raw) {
  if (raw == null) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ');
}

export function stripDiacritics(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Porovnání s frázemi (malá písmena, bez diakritiky pro tolerantní match).
 */
export function matchesAnyPhrase(normalizedText, phrases) {
  const n = normalizedText;
  const na = stripDiacritics(n);
  return phrases.some((p) => {
    const pl = String(p).toLowerCase();
    return n.includes(pl) || na.includes(stripDiacritics(pl));
  });
}

/** Jednotný slovník povelů (všechny jazyky v jednom poli) */
export const VOICE_PHRASES = {
  undo: [
    'zpět',
    'zpet',
    'krok zpět',
    'krok zpet',
    'undo',
    'back',
    'cofnij',
    'wstecz',
    'cofnij rzut',
    'take back',
    'vrátit',
    'vratit',
  ],
  nextLeg: [
    'další leg',
    'dalsi leg',
    'next leg',
    'pokračovat',
    'pokracovat',
    'continue',
    'kolejny leg',
    'następny leg',
    'nastepny leg',
    'dalej',
    'next',
    'další kolo',
    'dalsi kolo',
    'new leg',
  ],
  rematch: [
    'odveta',
    'znovu',
    'rematch',
    'play again',
    'rewanż',
    'rewanz',
    'jeszcze raz',
    'again',
    'replay',
    'od nowa',
    'jeszcze jeden raz',
    'once more',
  ],
  bust: [
    'bust',
    'přehoz',
    'prehoz',
    'přes',
    'pres',
    'moc',
    'trop',
    'fura',
    'over',
    'overshoot',
    'przekroczenie',
    'za dużo',
    'za duzo',
  ],
};

/** Fráze typu „zavřeno na …“ – doplněno o EN/PL; lze sloučit s překlady z UI */
export const CHECKOUT_VOICE_PHRASES = [
  'zavřeno',
  'zavreno',
  'checkout',
  'check out',
  'zamkni',
  'finish',
  'zamknij',
  'zakoncz',
  'zakończ',
  'koniec',
  'closed',
];

/**
 * Hodnota přehození pro aktuální skóre (stejná logika jako BUST v UI).
 */
export function getBustPointsForActiveScore(activeScore) {
  let pts = activeScore + 1;
  while (pts <= 180 && IMPOSSIBLE_SCORES.includes(pts)) pts += 1;
  return pts <= 180 ? pts : Math.min(180, activeScore + 1);
}

function asciiKey(s) {
  return stripDiacritics(String(s).toLowerCase().trim());
}

/** Jednoslovné / krátké mapování po normalizaci + ASCII */
function buildWordToNum() {
  const m = {};
  const add = (words, n) => {
    words.forEach((w) => {
      const k = asciiKey(w);
      m[k] = n;
    });
  };

  add(
    [
      'nula',
      'mimo',
      'vedle',
      'nic',
      'zero',
      'miss',
      'pudło',
      'pudlo',
      'nothing',
      'brak',
    ],
    0,
  );

  add(['jedna', 'jeden', 'one', 'raz', 'jedynka'], 1);
  add(['dva', 'dve', 'dwa', 'two', 'dwójka', 'dwojka'], 2);
  add(['tři', 'tri', 'trzy', 'three', 'trójka', 'trojka'], 3);
  add(['čtyři', 'ctyri', 'cztery', 'four', 'czwórka', 'czworka'], 4);
  add(['pět', 'pet', 'pięć', 'piec', 'five'], 5);
  add(['šest', 'sest', 'sześć', 'szesc', 'six'], 6);
  add(['sedm', 'siedem', 'seven'], 7);
  add(['osm', 'osiem', 'eight'], 8);
  add(['devět', 'devet', 'dziewięć', 'dziewiec', 'nine'], 9);
  add(['deset', 'dziesięć', 'dziesiec', 'ten'], 10);

  add(['jedenáct', 'jedenact', 'jedenaście', 'jedenascie', 'eleven'], 11);
  add(['dvanáct', 'dvanact', 'dwanaście', 'dwanascie', 'twelve'], 12);
  add(['třináct', 'trinact', 'trzynaście', 'trzynascie', 'thirteen'], 13);
  add(['čtrnáct', 'ctrnact', 'czternaście', 'czternascie', 'fourteen'], 14);
  add(['patnáct', 'patnact', 'piętnaście', 'pietnascie', 'fifteen'], 15);
  add(['šestnáct', 'sestnact', 'szesnaście', 'szesnascie', 'sixteen'], 16);
  add(['sedmnáct', 'sedmnact', 'siedemnaście', 'siedemnascie', 'seventeen'], 17);
  add(['osmnáct', 'osmnact', 'osiemnaście', 'osiemnascie', 'eighteen'], 18);
  add(['devatenáct', 'devatenact', 'dziewiętnaście', 'dziewietnascie', 'nineteen'], 19);

  add(
    [
      'dvacet',
      'dvacítka',
      'dvacitka',
      'twenty',
      'dwadzieścia',
      'dwadziescia',
      'dwudziestka',
    ],
    20,
  );
  add(
    [
      'třicet',
      'tricet',
      'třicítka',
      'tricitka',
      'thirty',
      'trzydzieści',
      'trzydziesci',
      'trzydziestka',
    ],
    30,
  );
  add(
    [
      'čtyřicet',
      'ctyricet',
      'čtyřicítka',
      'ctyricitka',
      'forty',
      'czterdzieści',
      'czterdziesci',
      'czterdziestka',
    ],
    40,
  );
  add(
    [
      'padesát',
      'padesat',
      'fifty',
      'pięćdziesiąt',
      'piecdziesiat',
      'pięćdziesiąt',
    ],
    50,
  );
  add(
    [
      'šedesát',
      'sedesat',
      'sixty',
      'sześćdziesiąt',
      'szescdziesiat',
    ],
    60,
  );
  add(
    [
      'sedmdesát',
      'sedmdesat',
      'seventy',
      'siedemdziesiąt',
      'siedemdziesiat',
    ],
    70,
  );
  add(
    [
      'osmdesát',
      'osmdesat',
      'eighty',
      'osiemdziesiąt',
      'osiemdziesiat',
    ],
    80,
  );
  add(
    [
      'devadesát',
      'devadesat',
      'ninety',
      'dziewięćdziesiąt',
      'dziewiecdziesiat',
    ],
    90,
  );

  add(['bull', 'bullseye', 'býčí oko', 'byci oko', 'centrum'], 50);

  add(
    [
      'sto',
      'stovka',
      'jednosto',
      'jedno sto',
      'kilo',
      'hundred',
      'one hundred',
      'a hundred',
      'stówa',
      'stowa',
      'set',
      'sto punktów',
      'sto punktow',
    ],
    100,
  );

  return m;
}

const WORD_TO_NUM = buildWordToNum();

/** Víceslovné přesné fráze (řazeno podle délky – nejdelší první) */
function buildExactScorePhrases() {
  const pairs = [];

  const addCsSto = (suffix, val) => {
    pairs.push([`sto ${suffix}`, val]);
  };

  const csSuf = {
    osmdesat: 180,
    sedmdesat: 170,
    sedesat: 160,
    padesat: 150,
    ctyricet: 140,
    tricet: 130,
    dvacet: 120,
    deset: 110,
  };
  Object.entries(csSuf).forEach(([suf, val]) => addCsSto(suf, val));

  const enHundred = {
    eighty: 180,
    seventy: 170,
    sixty: 160,
    fifty: 150,
    forty: 140,
    thirty: 130,
    twenty: 120,
    ten: 110,
  };
  Object.entries(enHundred).forEach(([suf, val]) => {
    pairs.push([`one hundred ${suf}`, val]);
    pairs.push([`a hundred ${suf}`, val]);
  });

  const plSto = {
    osiemdziesiat: 180,
    siedemdziesiat: 170,
    szescdziesiat: 160,
    piecdziesiat: 150,
    czterdziesci: 140,
    trzydziesci: 130,
    dwadziescia: 120,
    dziesiec: 110,
  };
  Object.entries(plSto).forEach(([suf, val]) => {
    pairs.push([`sto ${suf}`, val]);
  });

  const misc = [
    ['sto', 100],
    ['hundred', 100],
    ['one hundred', 100],
    ['a hundred', 100],
    ['sto punktów', 100],
    ['sto punktow', 100],
    ['forty five', 45],
    ['czterdzieści pięć', 45],
    ['czterdziesci piec', 45],
    ['čtyřicet pět', 45],
    ['ctyricet pet', 45],
    ['triple twenty', 60],
    ['tri twenty', 60],
  ];
  misc.forEach(([a, b]) => pairs.push([a, b]));

  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const EXACT_SCORE_PHRASES = buildExactScorePhrases();

/**
 * Převod mluveného textu na číslo skóre (0–180) nebo počet šipek (1–3).
 */
export function parseNumberFromSpeech(transcript) {
  if (transcript == null || transcript === '') return null;

  const raw = String(transcript).trim();
  const digitMatch = raw.match(/\d+/g);
  if (digitMatch) {
    const n = parseInt(digitMatch.join(''), 10);
    if (!Number.isNaN(n)) return n;
  }

  const cmd = normalizeSpeechCommand(raw);
  if (!cmd) return null;

  const ascii = stripDiacritics(cmd);

  for (const [phrase, val] of EXACT_SCORE_PHRASES) {
    const p = phrase.toLowerCase();
    const pAscii = stripDiacritics(p);
    if (cmd.includes(p) || ascii.includes(pAscii) || ascii.includes(stripDiacritics(p))) {
      return val;
    }
  }

  const tokens = ascii.split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (WORD_TO_NUM[w] != null) return WORD_TO_NUM[w];
  }

  if (tokens.length >= 2) {
    const a = tokens[0];
    const b = tokens[1];
    if (WORD_TO_NUM[a] != null && WORD_TO_NUM[b] != null) {
      const va = WORD_TO_NUM[a];
      const vb = WORD_TO_NUM[b];
      if (va >= 20 && va <= 90 && va % 10 === 0 && vb >= 1 && vb <= 9) {
        return va + vb;
      }
    }
  }

  return null;
}

export function matchesRematchPhrase(normalizedText) {
  return matchesAnyPhrase(normalizedText, VOICE_PHRASES.rematch);
}
