# Panel KSeF

Strona z komunikatami technicznymi Krajowego Systemu e-Faktur
([ksef.podatki.gov.pl/komunikaty-techniczne](https://ksef.podatki.gov.pl/komunikaty-techniczne/)),
dostępna po zalogowaniu.

Pełny opis projektu dla zespołu (instrukcja, schemat, utrzymanie): [docs/opis-projektu.md](docs/opis-projektu.md).

## Jak to działa

- **Strona** (`strona/`) jest publikowana na GitHub Pages przez `.github/workflows/strona.yml`.
- **Konta i dane** są w [Supabase](https://supabase.com). Każdy, kto ma link, zakłada konto sam
  (e-mail i hasło) i od razu ma dostęp. Pierwsze założone konto zostaje administratorem i może
  blokować konta w zakładce **Użytkownicy**.
- **Komunikaty** pobiera trzy razy dziennie `.github/workflows/komunikaty.yml`
  (`narzedzia/pobierz-komunikaty.mjs`) i zapisuje je w tabeli `komunikaty`.
  Zapisywane są tylko komunikaty dotyczące KSeF: zawierające w tytule lub treści „KSeF”,
  „Krajowy System e-Faktur” albo „Moduł Certyfikatów i Uprawnień” (funkcja `czyDotyczyKsef`).
  Komunikat oznaczany jest jako TEST / DEMO, gdy dotyczy środowiska testowego lub przedprodukcyjnego
  i nie wspomina środowiska produkcyjnego (funkcja `czyTestowy`).
  Z treści komunikatów wyciągane są terminy przerw od–do (`narzedzia/okresy.mjs`).
- **Stan KSeF** co 15 minut pobiera z [Latarni MF](https://github.com/CIRFMF/ksef-latarnia)
  `.github/workflows/latarnia.yml` (`narzedzia/latarnia.mjs`). Strona główna pokazuje go
  razem z nadchodzącymi i trwającymi przerwami.
- Dostępu do danych pilnują reguły Row Level Security w bazie (`supabase/schemat.sql`):
  komunikaty widzą tylko zalogowani użytkownicy z niezablokowanym kontem.

## Konfiguracja

1. Supabase → **SQL Editor**: uruchom `supabase/schemat.sql`.
2. Supabase → **Authentication → Sign In / Providers → Email**: wyłącz **Confirm email**
   (wbudowana poczta Supabase wysyła wiadomości tylko do członków zespołu projektu).
3. `strona/konfiguracja.js`: wpisz adres projektu i klucz **publishable** (Project Settings → API Keys).
4. GitHub → **Settings → Secrets and variables → Actions**: dodaj sekrety
   `SUPABASE_URL` oraz `SUPABASE_SECRET_KEY` (klucz **secret**, nigdy nie wpisuj go do plików).
5. GitHub → **Actions → Pobieranie komunikatów → Run workflow**.

## Na co uważać

- Hasła nie da się zresetować e-mailem bez własnego serwera poczty (SMTP) w Supabase.
  Osoba, która zapomni hasła, może poprosić administratora o usunięcie konta
  (Supabase → Authentication → Users) i zarejestrować się ponownie.
- Darmowy projekt Supabase jest wstrzymywany po tygodniu bez aktywności. Pobieranie komunikatów
  trzy razy dziennie utrzymuje go w ruchu.
- W publicznych repozytoriach GitHub wyłącza zaplanowane zadania po 60 dniach bez zmian w repozytorium.
  GitHub wysyła wtedy e-mail, a zadanie włącza się jednym kliknięciem w zakładce Actions.
