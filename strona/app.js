'use strict';

// Panel KSeF - strona statyczna (GitHub Pages) z kontami i danymi w Supabase.
// Dostęp do komunikatów chronią reguły w bazie (supabase/schemat.sql): widzą je zalogowani
// użytkownicy, których konto nie zostało zablokowane przez administratora.

const NA_STRONE = 20;
const DNI_NOWY = 7;

const sb = supabase.createClient(window.KONFIGURACJA.supabaseUrl, window.KONFIGURACJA.supabaseKlucz);

const stan = {
  uzytkownik: null,
  profil: null,
  dane: { ostatnieSprawdzenie: null, komunikaty: [] },
  limit: NA_STRONE,
};

const $ = (id) => document.getElementById(id);

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
  czasPowiadomienia = setTimeout(() => (el.hidden = true), 4000);
}

// Komunikaty błędów Supabase po polsku
function opisBledu(blad) {
  const tekst = (blad && (blad.message || blad.error_description)) || String(blad);
  if (/invalid login credentials/i.test(tekst)) return 'Niepoprawny e-mail lub hasło.';
  if (/already registered|already exists/i.test(tekst)) return 'Konto z tym adresem e-mail już istnieje. Zaloguj się.';
  if (/email not confirmed/i.test(tekst)) return 'Adres e-mail nie został jeszcze potwierdzony.';
  if (/password should be|weak password|at least/i.test(tekst)) return 'Hasło jest za słabe. Użyj co najmniej 8 znaków, w tym liter i cyfr.';
  if (/invalid.*email|unable to validate email/i.test(tekst)) return 'Niepoprawny adres e-mail.';
  if (/rate limit|too many/i.test(tekst)) return 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.';
  if (/signups not allowed/i.test(tekst)) return 'Rejestracja nowych kont jest wyłączona.';
  if (/failed to fetch|network/i.test(tekst)) return 'Brak połączenia z serwerem. Sprawdź internet.';
  if (/same.*password|different from the old/i.test(tekst)) return 'Nowe hasło musi być inne niż obecne.';
  return 'Wystąpił błąd: ' + tekst;
}

function pokazBlad(formularz, tekst) {
  const el = formularz.querySelector('.blad');
  el.textContent = tekst;
  el.hidden = !tekst;
}

async function zablokujNaCzas(przycisk, napis, dzialanie) {
  const poprzedni = przycisk.textContent;
  przycisk.disabled = true;
  przycisk.textContent = napis;
  try {
    return await dzialanie();
  } finally {
    przycisk.disabled = false;
    przycisk.textContent = poprzedni;
  }
}

// ---------- Ekrany konta ----------

const FORMULARZE_KONTA = ['formularz-logowania', 'formularz-rejestracji', 'formularz-hasla', 'zablokowane'];

function pokazKonto(ktory) {
  $('widok-aplikacji').hidden = true;
  $('widok-konta').hidden = false;
  for (const id of FORMULARZE_KONTA) $(id).hidden = id !== ktory;
  const formularz = $(ktory);
  if (formularz.tagName === 'FORM') {
    pokazBlad(formularz, '');
    formularz.querySelector('input')?.focus();
  }
  document.title = 'Panel KSeF';
}

function pokazEkranNiezalogowanego() {
  pokazKonto(location.hash === '#/rejestracja' ? 'formularz-rejestracji' : 'formularz-logowania');
}

$('formularz-logowania').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  pokazBlad(f, '');
  await zablokujNaCzas(f.querySelector('[type=submit]'), 'Logowanie…', async () => {
    const { data, error } = await sb.auth.signInWithPassword({
      email: $('logowanie-email').value.trim(),
      password: $('logowanie-haslo').value,
    });
    if (error) return pokazBlad(f, opisBledu(error));
    $('logowanie-haslo').value = '';
    await poZalogowaniu(data.user);
  });
});

$('formularz-rejestracji').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  pokazBlad(f, '');
  const email = $('rejestracja-email').value.trim();
  const haslo = $('rejestracja-haslo').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return pokazBlad(f, 'Podaj poprawny adres e-mail.');
  if (haslo.length < 8) return pokazBlad(f, 'Hasło musi mieć co najmniej 8 znaków.');
  if (haslo !== $('rejestracja-haslo2').value) return pokazBlad(f, 'Hasła nie są takie same.');

  await zablokujNaCzas(f.querySelector('[type=submit]'), 'Zakładanie konta…', async () => {
    const { data, error } = await sb.auth.signUp({
      email,
      password: haslo,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) return pokazBlad(f, opisBledu(error));
    f.reset();
    if (data.session) {
      await poZalogowaniu(data.user);
    } else {
      // Gdy w Supabase włączone jest potwierdzanie adresu e-mail
      location.hash = '#/logowanie';
      pokazKonto('formularz-logowania');
      powiadom('Konto założone. Potwierdź adres, klikając link w wiadomości e-mail, a potem zaloguj się.');
    }
  });
});

