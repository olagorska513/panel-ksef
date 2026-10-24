// Pobiera komunikaty techniczne KSeF ze strony ministerstwa i zapisuje je zaszyfrowane
// w strona/dane.enc.json. Uruchamiane automatycznie przez GitHub Actions (.github/workflows/strona.yml).
//
// Użycie lokalne:  node narzedzia/pobierz-komunikaty.mjs

import fs from 'node:fs';
import path from 'node:path';
import { KATALOG_PROJEKTU, wczytajKluczDanych, zaszyfruj } from './szyfrowanie.mjs';

const ADRES_BAZOWY = 'https://ksef.podatki.gov.pl';
const ADRES_LISTY = `${ADRES_BAZOWY}/komunikaty-techniczne/`;
const PLIK_WYNIKU = path.join(KATALOG_PROJEKTU, 'strona', 'dane.enc.json');

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

function czyTestowy(tytul, tresc) {
  return /środowisk\w* (testow|przedprodukcyjn|demo)|\bDemo\b|\bTEST\b/i.test(`${tytul} ${tresc}`);
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
      return {
        id: p.id,
        data: (p.properties.articlePublishDate || p.createDate).slice(0, 10),
        tytul,
        adres: ADRES_BAZOWY + p.route.path,
        tresc,
        testowy: czyTestowy(tytul, tresc),
        dlaKlienta: null,
      };
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

const klucz = wczytajKluczDanych();
const komunikaty = await pobierzKomunikaty();
const wynik = { ostatnieSprawdzenie: new Date().toISOString(), komunikaty };

fs.mkdirSync(path.dirname(PLIK_WYNIKU), { recursive: true });
fs.writeFileSync(PLIK_WYNIKU, JSON.stringify({ wersja: 1, ...(await zaszyfruj(klucz, JSON.stringify(wynik))) }));
console.log(`Pobrano ${komunikaty.length} komunikatów (najnowszy: ${komunikaty[0]?.data} ${komunikaty[0]?.tytul}).`);
