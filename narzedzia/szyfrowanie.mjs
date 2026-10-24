// Wspólne funkcje szyfrujące. Używają Web Crypto - tego samego mechanizmu co przeglądarka
// w strona/app.js, dzięki czemu dane zaszyfrowane tutaj da się odszyfrować na stronie.

import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KATALOG_PROJEKTU = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLIK_KLUCZA = path.join(KATALOG_PROJEKTU, '.klucz-danych');
export const ITERACJE_PBKDF2 = 600000;

export const doBase64 = (bajty) => Buffer.from(bajty).toString('base64');
export const zBase64 = (tekst) => new Uint8Array(Buffer.from(tekst, 'base64'));

// Klucz danych: z GitHuba (sekret KLUCZ_DANYCH) albo z lokalnego pliku .klucz-danych
export function wczytajKluczDanych() {
  const tekst = process.env.KLUCZ_DANYCH || (fs.existsSync(PLIK_KLUCZA) ? fs.readFileSync(PLIK_KLUCZA, 'utf8') : '');
  const klucz = zBase64(tekst.trim());
  if (klucz.length !== 32) {
    throw new Error('Brak klucza danych. Ustaw sekret KLUCZ_DANYCH albo utwórz plik .klucz-danych (narzedzia/uzytkownicy.mjs klucz).');
  }
  return klucz;
}

// Loginy nie są zapisywane jawnie w publicznym repozytorium - tylko ich skrót (SHA-256).
// Ta sama funkcja jest w strona/app.js.
export async function identyfikatorLoginu(login) {
  const skrot = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('panel-ksef:' + login.trim().toLowerCase()));
  return Buffer.from(skrot).toString('hex');
}

export function nowyKluczDanych() {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function kluczAes(surowy) {
  return crypto.subtle.importKey('raw', surowy, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function zaszyfruj(surowyKlucz, tekst) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const szyfr = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kluczAes(surowyKlucz), new TextEncoder().encode(tekst));
  return { iv: doBase64(iv), dane: doBase64(new Uint8Array(szyfr)) };
}

async function kluczZHasla(haslo, sol, iteracje) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(haslo), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sol, iterations: iteracje },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Zapisuje klucz danych zaszyfrowany hasłem użytkownika (do pliku uzytkownicy.json)
export async function opakujKlucz(surowyKlucz, haslo) {
  const sol = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const klucz = await kluczZHasla(haslo, sol, ITERACJE_PBKDF2);
  const szyfr = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, surowyKlucz);
  return { sol: doBase64(sol), iteracje: ITERACJE_PBKDF2, iv: doBase64(iv), klucz: doBase64(new Uint8Array(szyfr)) };
}

// Odtwarza klucz danych z hasła - używane do sprawdzenia, czy konto działa
export async function odpakujKlucz(wpis, haslo) {
  const klucz = await kluczZHasla(haslo, zBase64(wpis.sol), wpis.iteracje);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: zBase64(wpis.iv) }, klucz, zBase64(wpis.klucz)));
}

export function wygenerujHaslo(dlugosc = 14) {
  const znaki = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Odrzucamy wartości powyżej wielokrotności długości alfabetu, żeby każdy znak był równie prawdopodobny
  const limit = 256 - (256 % znaki.length);
  let haslo = '';
  while (haslo.length < dlugosc) {
    for (const b of crypto.getRandomValues(new Uint8Array(dlugosc * 2))) {
      if (b < limit && haslo.length < dlugosc) haslo += znaki[b % znaki.length];
    }
  }
  return haslo;
}