document.querySelectorAll('.przycisk-wyloguj').forEach((p) =>
  p.addEventListener('click', async () => {
    await sb.auth.signOut();
  })
);

$('przycisk-zmien-haslo').addEventListener('click', () => {
  ustawMenuProfilu(false);
  pokazKonto('formularz-hasla');
});
$('przycisk-anuluj-haslo').addEventListener('click', () => pokazAplikacje());

$('formularz-hasla').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const haslo = $('nowe-haslo').value;
  if (haslo.length < 8) return pokazBlad(f, 'Hasło musi mieć co najmniej 8 znaków.');
  if (haslo !== $('nowe-haslo2').value) return pokazBlad(f, 'Hasła nie są takie same.');
  await zablokujNaCzas(f.querySelector('[type=submit]'), 'Zapisywanie…', async () => {
    const { error } = await sb.auth.updateUser({ password: haslo });
    if (error) return pokazBlad(f, opisBledu(error));
    f.reset();
    pokazAplikacje();
    powiadom('Hasło zostało zmienione.');
  });
});

sb.auth.onAuthStateChange((zdarzenie) => {
  if (zdarzenie === 'SIGNED_OUT') {
    stan.uzytkownik = null;
    stan.profil = null;
    stan.dane = { ostatnieSprawdzenie: null, komunikaty: [] };
    location.hash = '#/logowanie';
    pokazKonto('formularz-logowania');
  }
});

// ---------- Po zalogowaniu ----------

async function poZalogowaniu(uzytkownik) {
  stan.uzytkownik = uzytkownik;
  const { data: profil, error } = await sb.from('profile').select('*').eq('id', uzytkownik.id).maybeSingle();
  if (error) {
    powiadom(opisBledu(error));
    return pokazKonto('formularz-logowania');
  }
  stan.profil = profil;

  if (!profil?.zatwierdzony) {
    $('zablokowane-email').textContent = uzytkownik.email;
    return pokazKonto('zablokowane');
  }

  $('nazwa-uzytkownika').textContent = uzytkownik.email;
  $('awatar').textContent = inicjaly(uzytkownik.email);
  $('link-uzytkownicy').hidden = !profil.admin;
  if (!location.hash || ['#/logowanie', '#/rejestracja'].includes(location.hash)) location.hash = '#/start';
  await wczytajDane();
  pokazAplikacje();
}

function pokazAplikacje() {
  $('widok-konta').hidden = true;
  $('widok-aplikacji').hidden = false;
  pokazZakladke();
}

async function wczytajDane() {
  const [komunikaty, stanSprawdzenia] = await Promise.all([
    sb.from('komunikaty').select('id, data, tytul, adres, tresc, testowy, dla_klienta').order('data', { ascending: false }),
    sb.from('stan').select('ostatnie_sprawdzenie').eq('id', 1).maybeSingle(),
  ]);
  if (komunikaty.error) powiadom('Nie udało się wczytać komunikatów: ' + opisBledu(komunikaty.error));
  stan.dane = {
    komunikaty: komunikaty.data || [],
    ostatnieSprawdzenie: stanSprawdzenia.data?.ostatnie_sprawdzenie || null,
  };
  if (stan.profil?.admin) await wczytajUzytkownikow();
  odswiezWidoki();
}

// Zakładki z własną treścią
const TYTULY_ZAKLADEK = { start: 'Strona główna', komunikaty: 'Komunikaty KSeF', uzytkownicy: 'Użytkownicy' };

// Pozostałe pozycje menu (moduły pełnej aplikacji) - wspólny ekran informacyjny
const MODULY = {
  statystyki: ['Dashboard', 'Statystyki'],
  rozliczalnosc: ['Dashboard', 'Rozliczalność faktur zakupowych'],
  zadania: [null, 'Zadania'],
  'faktury-sprzedazowe': [null, 'Faktury sprzedażowe'],
  'faktury-zakupowe': [null, 'Faktury zakupowe'],
  ustawienia: ['Administracja', 'Ustawienia'],
  slowniki: [null, 'Słowniki'],
  harmonogramy: [null, 'Status harmonogramów'],
};

