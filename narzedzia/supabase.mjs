// Połączenie z bazą Supabase przez REST API, kluczem tajnym (tylko w GitHub Actions).
//
// Wymaga zmiennych środowiskowych:
//   SUPABASE_URL         adres projektu, np. https://abcd1234.supabase.co
//   SUPABASE_SECRET_KEY  klucz tajny (sb_secret_... lub dawny service_role) - tylko w sekretach GitHuba!

export function polaczenieSupabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const klucz = process.env.SUPABASE_SECRET_KEY;
  if (!url || !klucz) throw new Error('Brak SUPABASE_URL lub SUPABASE_SECRET_KEY (ustaw je w sekretach repozytorium).');

  const naglowki = { apikey: klucz, 'Content-Type': 'application/json' };
  // Dawny klucz service_role jest tokenem JWT i musi być też w nagłówku Authorization
  if (klucz.startsWith('eyJ')) naglowki.Authorization = `Bearer ${klucz}`;

  return async (metoda, sciezka, cialo, dodatkowe = {}) => {
    const odp = await fetch(`${url}/rest/v1/${sciezka}`, {
      method: metoda,
      headers: { ...naglowki, ...dodatkowe },
      body: JSON.stringify(cialo),
    });
    if (!odp.ok) throw new Error(`Supabase: ${metoda} ${sciezka} -> ${odp.status} ${await odp.text()}`);
  };
}
