import { normalizeForSearch } from './csoRanking';

/**
 * Našeptávač místa turnaje: české kraje + okresní / statutární města,
 * plus hlavní polská města a vojvodství (UI je cs/en/pl).
 */

export const CZECH_REGIONS = [
  'Hlavní město Praha',
  'Středočeský kraj',
  'Jihočeský kraj',
  'Plzeňský kraj',
  'Karlovarský kraj',
  'Ústecký kraj',
  'Liberecký kraj',
  'Královéhradecký kraj',
  'Pardubický kraj',
  'Kraj Vysočina',
  'Jihomoravský kraj',
  'Olomoucký kraj',
  'Zlínský kraj',
  'Moravskoslezský kraj',
];

export const POLISH_REGIONS = [
  'dolnośląskie',
  'kujawsko-pomorskie',
  'lubelskie',
  'lubuskie',
  'łódzkie',
  'małopolskie',
  'mazowieckie',
  'opolskie',
  'podkarpackie',
  'podlaskie',
  'pomorskie',
  'śląskie',
  'świętokrzyskie',
  'warmińsko-mazurskie',
  'wielkopolskie',
  'zachodniopomorskie',
];

/** @type {Array<{ name: string, region: string }>} */
export const KNOWN_CITIES = [
  { name: 'Praha', region: 'Hlavní město Praha' },
  { name: 'Benešov', region: 'Středočeský kraj' },
  { name: 'Beroun', region: 'Středočeský kraj' },
  { name: 'Kladno', region: 'Středočeský kraj' },
  { name: 'Kolín', region: 'Středočeský kraj' },
  { name: 'Kutná Hora', region: 'Středočeský kraj' },
  { name: 'Mělník', region: 'Středočeský kraj' },
  { name: 'Mladá Boleslav', region: 'Středočeský kraj' },
  { name: 'Nymburk', region: 'Středočeský kraj' },
  { name: 'Příbram', region: 'Středočeský kraj' },
  { name: 'Rakovník', region: 'Středočeský kraj' },
  { name: 'Brandýs nad Labem', region: 'Středočeský kraj' },
  { name: 'České Budějovice', region: 'Jihočeský kraj' },
  { name: 'Český Krumlov', region: 'Jihočeský kraj' },
  { name: 'Jindřichův Hradec', region: 'Jihočeský kraj' },
  { name: 'Písek', region: 'Jihočeský kraj' },
  { name: 'Prachatice', region: 'Jihočeský kraj' },
  { name: 'Strakonice', region: 'Jihočeský kraj' },
  { name: 'Tábor', region: 'Jihočeský kraj' },
  { name: 'Plzeň', region: 'Plzeňský kraj' },
  { name: 'Domažlice', region: 'Plzeňský kraj' },
  { name: 'Klatovy', region: 'Plzeňský kraj' },
  { name: 'Rokycany', region: 'Plzeňský kraj' },
  { name: 'Tachov', region: 'Plzeňský kraj' },
  { name: 'Karlovy Vary', region: 'Karlovarský kraj' },
  { name: 'Cheb', region: 'Karlovarský kraj' },
  { name: 'Sokolov', region: 'Karlovarský kraj' },
  { name: 'Ústí nad Labem', region: 'Ústecký kraj' },
  { name: 'Děčín', region: 'Ústecký kraj' },
  { name: 'Chomutov', region: 'Ústecký kraj' },
  { name: 'Litoměřice', region: 'Ústecký kraj' },
  { name: 'Louny', region: 'Ústecký kraj' },
  { name: 'Most', region: 'Ústecký kraj' },
  { name: 'Teplice', region: 'Ústecký kraj' },
  { name: 'Liberec', region: 'Liberecký kraj' },
  { name: 'Česká Lípa', region: 'Liberecký kraj' },
  { name: 'Jablonec nad Nisou', region: 'Liberecký kraj' },
  { name: 'Semily', region: 'Liberecký kraj' },
  { name: 'Turnov', region: 'Liberecký kraj' },
  { name: 'Hradec Králové', region: 'Královéhradecký kraj' },
  { name: 'Jičín', region: 'Královéhradecký kraj' },
  { name: 'Náchod', region: 'Královéhradecký kraj' },
  { name: 'Rychnov nad Kněžnou', region: 'Královéhradecký kraj' },
  { name: 'Trutnov', region: 'Královéhradecký kraj' },
  { name: 'Pardubice', region: 'Pardubický kraj' },
  { name: 'Chrudim', region: 'Pardubický kraj' },
  { name: 'Svitavy', region: 'Pardubický kraj' },
  { name: 'Ústí nad Orlicí', region: 'Pardubický kraj' },
  { name: 'Jihlava', region: 'Kraj Vysočina' },
  { name: 'Havlíčkův Brod', region: 'Kraj Vysočina' },
  { name: 'Pelhřimov', region: 'Kraj Vysočina' },
  { name: 'Třebíč', region: 'Kraj Vysočina' },
  { name: 'Žďár nad Sázavou', region: 'Kraj Vysočina' },
  { name: 'Brno', region: 'Jihomoravský kraj' },
  { name: 'Blansko', region: 'Jihomoravský kraj' },
  { name: 'Břeclav', region: 'Jihomoravský kraj' },
  { name: 'Hodonín', region: 'Jihomoravský kraj' },
  { name: 'Vyškov', region: 'Jihomoravský kraj' },
  { name: 'Znojmo', region: 'Jihomoravský kraj' },
  { name: 'Olomouc', region: 'Olomoucký kraj' },
  { name: 'Jeseník', region: 'Olomoucký kraj' },
  { name: 'Prostějov', region: 'Olomoucký kraj' },
  { name: 'Přerov', region: 'Olomoucký kraj' },
  { name: 'Šumperk', region: 'Olomoucký kraj' },
  { name: 'Zlín', region: 'Zlínský kraj' },
  { name: 'Kroměříž', region: 'Zlínský kraj' },
  { name: 'Uherské Hradiště', region: 'Zlínský kraj' },
  { name: 'Vsetín', region: 'Zlínský kraj' },
  { name: 'Uherský Brod', region: 'Zlínský kraj' },
  { name: 'Ostrava', region: 'Moravskoslezský kraj' },
  { name: 'Bruntál', region: 'Moravskoslezský kraj' },
  { name: 'Frýdek-Místek', region: 'Moravskoslezský kraj' },
  { name: 'Havířov', region: 'Moravskoslezský kraj' },
  { name: 'Karviná', region: 'Moravskoslezský kraj' },
  { name: 'Nový Jičín', region: 'Moravskoslezský kraj' },
  { name: 'Opava', region: 'Moravskoslezský kraj' },
  { name: 'Třinec', region: 'Moravskoslezský kraj' },
  { name: 'Warszawa', region: 'mazowieckie' },
  { name: 'Kraków', region: 'małopolskie' },
  { name: 'Wrocław', region: 'dolnośląskie' },
  { name: 'Poznań', region: 'wielkopolskie' },
  { name: 'Gdańsk', region: 'pomorskie' },
  { name: 'Szczecin', region: 'zachodniopomorskie' },
  { name: 'Łódź', region: 'łódzkie' },
  { name: 'Katowice', region: 'śląskie' },
  { name: 'Lublin', region: 'lubelskie' },
  { name: 'Bydgoszcz', region: 'kujawsko-pomorskie' },
  { name: 'Białystok', region: 'podlaskie' },
  { name: 'Rzeszów', region: 'podkarpackie' },
  { name: 'Kielce', region: 'świętokrzyskie' },
  { name: 'Olsztyn', region: 'warmińsko-mazurskie' },
  { name: 'Opole', region: 'opolskie' },
  { name: 'Zielona Góra', region: 'lubuskie' },
  { name: 'Gdynia', region: 'pomorskie' },
  { name: 'Toruń', region: 'kujawsko-pomorskie' },
  { name: 'Częstochowa', region: 'śląskie' },
];