function pokazZakladke() {
  let zakladka = location.hash.replace('#/', '');
  if (zakladka === 'pulpit') zakladka = 'start';
  if ((!TYTULY_ZAKLADEK[zakladka] && !MODULY[zakladka]) || (zakladka === 'uzytkownicy' && !stan.profil?.admin)) zakladka = 'start';

  for (const nazwa of Object.keys(TYTULY_ZAKLADEK)) $('zakladka-' + nazwa).hidden = zakladka !== nazwa;
  const modul = MODULY[zakladka];
  $('zakladka-modul').hidden = !modul;
  if (modul) {
    $('modul-okruszki').textContent = modul[0] ? `${modul[0]} › ${modul[1]}` : '';
    $('modul-okruszki').hidden = !modul[0];
    $('modul-tytul').textContent = modul[1];
  }

  document.querySelectorAll('.boczny .pozycja[data-zakladka]').forEach((a) => {
    const aktywna = a.dataset.zakladka === zakladka;
    a.classList.toggle('aktywna', aktywna);
    if (aktywna) {
      a.setAttribute('aria-current', 'page');
      const grupa = a.closest('.grupa');
      if (grupa) ustawGrupe(grupa, true);
    } else {
      a.removeAttribute('aria-current');
    }
  });
  document.title = (TYTULY_ZAKLADEK[zakladka] || modul[1]) + ' · FAKTURA365';
  document.body.classList.remove('menu-otwarte');
  $('zaslona').hidden = true;
  window.scrollTo(0, 0);
}

// ---------- Menu boczne i profil ----------

function ustawGrupe(grupa, otwarta) {
  grupa.classList.toggle('otwarta', otwarta);
  grupa.querySelector('.pozycja-grupy').setAttribute('aria-expanded', String(otwarta));
}

document.querySelectorAll('.pozycja-grupy').forEach((przycisk) =>
  przycisk.addEventListener('click', () => {
    const grupa = przycisk.closest('.grupa');
    ustawGrupe(grupa, !grupa.classList.contains('otwarta'));
  })
);

// Na komputerze przycisk zwija menu do samych ikon, na telefonie wysuwa je z boku
const telefon = window.matchMedia('(max-width: 900px)');
document.querySelectorAll('.przycisk-menu').forEach((przycisk) =>
  przycisk.addEventListener('click', () => {
    if (telefon.matches) {
      const otwarte = document.body.classList.toggle('menu-otwarte');
      $('zaslona').hidden = !otwarte;
    } else {
      document.body.classList.toggle('menu-zwiniete');
    }
  })
);
$('zaslona').addEventListener('click', () => {
  document.body.classList.remove('menu-otwarte');
  $('zaslona').hidden = true;
});

function inicjaly(email) {
  const czesci = email.split('@')[0].split(/[._-]+/).filter(Boolean);
  const litery = czesci.length > 1 ? czesci[0][0] + czesci[1][0] : email.slice(0, 2);
  return litery.toUpperCase();
}

function ustawMenuProfilu(otwarte) {
  $('profil-menu').hidden = !otwarte;
  $('profil-przycisk').setAttribute('aria-expanded', String(otwarte));
}

$('profil-przycisk').addEventListener('click', (e) => {
  e.stopPropagation();
  ustawMenuProfilu($('profil-menu').hidden);
});
document.addEventListener('click', (e) => {
  if (!$('profil-menu').hidden && !e.target.closest('.profil')) ustawMenuProfilu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ustawMenuProfilu(false);
});

window.addEventListener('hashchange', () => {
  if (stan.profil?.zatwierdzony) {
    if (!$('widok-aplikacji').hidden) pokazZakladke();
  } else if (!stan.uzytkownik) {
    pokazEkranNiezalogowanego();
  }
});

// ---------- Pulpit i komunikaty ----------

function odswiezWidoki() {
  odswiezPulpit();
  odswiezListe();
  const nowe = stan.dane.komunikaty.filter((k) => dniTemu(k.data) <= DNI_NOWY).length;
  document.querySelectorAll('.licznik-nowych').forEach((el) => {
    el.textContent = nowe;
    el.hidden = !nowe;
  });
}

