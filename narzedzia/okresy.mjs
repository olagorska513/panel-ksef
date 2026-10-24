// Wyciąga z treści komunikatu terminy przerw / utrudnień, np.
//   "16 października 2026 r. od godz. 22:00 do 17 października 2026 r. do godz. 3:00"
//   "17 czerwca 2026 r. w godzinach od 12.00 do 14.00"
//   "W dniu 22.04.2026 r. (środa) w godzinach 18.00–18.30"
// Zwraca listę { od, do } w formacie ISO (UTC); godziny w komunikatach są czasem polskim.

const MIESIACE = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

const DATA = `(\\d{1,2}\\s+(?:${MIESIACE.join('|')})\\s+\\d{4}|\\d{1,2}\\.\\d{1,2}\\.\\d{4})`;
const PO_DACIE = `\\s*(?:r\\.)?\\s*(?:\\([^)]{0,20}\\)\\s*)?,?\\s*`;
const GODZ = `(?:godz(?:iny|\\.)?|g\\.)`;
const CZAS = `(\\d{1,2}[:.]\\d{2})`;

// Dwie daty: "D od godz. HH:MM do D do godz. HH:MM"
const DWIE_DATY = new RegExp(`${DATA}${PO_DACIE}(?:od\\s+)?${GODZ}\\s*${CZAS}\\s*do\\s+${DATA}${PO_DACIE}(?:do\\s+)?${GODZ}?\\s*${CZAS}`, 'giu');
// Jeden dzień: "D w godzinach (od) HH:MM do/– HH:MM" lub "D od godz. HH:MM do godz. HH:MM"
const JEDEN_DZIEN = new RegExp(
  `${DATA}${PO_DACIE}(?:w\\s+godzinach|od\\s+${GODZ}|w\\s+${GODZ})\\s*(?:od\\s+)?${CZAS}\\s*(?:do\\s+(?:${GODZ}\\s*)?|[-–]\\s*)${CZAS}`,
  'giu'
);

function czescDaty(tekst) {
  const kropki = tekst.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (kropki) return { r: +kropki[3], m: +kropki[2], d: +kropki[1] };
  const [d, nazwa, r] = tekst.split(/\s+/);
  return { r: +r, m: MIESIACE.indexOf(nazwa.toLowerCase()) + 1, d: +d };
}

// Przesunięcie strefy Europe/Warsaw względem UTC (w minutach) w danym momencie
function przesuniecieWarszawy(ms) {
  const nazwa = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName').value; // np. "GMT+2"
  const m = nazwa.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] || 0) : 0;
}

function czasPolski(data, czas) {
  const { r, m, d } = czescDaty(data);
  const [h, min] = czas.split(/[:.]/).map(Number);
  const lokalnie = Date.UTC(r, m - 1, d, h, min); // godzina 24:00 przechodzi na następny dzień
  const utc = lokalnie - przesuniecieWarszawy(lokalnie) * 60000;
  return new Date(utc - (przesuniecieWarszawy(utc) - przesuniecieWarszawy(lokalnie)) * 60000);
}

export function wyciagnijOkresy(tekst) {
  const okresy = [];
  const zajete = [];
  const dodaj = (dopasowanie, od, doCzasu) => {
    if (zajete.some(([a, b]) => dopasowanie.index < b && dopasowanie.index + dopasowanie[0].length > a)) return;
    zajete.push([dopasowanie.index, dopasowanie.index + dopasowanie[0].length]);
    if (isNaN(od) || isNaN(doCzasu) || doCzasu <= od) return;
    okresy.push({ od: od.toISOString(), do: doCzasu.toISOString() });
  };

  for (const d of tekst.matchAll(DWIE_DATY)) dodaj(d, czasPolski(d[1], d[2]), czasPolski(d[3], d[4]));
  for (const d of tekst.matchAll(JEDEN_DZIEN)) dodaj(d, czasPolski(d[1], d[2]), czasPolski(d[1], d[3]));

  return okresy.sort((a, b) => a.od.localeCompare(b.od));
}
