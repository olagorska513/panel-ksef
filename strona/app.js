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
  // Administrator od razu widzi pozycję Administracja → Użytkownicy
  if (profil.admin) ustawGrupe(document.querySelector('[data-grupa="administracja"]'), true);
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
  const pobierzKomunikaty = (kolumny) => sb.from('komunikaty').select(kolumny).order('data', { ascending: false });
  const pobierzStan = (kolumny) => sb.from('stan').select(kolumny).eq('id', 1).maybeSingle();
  let [komunikaty, stanSprawdzenia] = await Promise.all([
    pobierzKomunikaty('id, data, tytul, adres, tresc, testowy, dla_klienta, okresy'),
    pobierzStan('ostatnie_sprawdzenie, latarnia_status, latarnia_komunikaty, latarnia_sprawdzenie'),
  ]);
  // Baza bez nowych kolumn (nie uruchomiono jeszcze aktualnego supabase/schemat.sql)
  if (komunikaty.error) komunikaty = await pobierzKomunikaty('id, data, tytul, adres, tresc, testowy, dla_klienta');
  if (stanSprawdzenia.error) stanSprawdzenia = await pobierzStan('ostatnie_sprawdzenie');
  if (komunikaty.error) powiadom('Nie udało się wczytać komunikatów: ' + opisBledu(komunikaty.error));
  const s = stanSprawdzenia.data || {};
  stan.dane = {
    komunikaty: komunikaty.data || [],
    ostatnieSprawdzenie: s.ostatnie_sprawdzenie || null,
    latarnia: { status: s.latarnia_status || null, komunikaty: s.latarnia_komunikaty || [], sprawdzenie: s.latarnia_sprawdzenie || null },
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
  odswiezDostepnosc();
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

  $('kafel-sprawdzenie').textContent = formatujDateCzas(ostatnieSprawdzenie);
  $('kafel-30dni').textContent = z30dni.length;
  $('kafel-30dni-testowe').textContent = testowych30 ? `w tym TEST i DEMO: ${testowych30}` : 'wszystkie dotyczą produkcji';
  $('kafel-najnowszy').textContent = najnowszy ? formatujDate(najnowszy.data) : '—';
  $('kafel-najnowszy-dni').textContent = najnowszy ? opisDni(dniTemu(najnowszy.data)) : '';
}

// ---------- Dostępność KSeF (strona główna) ----------

const STANY_LATARNI = {
  AVAILABLE: { klasa: 'ok', tytul: 'KSeF działa' },
  MAINTENANCE: { klasa: 'uwaga', tytul: 'Trwa planowana przerwa w działaniu KSeF' },
  FAILURE: { klasa: 'awaria', tytul: 'Awaria KSeF' },
  TOTAL_FAILURE: { klasa: 'awaria', tytul: 'Awaria całkowita KSeF' },
};

