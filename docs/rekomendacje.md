# Panel KSeF – rekomendacje do dalszej pracy

25.10.2026 · Ola

Najpierw serwer poczty (SMTP), bo odblokowuje trzy funkcje naraz; równolegle powiadomienia na Teams i kalendarz przerw, które nie wymagają nikogo spoza zespołu.

## 1. Własny serwer poczty (SMTP)

Dziś panel nie wysyła e-maili: wbudowana poczta Supabase dociera tylko do członków zespołu projektu w Supabase. Podłączenie własnego SMTP daje:

1. **Powiadomienia mailowe** o przerwach i awariach.
2. **Reset hasła e-mailem** (dziś niemożliwy).
3. **Potwierdzanie adresu przy rejestracji** – dopiero wtedy ma sens ograniczenie rejestracji do adresów `@assecods.pl`.

| Opcja | Koszt | Uwagi |
| --- | --- | --- |
| Firmowa skrzynka (Office 365) przez IT | 0 zł | Najlepsza: maile z firmowego adresu, nie trafiają do spamu. Wymaga zgody IT. |
| Brevo | darmowy do 300 maili dziennie | Wystarczy potwierdzić jeden adres nadawcy; szybki start bez IT, większe ryzyko spamu. |
| Resend / SendGrid | darmowy do ok. 3000 miesięcznie | Do wysyłki na dowolne adresy trzeba potwierdzić domenę w DNS (IT). |

## 2. Powiadomienia mailowe – projekt

- **Ustawienia w profilu:** każdy sam włącza powiadomienia i wybiera zakres:
  - tylko przerwy i awarie / wszystkie nowe komunikaty,
  - z TEST/DEMO lub bez,
  - opcjonalnie jedno podsumowanie dziennie zamiast pojedynczych maili.
- **Kiedy wysyłać:**
  - po ogłoszeniu przerwy (np. „27.10 17:00 – 31.10 17:00, pamiętaj o trybie offline”),
  - przypomnienie dzień przed i godzinę przed przerwą,
  - przy rozpoczęciu i zakończeniu awarii.
- **Zgoda i wypisanie (RODO):** wysyłka tylko do osób, które same się zapisały; w każdym mailu link „wypisz się”.
- **Wysyłka:** istniejące zadania GitHub Actions; baza zapamiętuje wysłane powiadomienia, żeby nikt nie dostał dwa razy tego samego.

**Tańsza alternatywa:** powiadomienie na kanał Microsoft Teams – bez serwera poczty i zarządzania adresami, widoczne dla wszystkich na kanale.

## 3. Funkcje płatne dla klientów – ostrożnie

Jako narzędzie wewnętrzne dla zespołu – tak. Jako płatna funkcja dla klientów FAKTURA365 obecne rozwiązanie się nie nadaje, z przyczyn organizacyjnych:

- działa na prywatnym koncie GitHub i darmowym planie Supabase, bez gwarancji działania (SLA),
- sprzedaż klientom wymaga umowy powierzenia danych (e-maile klientów), regulaminu, płatności i wsparcia,
- FAKTURA365 jest już zintegrowana z KSeF – funkcję najlepiej wbudować w produkt; Latarnię da się odpytywać z serwera aplikacji.

**Rekomendacja:** traktować panel jako działający prototyp do pokazania zespołowi produktowemu i przygotować krótką propozycję funkcji z podziałem na wersję darmową i płatną.

## 4. Pozostałe ulepszenia (od najważniejszych)

1. **Przeniesienie na konto firmowe** (organizacja firmy na GitHubie i w Supabase), żeby panel nie zależał od jednej osoby.
2. **Rejestracja tylko dla `@assecods.pl`** – prosta zmiana w bazie; razem z potwierdzaniem e-maila naprawdę skuteczna.
3. **Kalendarz przerw KSeF** – link do subskrypcji w Outlooku; planowane przerwy same pojawiają się w kalendarzach zespołu.
4. **Teksty dla klienta od Claude** przy każdym komunikacie – kolumna `dla_klienta` w bazie już istnieje; koszt to grosze miesięcznie przez API.
5. **Zabezpieczenie przed wyłączeniem zadań przez GitHub po 60 dniach**, np. sprawdzanie Latarni bezpośrednio w Supabase (pg_cron).

## Proponowana kolejność

1. Zapytać IT o SMTP z firmowej skrzynki (odblokowuje maile, reset hasła i domenę `@assecods.pl`).
2. W międzyczasie: powiadomienia na Teams i kalendarz przerw.
3. Po uzyskaniu SMTP: powiadomienia mailowe z ustawieniami w profilu, reset hasła, rejestracja tylko dla `@assecods.pl`.
4. Rozmowa z zespołem produktowym o funkcji w FAKTURA365 oraz przeniesienie panelu na konto firmowe.
