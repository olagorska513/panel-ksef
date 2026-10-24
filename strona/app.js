'use strict';

// Panel KSeF - strona statyczna (GitHub Pages).
// Komunikaty są zaszyfrowane (dane.enc.json). Klucz do nich jest zapisany w uzytkownicy.json
// osobno dla każdego konta, zaszyfrowany hasłem tego konta - bez poprawnego hasła nie da się
// odczytać treści.

const NA_STRONE = 20;
const DNI_NOWY = 7;
const KLUCZ_SESJI = 'panel-ksef-sesja';

const stan = {
  login: null,
  klucz: null,
  dane: { ostatnieSprawdzenie: null, komunikaty: [] },
  limit: NA_STRONE,
};

const $ = (id) => document.getElementById(id);

// ---------- Szyfrowanie (Web Crypto) ----------

const zBase64 = (tekst) => Uint8Array.from(atob(tekst), (c) => c.charCodeAt(0));
const doBase64 = (bajty) => btoa(String.fromCharCode(...bajty));

// Loginy są zapisane w uzytkownicy.json jako skrót SHA-256 (ta sama funkcja jest w narzedzia/szyfrowanie.mjs)
async function identyfikatorLoginu(login) {
  const skrot = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('panel-ksef:' + login.trim().toLowerCase()));
  return Array.from(new Uint8Array(skrot), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function odpakujKlucz(wpis, haslo) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(haslo), 'PBKDF2', false, ['deriveKey']);
  const kluczHasla = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: zBase64(wpis.sol), iterations: wpis.iteracje },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const surowy = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: zBase64(wpis.iv) }, kluczHasla, zBase64(wpis.klucz));
  return new Uint8Array(surowy);
}

async function odszyfrujDane(surowyKlucz, plik) {
  const klucz = await crypto.subtle.importKey('raw', surowyKlucz, 'AES-GCM', false, ['decrypt']);
  const tekst = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: zBase64(plik.iv) }, klucz, zBase64(plik.dane));
  return JSON.parse(new TextDecoder().decode(tekst));
}

async function pobierzJson(adres) {
  const odp = await fetch(`${adres}?t=${Date.now()}`, { cache: 'no-store' });
  if (!odp.ok) throw new Error(`Nie udało się pobrać ${adres} (${odp.status}).`);
  return odp.json();
}

// ---------- Sesja ----------

function zapiszSesje() {
  try {
    sessionStorage.setItem(KLUCZ_SESJI, JSON.stringify({ login: stan.login, klucz: doBase64(stan.klucz) }));
  } catch { /* bez sesji trzeba będzie zalogować się po odświeżeniu */ }
}

function wczytajSesje() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KLUCZ_SESJI));
    return s && s.login && s.klucz ? { login: s.login, klucz: zBase64(s.klucz) } : null;
  } catch {
    return null;
  }
}

function usunSesje() {
  try {
    sessionStorage.removeItem(KLUCZ_SESJI);
  } catch { /* nic */ }
}

// ---------- Pomocnicze ----------