function odswiezPulpit() {
  const { komunikaty, ostatnieSprawdzenie } = stan.dane;
  const najnowszy = komunikaty[0];
  const z30dni = komunikaty.filter((k) => dniTemu(k.data) <= 30);
  const testowych30 = z30dni.filter((k) => k.testowy).length;

  $('powitanie').textContent =
    (new Date().getHours() < 18 ? 'Dzień dobry' : 'Dobry wieczór') + '! Oto podsumowanie komunikatów technicznych KSeF.';
  $('kafel-sprawdzenie').textContent = formatujDateCzas(ostatnieSprawdzenie);
  $('kafel-30dni').textContent = z30dni.length;
  $('kafel-30dni-testowe').textContent = testowych30 ? `w tym TEST i DEMO: ${testowych30}` : 'wszystkie dotyczą produkcji';
  $('kafel-najnowszy').textContent = najnowszy ? formatujDate(najnowszy.data) : '—';
  $('kafel-najnowszy-dni').textContent = najnowszy ? opisDni(dniTemu(najnowszy.data)) : '';

  const kontener = $('pulpit-najnowsze');
  kontener.replaceChildren(...komunikaty.slice(0, 3).map(kartaKomunikatu));
  if (!komunikaty.length) kontener.replaceChildren(pustaLista('Brak komunikatów. Pojawią się po pierwszym pobraniu przez GitHub.'));
}

function odswiezListe() {
  const fraza = $('filtr-szukaj').value.trim().toLowerCase();
  const srodowisko = document.querySelector('input[name="srodowisko"]:checked').value;
  const wyszukane = stan.dane.komunikaty.filter(
    (k) => !fraza || `${k.tytul} ${k.tresc} ${k.dla_klienta || ''}`.toLowerCase().includes(fraza)
  );
  const wedlugSrodowiska = {
    wszystkie: wyszukane,
    produkcyjne: wyszukane.filter((k) => !k.testowy),
    testowe: wyszukane.filter((k) => k.testowy),
  };
  for (const [nazwa, lista] of Object.entries(wedlugSrodowiska)) {
    document.querySelector(`[data-licznik="${nazwa}"]`).textContent = lista.length;
  }
  const pasujace = wedlugSrodowiska[srodowisko];

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
  const tekstDoKopiowania = k.dla_klienta || k.tresc || 'Brak treści.';
  el.querySelector('.dla-klienta-etykieta').textContent = k.dla_klienta ? 'Komunikat dla klienta' : 'Treść komunikatu';
  el.querySelector('.dla-klienta-tekst').textContent = tekstDoKopiowania;
  el.querySelector('.komunikat-szczegoly').hidden = !k.dla_klienta;
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
$('filtr-srodowisko').addEventListener('change', () => {
  stan.limit = NA_STRONE;
  odswiezListe();
});
$('przycisk-wiecej').addEventListener('click', () => {
  stan.limit += NA_STRONE;
  odswiezListe();
});

// ---------- Użytkownicy (administrator) ----------

async function wczytajUzytkownikow() {
  const { data, error } = await sb.from('profile').select('*').order('utworzono', { ascending: false });
  if (error) return powiadom(opisBledu(error));

  const wiersze = data.map((p) => {
    const tr = document.createElement('tr');
    const status = p.admin ? 'Administrator' : p.zatwierdzony ? 'Aktywny' : 'Zablokowany';
    for (const tekst of [p.email, status, formatujDateCzas(p.utworzono)]) {
      const td = document.createElement('td');
      td.textContent = tekst;
      tr.append(td);
    }
    if (!p.zatwierdzony) tr.classList.add('zablokowany');

    const akcje = document.createElement('td');
    if (p.id === stan.uzytkownik.id) {
      akcje.textContent = '(Ty)';
    } else if (!p.admin) {
      const przycisk = document.createElement('button');
      przycisk.className = p.zatwierdzony ? 'przycisk przycisk-cichy przycisk-niebezpieczny' : 'przycisk przycisk-cichy';
      przycisk.textContent = p.zatwierdzony ? 'Zablokuj' : 'Odblokuj';
      przycisk.addEventListener('click', async () => {
        if (p.zatwierdzony && !confirm(`Zablokować dostęp dla ${p.email}?`)) return;
        const { error } = await sb.from('profile').update({ zatwierdzony: !p.zatwierdzony }).eq('id', p.id);
        if (error) return powiadom(opisBledu(error));
        powiadom(p.zatwierdzony ? `Zablokowano ${p.email}.` : `Odblokowano ${p.email}.`);
        wczytajUzytkownikow();
      });
      akcje.append(przycisk);
    }
    tr.append(akcje);
    return tr;
  });
  $('lista-uzytkownikow').replaceChildren(...wiersze);
}

// Po powrocie do karty przeglądarki pobierz najnowsze dane
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && stan.profil?.zatwierdzony) wczytajDane();
});

// ---------- Start ----------

(async () => {
  if (window.KONFIGURACJA.supabaseUrl.includes('TWOJ-PROJEKT')) {
    document.body.textContent = 'Strona nie jest jeszcze skonfigurowana (uzupełnij strona/konfiguracja.js).';
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await poZalogowaniu(data.session.user);
  else pokazEkranNiezalogowanego();
})();
