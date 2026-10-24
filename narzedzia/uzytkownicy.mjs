// Zarządzanie kontami do strony Panel KSeF.
//
//   node narzedzia/uzytkownicy.mjs klucz                  tworzy klucz danych (jednorazowo, przy zakładaniu projektu)
//   node narzedzia/uzytkownicy.mjs dodaj <login>          dodaje konto i wypisuje hasło do przekazania
//   node narzedzia/uzytkownicy.mjs nowe-haslo <login>     nadaje nowe hasło (stare przestaje działać)
//   node narzedzia/uzytkownicy.mjs usun <login>           usuwa konto
//   node narzedzia/uzytkownicy.mjs lista                  pokazuje loginy
//
// Dodaj --opublikuj, aby od razu wysłać zmianę na GitHuba (git commit + push).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  KATALOG_PROJEKTU, PLIK_KLUCZA, doBase64, nowyKluczDanych, wczytajKluczDanych, opakujKlucz, odpakujKlucz, wygenerujHaslo,
  identyfikatorLoginu,
} from './szyfrowanie.mjs';

// Publiczny plik na stronie: skrót loginu -> klucz danych zaszyfrowany hasłem
const PLIK_UZYTKOWNICY = path.join(KATALOG_PROJEKTU, 'strona', 'uzytkownicy.json');
// Lokalna lista loginów (nie trafia na GitHuba)
const PLIK_LOGINOW = path.join(KATALOG_PROJEKTU, '.loginy.json');
const ADRES_STRONY_PLIK = path.join(KATALOG_PROJEKTU, '.adres-strony');

const [polecenie, loginArg, ...reszta] = process.argv.slice(2);
const opublikuj = reszta.includes('--opublikuj') || process.argv.includes('--opublikuj');
const login = loginArg && !loginArg.startsWith('--') ? loginArg.trim().toLowerCase() : null;

function wczytajPlik(plik) {
  return fs.existsSync(plik) ? JSON.parse(fs.readFileSync(plik, 'utf8')) : {};
}

function zapiszPlik(plik, dane) {
  const posortowane = Object.fromEntries(Object.entries(dane).sort(([a], [b]) => a.localeCompare(b, 'pl')));
  fs.writeFileSync(plik, JSON.stringify(posortowane, null, 2) + '\n');
}

function wymagajLoginu() {
  if (!login || !/^[\p{L}\p{N}._-]{3,40}$/u.test(login)) {
    console.error('Podaj poprawny login: 3-40 znaków (litery, cyfry, kropka, myślnik, podkreślnik).');
    process.exit(1);
  }
}

function wyslijNaGitHuba(opis) {
  if (!opublikuj) {
    console.log('\nZmiana zapisana lokalnie. Aby ją opublikować, uruchom polecenie z --opublikuj.');
    return;
  }
  const git = (...arg) => execFileSync('git', arg, { cwd: KATALOG_PROJEKTU, stdio: 'inherit' });
  git('add', 'strona/uzytkownicy.json');
  git('commit', '-m', opis);
  git('push');
  console.log('\nWysłano na GitHuba. Strona zaktualizuje się w ciągu 1-2 minut.');
}

async function pokazDane(login, haslo) {
  const adres = fs.existsSync(ADRES_STRONY_PLIK) ? fs.readFileSync(ADRES_STRONY_PLIK, 'utf8').trim() : '(adres strony)';
  console.log('\n----- Przekaż tej osobie -----');
  console.log(`Adres:  ${adres}`);
  console.log(`Login:  ${login}`);
  console.log(`Hasło:  ${haslo}`);
  console.log('------------------------------');
}

const uzytkownicy = wczytajPlik(PLIK_UZYTKOWNICY);
const loginy = wczytajPlik(PLIK_LOGINOW);
const id = login ? await identyfikatorLoginu(login) : null;

switch (polecenie) {
  case 'klucz': {
    if (fs.existsSync(PLIK_KLUCZA)) {
      console.error('Klucz danych już istnieje (.klucz-danych). Nie nadpisuję go.');
      process.exit(1);
    }
    fs.writeFileSync(PLIK_KLUCZA, doBase64(nowyKluczDanych()) + '\n');
    console.log('Utworzono klucz danych w pliku .klucz-danych. Ten plik NIE trafia na GitHuba.');
    break;
  }

  case 'dodaj':
  case 'nowe-haslo': {
    wymagajLoginu();
    const istnieje = !!uzytkownicy[id];
    if (polecenie === 'dodaj' && istnieje) {
      console.error(`Konto "${login}" już istnieje. Aby nadać nowe hasło, użyj: nowe-haslo ${login}`);
      process.exit(1);
    }
    if (polecenie === 'nowe-haslo' && !istnieje) {
      console.error(`Nie ma konta "${login}".`);
      process.exit(1);
    }
    const klucz = wczytajKluczDanych();
    const haslo = wygenerujHaslo();
    const wpis = await opakujKlucz(klucz, haslo);
    // Kontrola: hasło rzeczywiście otwiera dane
    if (doBase64(await odpakujKlucz(wpis, haslo)) !== doBase64(klucz)) throw new Error('Kontrola szyfrowania nie powiodła się.');
    uzytkownicy[id] = wpis;
    zapiszPlik(PLIK_UZYTKOWNICY, uzytkownicy);
    loginy[login] = { utworzono: loginy[login]?.utworzono || new Date().toISOString().slice(0, 10) };
    zapiszPlik(PLIK_LOGINOW, loginy);
    console.log(polecenie === 'dodaj' ? `Dodano konto "${login}".` : `Nadano nowe hasło dla "${login}".`);
    await pokazDane(login, haslo);
    wyslijNaGitHuba(polecenie === 'dodaj' ? `Dodano użytkownika ${login}` : `Nowe hasło dla użytkownika ${login}`);
    break;
  }

  case 'usun': {
    wymagajLoginu();
    if (!uzytkownicy[id]) {
      console.error(`Nie ma konta "${login}".`);
      process.exit(1);
    }
    delete uzytkownicy[id];
    zapiszPlik(PLIK_UZYTKOWNICY, uzytkownicy);
    delete loginy[login];
    zapiszPlik(PLIK_LOGINOW, loginy);
    console.log(`Usunięto konto "${login}".`);
    wyslijNaGitHuba(`Usunięto użytkownika ${login}`);
    break;
  }

  case 'lista': {
    const lista = Object.entries(loginy);
    if (!lista.length) console.log('Brak kont na liście lokalnej.');
    for (const [l, u] of lista) {
      const aktywne = uzytkownicy[await identyfikatorLoginu(l)] ? '' : '  [brak na stronie]';
      console.log(`${l}  (utworzono ${u.utworzono || '?'})${aktywne}`);
    }
    if (Object.keys(uzytkownicy).length > lista.length) {
      console.log(`Kont na stronie: ${Object.keys(uzytkownicy).length} (część utworzona na innym komputerze).`);
    }
    break;
  }

  default:
    console.log('Polecenia: klucz | dodaj <login> | nowe-haslo <login> | usun <login> | lista   [--opublikuj]');
    process.exit(1);
}