/** @type {Array<{ name: string, hint?: string }>} */
export const REGION_SUGGESTIONS = [...CZECH_REGIONS, ...POLISH_REGIONS].map((name) => ({
  name,
}));

/**
 * @param {Array<{ name: string, hint?: string, region?: string }>} items
 * @returns {Array<{ name: string, hint?: string, region?: string }>}
 */
export function uniquePlaces(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const name = String(item?.name ?? '').trim();
    if (!name) continue;
    const key = normalizeForSearch(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      hint: item.hint || item.region || '',
      region: item.region || item.hint || '',
    });
  }
  return out;
}

/**
 * @param {Array<{ name: string, hint?: string, region?: string }>} items
 * @param {string} query
 * @param {{ emptyShowsAll?: boolean, limit?: number }} [opts]
 * @returns {Array<{ name: string, hint?: string, region?: string }>}
 */
export function filterPlaces(items, query, opts = {}) {
  const limit = opts.limit ?? 12;
  const q = normalizeForSearch(query);
  const list = uniquePlaces(items);
  if (!q) {
    return opts.emptyShowsAll ? list.slice(0, Math.max(limit, 16)) : [];
  }
  const ranked = [];
  for (const item of list) {
    const nameKey = normalizeForSearch(item.name);
    const hintKey = normalizeForSearch(item.hint || item.region || '');
    if (nameKey === q) ranked.push({ item, score: 0 });
    else if (nameKey.startsWith(q)) ranked.push({ item, score: 1 });
    else if (nameKey.includes(q) || hintKey.includes(q) || hintKey.startsWith(q)) {
      ranked.push({ item, score: 2 });
    }
  }
  ranked.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, 'cs'));
  return ranked.slice(0, limit).map((r) => r.item);
}

/**
 * @param {string} cityName
 * @param {Array<{ name: string, region?: string }>} [extra]
 * @returns {string|null}
 */
export function regionForCity(cityName, extra = []) {
  const key = normalizeForSearch(cityName);
  if (!key) return null;
  const hit = uniquePlaces([...KNOWN_CITIES, ...extra]).find(
    (c) => normalizeForSearch(c.name) === key
  );
  const region = String(hit?.region || hit?.hint || '').trim();
  return region || null;
}
