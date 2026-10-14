# Automatsko ažuriranje rasporeda

Workflow `.github/workflows/update-schedule.yml` radi ponedeljkom u 07:23 UTC
(08:23 zimi / 09:23 leti u Beogradu), ili ručno preko **Actions → Update FON
schedule → Run workflow**. Zakazivanje nije garantovano u tačan minut.

## Jednokratno podešavanje

1. Commituj i pushuj workflow, skripte, testove i aktuelni `src/data` na
   podrazumevanu granu. Ne dodaj `.env.local` u Git.
2. U **Settings → Secrets and variables → Actions → New repository secret**
   dodaj sledeće repository secrets:

   | Secret          | Vrednost                                                      |
   | --------------- | ------------------------------------------------------------- |
   | `DATABASE_URL`  | Produkcioni Neon connection string sa poolerom.               |
   | `DIRECT_URL`    | Produkcioni Neon connection string bez poolera.               |
   | `SMTP_HOST`     | SMTP server provajdera, npr. `smtp.gmail.com`.                |
   | `SMTP_PORT`     | `587` za STARTTLS ili `465` za implicitni TLS.                |
   | `SMTP_USER`     | SMTP korisničko ime, za Gmail cela email adresa.              |
   | `SMTP_PASSWORD` | SMTP lozinka/token; za Gmail App Password, ne obična lozinka. |
   | `MAIL_FROM`     | Dozvoljena/verifikovana adresa pošiljaoca.                    |
   | `MAIL_TO`       | Adresa primaoca izveštaja.                                    |

   Vrednosti unesi bez navodnika. Ne šalji lozinke kroz chat ili Git.

3. Za Gmail uključi verifikaciju u dva koraka na Google nalogu, pa napravi
   **App Password**: https://myaccount.google.com/apppasswords . Za `MAIL_FROM`
   koristi isti nalog kao `SMTP_USER`. Neki poslovni nalozi ne podržavaju App
   Passwords; tada koristi drugi SMTP provajder. Provajder može zahtevati
   verifikaciju pošiljaoca/domena i dozvoljen pristup sa GitHub runnera.
4. Proveri da pravila repozitorijuma dozvoljavaju workflow-u direktan push na
   podrazumevanu granu. Workflow traži `contents: write`. Ako organizaciona
   politika to zabranjuje, promeni objavljivanje podataka u pull-request tok;
   ne isključuj zaštitu grane samo zbog automatizacije.
5. Ručno pokreni workflow i proveri email prijem i svaki korak u logovima.
   Ovo je stvarno produkciono ažuriranje, ne dry-run.
6. Kao rezervu uključi GitHub email obaveštenja za neuspešne Actions runove u
   **ličnim Settings → Notifications → Actions**. SMTP ne može poslati izveštaj
   ako SMTP pristup ne radi, workflow nije pokrenut ili je runner prekinut.

## Ponašanje i sigurnost

- Email izveštaj se pokušava poslati na kraju svakog izvršavanja, i kada neki
  prethodni korak ne uspe. Sadrži status uvoza i commita, kao i link do logova.
  Ne sadrži lozinke ili podatke korisnika. Uspešan SMTP odgovor ne garantuje
  isporuku u inbox: proveri spam i pravila svog provajdera.
- Pre preuzimanja proverava se prisustvo SMTP konfiguracije. Nedostajući
  secrets zaustavljaju posao pre produkcionog uvoza.
- Downloader mora uspešno obraditi sve četiri godine. Uvoz se validira pre
  pristupa produkcionoj bazi.
- Read-only guard poredi nove termine sa **aktuelnom produkcionom bazom**,
  zasebno za svaku godinu. Blokira prazne rasporede, pad broja termina veći od
  20% ili uklanjanje/zamenu više od 30% termina. Promena vremena ili sale računa
  se kao zamena. Guard je heuristika, ne potvrda ispravnosti zvaničnih podataka.
- Za legitiman veliki prelaz (npr. novi semestar) ručno pregledaj dokumente i
  razlike, pa kontrolisano pokreni postojeći importer. Workflow nema prekidač
  za zaobilaženje zaštite. Guard i importer su odvojeni koraci; ne pokreći druge
  ručne uvoze dok workflow radi.
- Uvoz je transakcioni, čuva postojeće identifikatore i korisničke izbore;
  neaktivni termini ostaju u bazi. Identičan katalog ne povećava verziju.
- Podaci se commituju tek posle uspešnog uvoza. Ako commit/push ili email padnu,
  baza već može biti ažurirana: proveri **Publish to production database**.
- Arhiva DOCX fajlova, poređenja i rezultata uvoza dostupna je pod **Artifacts**
  30 dana. Pristup arhivi prati dozvole repozitorijuma.
- Automatske migracije baze nisu deo workflow-a. Šemu ažuriraj kontrolisano
  kroz zaseban deploy. Proveri Neon mrežna/IP ograničenja ako se pojavi `P1001`.
- Automatski commit može pokrenuti Vercel deploy; `[skip ci]` ne garantuje da
  će ga Vercel preskočiti. DB promene same po sebi ne zahtevaju deploy.
- Na javnim repozitorijumima GitHub može isključiti schedule posle 60 dana bez
  aktivnosti. Periodično proveri da li workflow radi. Na privatnim repozitorijumima
  troše se Actions minuti iz kvote naloga.

## Lokalna provera bez produkcionih izmena

```bash
python3 tests/download-schedule.test.py
python3 tests/notify-schedule.test.py
node --test tests/schedule-update-guard.test.cjs
npm run db:import -- --dry-run
```

SMTP testovi su mockovani i ne šalju stvarne mejlove. Prava isporuka i GitHub
konfiguracija proveravaju se prvim ručnim pokretanjem workflow-a.
