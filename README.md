# Panel KSeF

Strona z komunikatami technicznymi Krajowego Systemu e-Faktur
([ksef.podatki.gov.pl/komunikaty-techniczne](https://ksef.podatki.gov.pl/komunikaty-techniczne/)),
dostępna po zalogowaniu.

## Jak to działa

- **GitHub Actions** (`.github/workflows/strona.yml`) trzy razy dziennie pobiera komunikaty ze strony
  ministerstwa, szyfruje je i publikuje stronę na GitHub Pages.
- **Treść komunikatów jest zaszyfrowana** (`dane.enc.json`, AES-256-GCM). Klucz do niej jest zapisany
  w `strona/uzytkownicy.json` osobno dla każdego konta, zaszyfrowany hasłem tego konta (PBKDF2, 600 000 iteracji).
  Bez poprawnego loginu i hasła nie da się odczytać komunikatów.
- Klucz danych jest przechowywany lokalnie w pliku `.klucz-danych` (nie trafia do repozytorium)
  oraz w sekrecie repozytorium `KLUCZ_DANYCH`.

## Zarządzanie kontami

Kliknij dwukrotnie odpowiedni plik i podaj login:

| Plik | Co robi |
|---|---|
| `Dodaj użytkownika.cmd` | zakłada konto, wypisuje hasło do przekazania i publikuje zmianę |
| `Nadaj nowe hasło.cmd` | nadaje nowe hasło (stare przestaje działać) |
| `Usuń użytkownika.cmd` | usuwa konto |

Albo z wiersza poleceń: `node narzedzia/uzytkownicy.mjs dodaj|nowe-haslo|usun|lista <login> [--opublikuj]`.

Hasła są generowane automatycznie (14 znaków). Użytkownicy nie mogą sami zmienić hasła,
bo strona na GitHub Pages nie może zapisywać danych.

## Sprawdzenie komunikatów na żądanie

GitHub → zakładka **Actions** → **Aktualizacja strony** → **Run workflow**.

## Ograniczenia

- Usunięcie konta blokuje logowanie. Osoba, która była już zalogowana w otwartej karcie przeglądarki,
  widzi dane do jej zamknięcia. Aby całkowicie odciąć dostęp, trzeba wygenerować nowy klucz danych
  i nadać wszystkim nowe hasła.
- W publicznych repozytoriach GitHub wyłącza zaplanowane zadania po 60 dniach bez zmian w repozytorium.
  GitHub wysyła wtedy e-mail, a zadanie włącza się jednym kliknięciem w zakładce Actions.
