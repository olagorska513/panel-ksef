// Pobiera aktualny stan KSeF z Latarni Ministerstwa Finansów i zapisuje go w bazie Supabase.
// Latarnia: https://github.com/CIRFMF/ksef-latarnia (publiczne API, bez logowania).
// Strona nie może pytać Latarni bezpośrednio z przeglądarki (brak nagłówków CORS),
// dlatego robi to GitHub Actions (.github/workflows/latarnia.yml) co 15 minut.

import { polaczenieSupabase } from './supabase.mjs';

const ADRES_LATARNI = 'https://api-latarnia.ksef.mf.gov.pl';

async function pobierz(sciezka) {
  const odp = await fetch(ADRES_LATARNI + sciezka, { headers: { Accept: 'application/json' } });
  if (!odp.ok) throw new Error(`Latarnia ${sciezka} zwróciła błąd ${odp.status}.`);
  return odp.json();
}

const zapytanie = polaczenieSupabase();
const [stan, komunikaty] = await Promise.all([pobierz('/status'), pobierz('/messages')]);

await zapytanie(
  'PATCH',
  'stan?id=eq.1',
  {
    latarnia_status: stan.status,
    latarnia_komunikaty: Array.isArray(komunikaty) ? komunikaty : [],
    latarnia_sprawdzenie: new Date().toISOString(),
  },
  { Prefer: 'return=minimal' }
);

console.log(`Latarnia: status ${stan.status}, komunikatów: ${Array.isArray(komunikaty) ? komunikaty.length : 0}.`);