function formatujDate(iso) {
  if (!iso) return '—';
  const [r, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${r}`;
}

function formatujDateCzas(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dniTemu(iso) {
  return Math.floor((Date.now() - new Date(iso.slice(0, 10) + 'T00:00:00').getTime()) / 86400000);
}

function opisDni(n) {
  if (n <= 0) return 'dzisiaj';
  if (n === 1) return 'wczoraj';
  return `${n} dni temu`;
}

let czasPowiadomienia;
function powiadom(tekst) {
  const el = $('powiadomienie');
  el.textContent = tekst;
  el.hidden = false;
  clearTimeout(czasPowiadomienia);
  czasPowiadomienia = setTimeout(() => (el.hidden = true), 3500);
}

// ---------- Logowanie ----------

function pokazLogowanie() {
  $('widok-aplikacji').hidden = true;
  $('widok-logowania').hidden = false;
  $('logowanie-blad').hidden = true;
  $('pole-login').focus();
}

$('formularz-logowania').addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = $('pole-login').value.trim().toLowerCase();
  const haslo = $('pole-haslo').value;
  const blad = $('logowanie-blad');
  const przycisk = $('przycisk-logowania');
  blad.hidden = true;
  przycisk.disabled = true;
  przycisk.textContent = 'Logowanie…';

  try {
    const uzytkownicy = await pobierzJson('uzytkownicy.json');
    const id = await identyfikatorLoginu(login);
    const wpis = Object.hasOwn(uzytkownicy, id) ? uzytkownicy[id] : null;
    let klucz = null;
    if (wpis) klucz = await odpakujKlucz(wpis, haslo).catch(() => null);
    if (!klucz) throw new Error('Niepoprawny login lub hasło.');

    stan.login = login;
    stan.klucz = klucz;
    zapiszSesje();
    $('pole-haslo').value = '';
    await uruchomAplikacje();
  } catch (err) {
    blad.textContent = err.message;
    blad.hidden = false;
  } finally {
    przycisk.disabled = false;
    przycisk.textContent = 'Zaloguj';
  }
});

$('przycisk-wyloguj').addEventListener('click', () => {
  usunSesje();
  stan.login = null;
  stan.klucz = null;
  stan.dane = { ostatnieSprawdzenie: null, komunikaty: [] };
  pokazLogowanie();
});

// ---------- Aplikacja ----------

async function uruchomAplikacje() {
  $('nazwa-uzytkownika').textContent = stan.login;
  await wczytajDane();
  $('widok-logowania').hidden = true;
  $('widok-aplikacji').hidden = false;
  if (!location.hash) location.hash = '#/pulpit';
  pokazZakladke();
}

async function wczytajDane() {
  try {
    stan.dane = await odszyfrujDane(stan.klucz, await pobierzJson('dane.enc.json'));
  } catch {
    powiadom('Nie udało się wczytać komunikatów. Spróbuj odświeżyć stronę.');
  }
  odswiezWidoki();
}

const TYTULY_ZAKLADEK = { pulpit: 'Pulpit', komunikaty: 'Komunikaty KSeF' };

function pokazZakladke() {
  let zakladka = location.hash.replace('#/', '');
  if (!TYTULY_ZAKLADEK[zakladka]) zakladka = 'pulpit';
  for (const nazwa of Object.keys(TYTULY_ZAKLADEK)) $('zakladka-' + nazwa).hidden = zakladka !== nazwa;
  document.querySelectorAll('.zakladki a').forEach((a) => {
    a.classList.toggle('aktywna', a.dataset.zakladka === zakladka);
    if (a.dataset.zakladka === zakladka) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = TYTULY_ZAKLADEK[zakladka] + ' · Panel KSeF';
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  if (stan.login) pokazZakladke();
});

function odswiezWidoki() {
  odswiezPulpit();
  odswiezListe();
}

function odswiezPulpit() {
  const { komunikaty, ostatnieSprawdzenie } = stan.dane;
  const produkcyjne = komunikaty.filter((k) => !k.testowy);
  const najnowszy = produkcyjne[0];

  $('powitanie').textContent = `${new Date().getHours() < 18 ? 'Dzień dobry' : 'Dobry wieczór'}, ${stan.login}`;
  $('kafel-sprawdzenie').textContent = formatujDateCzas(ostatnieSprawdzenie);
  $('kafel-30dni').textContent = produkcyjne.filter((k) => dniTemu(k.data) <= 30).length;
  $('kafel-najnowszy').textContent = najnowszy ? formatujDate(najnowszy.data) : '—';
  $('kafel-najnowszy-dni').textContent = najnowszy ? opisDni(dniTemu(najnowszy.data)) : '';

  const kontener = $('pulpit-najnowsze');
  kontener.replaceChildren(...produkcyjne.slice(0, 3).map(kartaKomunikatu));
  if (!produkcyjne.length) kontener.replaceChildren(pustaLista('Brak komunikatów.'));
}

function odswiezListe() {
  const fraza = $('filtr-szukaj').value.trim().toLowerCase();
  const testowe = $('filtr-testowe').checked;
  const pasujace = stan.dane.komunikaty.filter(
    (k) => (testowe || !k.testowy) && (!fraza || `${k.tytul} ${k.tresc} ${k.dlaKlienta || ''}`.toLowerCase().includes(fraza))
  );

  $('komunikaty-sprawdzenie').textContent = formatujDateCzas(stan.dane.ostatnieSprawdzenie);
  const kontener = $('komunikaty-lista');
  kontener.replaceChildren(...pasujace.slice(0, stan.limit).map(kartaKomunikatu));
  if (!pasujace.length) kontener.replaceChildren(pustaLista('Nie znaleziono komunikatów.'));
  $('przycisk-wiecej').hidden = pasujace.length <= stan.limit;
}

function pustaLista(tekst) {
  const p = document.createElement('p');
  p.className = 'karta pusto';
  p.textContent = tekst;
  return p;
}

function kartaKomunikatu(k) {
  const el = $('szablon-komunikatu').content.firstElementChild.cloneNode(true);
  const data = el.querySelector('.komunikat-data');
  data.textContent = formatujDate(k.data);
  data.dateTime = k.data;
  el.querySelector('.znacznik-nowy').hidden = !(dniTemu(k.data) <= DNI_NOWY && !k.testowy);
  el.querySelector('.znacznik-testowy').hidden = !k.testowy;
  el.querySelector('.komunikat-tytul').textContent = k.tytul;
  el.querySelector('.komunikat-zrodlo').href = k.adres;

  // Gdy jest gotowy tekst dla klienta, pokazujemy go, a oryginał chowamy pod "Pełna treść"
  const tekstDoKopiowania = k.dlaKlienta || k.tresc || 'Brak treści.';
  el.querySelector('.dla-klienta-etykieta').textContent = k.dlaKlienta ? 'Komunikat dla klienta' : 'Treść komunikatu';
  el.querySelector('.dla-klienta-tekst').textContent = tekstDoKopiowania;
  el.querySelector('.komunikat-szczegoly').hidden = !k.dlaKlienta;
  el.querySelector('.komunikat-tresc').textContent = k.tresc || '';

  el.querySelector('.przycisk-kopiuj').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(tekstDoKopiowania);
      powiadom('Skopiowano treść komunikatu.');
    } catch {
      powiadom('Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie.');
    }
  });

  return el;
}

$('filtr-szukaj').addEventListener('input', () => {
  stan.limit = NA_STRONE;
  odswiezListe();
});
$('filtr-testowe').addEventListener('change', () => {
  stan.limit = NA_STRONE;
  odswiezListe();
});
$('przycisk-wiecej').addEventListener('click', () => {
  stan.limit += NA_STRONE;
  odswiezListe();
});

// Po powrocie do karty przeglądarki pobierz najnowsze dane
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && stan.klucz) wczytajDane();
});

// ---------- Start ----------

(async () => {
  const sesja = wczytajSesje();
  if (sesja) {
    try {
      // Konto mogło zostać usunięte - wtedy trzeba zalogować się ponownie
      const uzytkownicy = await pobierzJson('uzytkownicy.json');
      if (Object.hasOwn(uzytkownicy, await identyfikatorLoginu(sesja.login))) {
        stan.login = sesja.login;
        stan.klucz = sesja.klucz;
        return await uruchomAplikacje();
      }
    } catch { /* przejdź do logowania */ }
    usunSesje();
  }
  pokazLogowanie();
})();