function formatujChwile(iso) {
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatujOkres(od, doCzasu) {
  if (!doCzasu) return `od ${formatujChwile(od)} (koniec nieznany)`;
  const a = new Date(od);
  const b = new Date(doCzasu);
  const godzina = (d) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (a.toDateString() === b.toDateString()) return `${formatujDate(a.toLocaleDateString('sv'))}, ${godzina(a)}–${godzina(b)}`;
  return `${formatujChwile(od)} – ${formatujChwile(doCzasu)}`;
}

function kiedy(od, doCzasu) {
  const teraz = Date.now();
  const start = Date.parse(od);
  if (start <= teraz && (!doCzasu || Date.parse(doCzasu) >= teraz)) return { tekst: 'Trwa teraz', klasa: 'trwa' };
  const dni = Math.round((new Date(od).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (dni === 0) return { tekst: 'Dziś', klasa: 'wkrotce' };
  if (dni === 1) return { tekst: 'Jutro', klasa: 'wkrotce' };
  return { tekst: `Za ${dni} dni`, klasa: dni <= 3 ? 'wkrotce' : '' };
}

// Zdarzenia, które jeszcze trwają albo dopiero nastąpią - z Latarni i z komunikatów ministerstwa
function zdarzeniaDostepnosci() {
  const teraz = Date.now();
  const lista = [];

  for (const m of stan.dane.latarnia?.komunikaty || []) {
    if (m.type === 'FAILURE_END') continue;
    if (m.end && Date.parse(m.end) < teraz) continue;
    lista.push({ zrodlo: 'Latarnia KSeF', tytul: m.title, opis: m.text, od: m.start, do: m.end || null });
  }

  for (const k of stan.dane.komunikaty) {
    const okresy = (k.okresy || []).filter((o) => Date.parse(o.do) >= teraz);
    for (const o of okresy) lista.push({ zrodlo: 'Komunikat MF', tytul: k.tytul, od: o.od, do: o.do, testowy: k.testowy, adres: k.adres });
    // Świeży komunikat o bieżących utrudnieniach, bez podanych godzin
    if (!k.okresy?.length && !k.testowy && dniTemu(k.data) <= 1 && /utrudnie|awari|niedostęp/i.test(k.tytul)) {
      lista.push({ zrodlo: 'Komunikat MF', tytul: k.tytul, od: null, do: null, adres: k.adres, data: k.data });
    }
  }

  return lista.sort((a, b) => (a.od ? Date.parse(a.od) : 0) - (b.od ? Date.parse(b.od) : 0));
}

function odswiezDostepnosc() {
  const latarnia = stan.dane.latarnia || {};
  const zdarzenia = zdarzeniaDostepnosci();
  const trwajace = zdarzenia.filter((z) => z.od && kiedy(z.od, z.do).klasa === 'trwa' && !z.testowy);

  let wyglad = STANY_LATARNI[latarnia.status];
  if (!wyglad) wyglad = { klasa: 'brak', tytul: 'Dostępność KSeF' };
  if (wyglad.klasa === 'ok' && trwajace.length) wyglad = { klasa: 'uwaga', tytul: 'Trwają zapowiedziane utrudnienia w KSeF' };

  $('dostepnosc').className = `karta dostepnosc dostepnosc-${wyglad.klasa}`;
  // Przypomnienie o trybie offline, gdy KSeF jest teraz niedostępny według Latarni
  $('dostepnosc-offline').hidden = !['MAINTENANCE', 'FAILURE', 'TOTAL_FAILURE'].includes(latarnia.status);
  $('dostepnosc-tytul').textContent = wyglad.tytul;
  $('dostepnosc-opis').textContent = zdarzenia.length
    ? 'Przerwy i utrudnienia w działaniu KSeF:'
    : 'Brak nowych komunikatów o dostępności KSeF.';

  const elementy = zdarzenia.map((z) => {
    const li = document.createElement('li');
    const termin = document.createElement('div');
    termin.className = 'zdarzenie-termin';
    if (z.od) {
      const k = kiedy(z.od, z.do);
      const znacznik = document.createElement('span');
      znacznik.className = `znacznik znacznik-kiedy ${k.klasa}`;
      znacznik.textContent = k.tekst;
      termin.append(znacznik, ' ', formatujOkres(z.od, z.do));
    } else {
      termin.textContent = `Zgłoszono ${formatujDate(z.data)}`;
    }
    if (z.testowy) {
      const t = document.createElement('span');
      t.className = 'znacznik znacznik-testowy';
      t.textContent = 'TEST / DEMO';
      termin.append(' ', t);
    }

    const tytul = document.createElement(z.adres ? 'a' : 'span');
    tytul.className = 'zdarzenie-tytul';
    tytul.textContent = z.tytul;
    if (z.adres) {
      tytul.href = z.adres;
      tytul.target = '_blank';
      tytul.rel = 'noopener';
    }
    const zrodlo = document.createElement('span');
    zrodlo.className = 'zdarzenie-zrodlo';
    zrodlo.textContent = z.zrodlo;

    li.append(termin, tytul, zrodlo);
    if (z.opis) {
      const opis = document.createElement('p');
      opis.className = 'zdarzenie-opis';
      opis.textContent = z.opis;
      li.append(opis);
    }
    return li;
  });
  $('dostepnosc-lista').replaceChildren(...elementy);
  $('dostepnosc-lista').hidden = !elementy.length;

  let zrodlo = 'Stan z Latarni KSeF (Ministerstwo Finansów)';
  if (latarnia.sprawdzenie) {
    zrodlo += `, sprawdzono ${formatujDateCzas(latarnia.sprawdzenie)}`;
    if (Date.now() - Date.parse(latarnia.sprawdzenie) > 2 * 3600000) zrodlo += ' – dane mogą być nieaktualne';
  } else {
    zrodlo = 'Stan z Latarni KSeF nie został jeszcze pobrany.';
  }
  $('dostepnosc-zrodlo').textContent = zrodlo;
}

// Chmurka z instrukcją: otwiera się po najechaniu (CSS) albo kliknięciu (telefon)
function ustawChmurke(otwarta) {
  $('latarnia-pomoc').classList.toggle('otwarta', otwarta);
  $('latarnia-przycisk').setAttribute('aria-expanded', String(otwarta));
  if (otwarta) pokazCalaChmurke();
}
// Chmurka otwiera się tam, gdzie się mieści (w dół albo w górę);
// gdy nie mieści się nigdzie, strona przewija się tak, aby była widoczna w całości
function pokazCalaChmurke() {
  const pomoc = $('latarnia-pomoc');
  pomoc.classList.remove('w-gore');
  requestAnimationFrame(() => {
    const chmurka = $('latarnia-chmurka').getBoundingClientRect();
    if (chmurka.bottom <= window.innerHeight) return;
    const pasek = document.querySelector('.pasek')?.getBoundingClientRect().bottom || 0;
    const naglowek = pomoc.parentElement.getBoundingClientRect();
    if (naglowek.top - 10 - chmurka.height >= pasek) pomoc.classList.add('w-gore');
    else window.scrollBy({ top: chmurka.bottom - window.innerHeight + 16, behavior: 'smooth' });
  });
}
$('latarnia-pomoc').addEventListener('mouseenter', pokazCalaChmurke);
$('latarnia-przycisk').addEventListener('click', (e) => {
  e.stopPropagation();
  ustawChmurke(!$('latarnia-pomoc').classList.contains('otwarta'));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#latarnia-pomoc')) ustawChmurke(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ustawChmurke(false);
});

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

// Po powrocie do karty przeglądarki i co 5 minut pobierz najnowsze dane
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && stan.profil?.zatwierdzony) wczytajDane();
});
setInterval(() => {
  if (!document.hidden && stan.profil?.zatwierdzony) wczytajDane();
}, 5 * 60000);

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
