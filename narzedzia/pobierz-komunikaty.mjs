// Pobiera komunikaty techniczne KSeF ze strony ministerstwa i zapisuje je w bazie Supabase.
// Uruchamiane automatycznie przez GitHub Actions (.github/workflows/komunikaty.yml).
// Wymaga zmiennych SUPABASE_URL i SUPABASE_SECRET_KEY (patrz narzedzia/supabase.mjs).

import { polaczenieSupabase } from './supabase.mjs';
import { wyciagnijOkresy } from './okresy.mjs';

const ADRES_BAZOWY = 'https://ksef.podatki.gov.pl';
const ADRES_LISTY = `${ADRES_BAZOWY}/komunikaty-techniczne/`;

function htmlNaTekst(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t ]+/g, ' ')
    .replace(/(\s*\n\s*){2,}/g, '\n')
    .trim();
}

// Użytkowników interesują tylko komunikaty dotyczące KSeF. Moduł Certyfikatów i Uprawnień
// jest częścią KSeF 2.0, choć jego komunikaty nie zawierają słowa "KSeF".
function czyDotyczyKsef(tytul, tresc) {
  return /\bKSeF\b|System\p{L}* e-Faktur|Modu\p{L}* Certyfikat\p{L}* i Uprawnie\p{L}*/iu.test(`${tytul} ${tresc}`);
}

// Komunikat jest "testowy", gdy dotyczy środowiska TEST / Demo i nie wspomina produkcji
// (np. "prace na środowisku przedprodukcyjnym (Demo) i produkcyjnym" dotyczą też produkcji).
function czyTestowy(tytul, tresc) {
  const tekst = `${tytul} ${tresc}`;
  const test = /środowisk\p{L}* (testow|przedprodukcyjn|demo)|\bDemo\b|\bTEST\b/iu.test(tekst);
  const produkcja = /(?<!przed)produkcyjn/iu.test(tekst);
  return test && !produkcja;
}

async function pobierzKomunikaty() {
  const odp = await fetch(ADRES_LISTY, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; panel-ksef; +https://github.com)' },
  });
  if (!odp.ok) throw new Error(`Strona ministerstwa zwróciła błąd ${odp.status}.`);
  const html = await odp.text();

  // Strona zawiera pełne dane (tytuł, data, treść) w osadzonym JSON-ie __NEXT_DATA__
  const dopasowanie = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!dopasowanie) throw new Error('Nie znaleziono danych komunikatów na stronie (zmienił się wygląd strony?).');
  const dane = JSON.parse(dopasowanie[1]);
  const pozycje = dane.props.pageProps.response.content.contentItems[0].content.properties;

  return pozycje
    .filter((p) => p.contentType === 'announcementItemPage')
    .map((p) => {
      const markup = (p.properties.content?.items || [])
        .map((blok) => blok.content?.properties?.richText?.markup)
        .filter(Boolean)
        .join('\n');
      const tresc = htmlNaTekst(markup);
      const tytul = p.properties.title || p.name;
      // Bez kolumny dla_klienta - przy aktualizacji nie nadpisujemy przygotowanych tekstów
      return {
        id: p.id,
        data: (p.properties.articlePublishDate || p.createDate).slice(0, 10),
        tytul,
        adres: ADRES_BAZOWY + p.route.path,
        tresc,
        testowy: czyTestowy(tytul, tresc),
        okresy: wyciagnijOkresy(`${tytul}\n${tresc}`),
      };
    });
}

const zapytanie = polaczenieSupabase();
const wszystkie = await pobierzKomunikaty();
if (!wszystkie.length) throw new Error('Strona nie zwróciła żadnych komunikatów.');

const komunikaty = wszystkie.filter((k) => czyDotyczyKsef(k.tytul, k.tresc));
const pominiete = wszystkie.filter((k) => !czyDotyczyKsef(k.tytul, k.tresc));

await zapytanie('POST', 'komunikaty?on_conflict=id', komunikaty, { Prefer: 'resolution=merge-duplicates,return=minimal' });
// Usuń z bazy komunikaty niedotyczące KSeF, jeśli trafiły tam wcześniej
if (pominiete.length) {
  await zapytanie('DELETE', `komunikaty?id=in.(${pominiete.map((k) => k.id).join(',')})`, undefined, { Prefer: 'return=minimal' });
}
await zapytanie('PATCH', 'stan?id=eq.1', { ostatnie_sprawdzenie: new Date().toISOString() }, { Prefer: 'return=minimal' });

const najnowszy = komunikaty.reduce((a, b) => (b.data > a.data ? b : a));
console.log(`Zapisano ${komunikaty.length} komunikatów o KSeF (najnowszy: ${najnowszy.data} ${najnowszy.tytul}).`);
for (const k of pominiete) console.log(`Pominięto (nie dotyczy KSeF): ${k.data} ${k.tytul}`);
