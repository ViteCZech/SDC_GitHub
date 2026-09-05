import { translations } from '../translations';
import { resolveRefereePerson } from './doublesReferee';

export const getTranslatedName = (name, isPlayer1, currentLang) => {
  if (!name) return '';
  const p1Defaults = [
    'Domácí',
    'Home',
    'Gospodarze',
    translations?.cs?.p1Default,
    translations?.en?.p1Default,
    translations?.pl?.p1Default,
  ];
  const p2Defaults = [
    'Hosté',
    'Away',
    'Goście',
    translations?.cs?.p2Default,
    translations?.en?.p2Default,
    translations?.pl?.p2Default,
  ];
  const botDefaults = [
    'Robot',
    'Bot',
    translations?.cs?.botDefault,
    translations?.en?.botDefault,
    translations?.pl?.botDefault,
  ];

  if (isPlayer1 && p1Defaults.includes(name)) return translations[currentLang]?.p1Default || 'Domácí';
  if (!isPlayer1 && botDefaults.includes(name)) return translations[currentLang]?.botDefault || 'Robot';
  if (!isPlayer1 && p2Defaults.includes(name)) return translations[currentLang]?.p2Default || 'Hosté';
  return name;
};

export const calculateStats = (legs, p1Name, p2Name) => {
  let p1DartsTotal = 0,
    p1ScoreTotal = 0,
    p2DartsTotal = 0,
    p2ScoreTotal = 0;
  const p1High = { '60+': 0, '100+': 0, '140+': 0, 180: 0 },
    p2High = { '60+': 0, '100+': 0, '140+': 0, 180: 0 };
  let p1HighCheck = 0,
    p2HighCheck = 0;
  const updateHigh = (s, obj) => {
    if (s === 180) obj['180']++;
    else if (s >= 140) obj['140+']++;
    else if (s >= 100) obj['100+']++;
    else if (s >= 60) obj['60+']++;
  };

  const legDetails = (legs || []).map((leg, i) => {
    const p1M = leg.history.filter((m) => m.player === 'p1');
    const p2M = leg.history.filter((m) => m.player === 'p2');
    // Bust hody se do hry nepočítají (score je jen fiktivní), proto je vynecháváme
    const p1Valid = p1M.filter((m) => !m.isBust);
    const p2Valid = p2M.filter((m) => !m.isBust);

    p1Valid.forEach((m) => updateHigh(m.score, p1High));
    p2Valid.forEach((m) => updateHigh(m.score, p2High));
    const lP1S = p1Valid.reduce((a, b) => a + (b.score || 0), 0);
    const lP2S = p2Valid.reduce((a, b) => a + (b.score || 0), 0);
    const lP1D = p1Valid.reduce((a, b) => a + (b.dartsUsed || 3), 0);
    const lP2D = p2Valid.reduce((a, b) => a + (b.dartsUsed || 3), 0);
    p1ScoreTotal += lP1S;
    p1DartsTotal += lP1D;
    p2ScoreTotal += lP2S;
    p2DartsTotal += lP2D;
    const winnerKey = leg.winner;
    const winnerName = winnerKey === 'p1' ? p1Name : p2Name;
    const winThrow = leg.history.find((m) => m.player === winnerKey && m.remaining === 0);
    const check = winThrow ? winThrow.score : 0;
    if (winnerKey === 'p1') p1HighCheck = Math.max(p1HighCheck, check);
    else p2HighCheck = Math.max(p2HighCheck, check);
    const winnerDarts = winnerKey === 'p1' ? lP1D : lP2D;
    const winnerScore = winnerKey === 'p1' ? lP1S : lP2S;
    const winnerAvg = winnerDarts > 0 ? (winnerScore / winnerDarts) * 3 : 0;
    return {
      index: i + 1,
      winner: winnerName,
      winnerKey: winnerKey,
      darts: winnerDarts,
      avg: winnerAvg,
      checkout: check,
    };
  });
  return {
    p1Avg: p1DartsTotal ? (p1ScoreTotal / p1DartsTotal) * 3 : 0,
    p2Avg: p2DartsTotal ? (p2ScoreTotal / p2DartsTotal) * 3 : 0,
    p1DartsTotal,
    p2DartsTotal,
    legDetails,
    p1High,
    p2High,
    p1HighCheckout: p1HighCheck,
    p2HighCheckout: p2HighCheck,
  };
};

export function doublesResultExtras(resultData) {
  const extras = {};
  if (resultData?.members) extras.members = resultData.members;
  if (resultData?.legStarters) extras.legStarters = resultData.legStarters;
  return extras;
}

export function loserRefereePerson(loserId, loserName, matchLike, tournamentData, extraGroups) {
  if (loserId == null) return null;
  return (
    resolveRefereePerson(loserId, {
      groups: extraGroups,
      players: tournamentData?.players,
      match: matchLike,
    }) || { id: loserId, name: String(loserName ?? loserId) }
  );
}
