# FON Raspored Nastave 🗓️

Web aplikacija za interaktivni prikaz rasporeda nastave na **Fakultetu organizacionih nauka (FON)** za zimski semestar 2026/27. Aplikacija omogućava studentima da brzo i jednostavno pronađu svoj raspored predavanja i vežbi, bilo direktnim izborom grupe ili automatskim određivanjem grupe na osnovu smera i prezimena. Takođe nudi mogućnost personalizacije i čuvanja sopstvenih predmeta za prijavljene korisnike.

Aplikacija je hostovana i javno dostupna na adresi: **[fon-raspored.vercel.app](https://fon-raspored.vercel.app)**

## 📱 PWA, offline raspored i kalendar

- **Android:** dugme **Instaliraj aplikaciju** pri dnu sajta, ili meni browsera
  → **Instaliraj aplikaciju / Dodaj na početni ekran**.
- **iPhone/iPad:** Safari → **Podeli / Share** → **Dodaj na početni ekran / Add
  to Home Screen**. Uključi **Open as Web App** ako je ponuđeno.
- **Offline:** nakon instalacije otvori željeni raspored dok imaš internet.
  Poslednji uspešno prikazan raspored ostaje lokalno sačuvan; kada nema mreže,
  ponovno otvaranje aplikacije prikazuje taj raspored sa datumom čuvanja i
  izborom dana. Prijava, izmene izbora i osvežavanje zahtevaju internet.
  Sačuvani raspored može se ukloniti na offline ekranu, a odjava/promena naloga
  na online sajtu uklanja lokalni prikaz prethodnog naloga.
- **Kalendar:** iznad izbora dana klikni **Dodaj raspored u kalendar**, izaberi
  period od–do i preuzmi `fon-raspored.ics`. Izvozi se cela prikazana nedelja,
  za izabranu grupu ili lične termine, sa nedeljnim ponavljanjem i vremenskom
  zonom `Europe/Belgrade` (uključujući promenu letnjeg/zimskog vremena).
- **Apple Calendar:** otvori preuzeti fajl i dodaj događaje; ako browser na
  telefonu ne ponudi uvoz, koristi Apple Calendar na Mac-u.
- **Google Calendar:** u web verziji na računaru otvori **Podešavanja → Uvoz i
  izvoz → Uvezi**. Događaji se sinhronizuju na telefon prijavljen na isti nalog.
  Za homescreen prikaz koristi widget svoje kalendarske aplikacije.

`.ics` je **jednokratni uvoz**, ne automatska pretplata. Praznici i pauze nisu
automatski isključeni. Posle izmene rasporeda ukloni prethodno uvezene termine
pre novog uvoza, kako bi izbegao duplikate.

PWA ne zahteva dodatne env promenljive, DB migracije ili mobilnu prodavnicu;
potreban je deploy na HTTPS. Service worker radi u production build-u, ne u
`npm run dev`. Kešira offline ekran, ikonice i statičke resurse, a ne API,
autentifikaciju ili personalizovan HTML. Offline raspored je mali lokalni
snapshot, bez tokena i podataka za prijavu.

Provera i održavanje:

```bash
npm test
npm run build
npm run start -- --port 3100
# Opciona browser provera, ako je Playwright dostupan:
node scripts/verify-pwa.mjs http://localhost:3100
# Ponovno generisanje PNG ikonica:
npm run pwa:icons
```

Browser provera koristi samo lokalni server i izolovan guest profil. Ako je
Playwright instaliran van projekta, `PLAYWRIGHT_MODULE` može pokazivati na
njegov modul. Posle izmene offline HTML/JS/CSS fajlova povećaj verziju keša u
`public/sw.js` da postojeće instalacije dobiju novi offline ekran.

---

## 🚀 Korišćene Tehnologije

Aplikacija je izgrađena na **T3 Stack-u** i koristi sledeće tehnologije:

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router) sa [TypeScript-om](https://www.typescriptlang.org/)
- **Baza podataka**: [Prisma ORM 5](https://www.prisma.io/) u kombinaciji sa [PostgreSQL](https://www.postgresql.org/) bazom podataka
- **Autentifikacija**: [Clerk](https://clerk.com/) za brzu i sigurnu prijavu korisnika
- **Stilovi i UI**: [Tailwind CSS](https://tailwindcss.com/) za responzivan i moderan dizajn, [Radix UI](https://www.radix-ui.com/) primitive i [Lucide React](https://lucide.dev/) ikonice
- **State Management**: [Jotai](https://jotai.org/) za lokalno čuvanje podešavanja pretrage u pretraživaču (`window.localStorage`)
- **API**: [tRPC](https://trpc.io/) za bezbednu i brzu komunikaciju između klijenta i servera

---

## 🛠️ Kako pokrenuti aplikaciju lokalno

### Brzi pregled važnih komandi

Sve komande pokreću se iz korena projekta. Koristi **Node.js 24**, Docker za
Compose okruženja i Python 3 za preuzimanje zvaničnog rasporeda.

#### Docker: razvoj i produkcija

| Komanda | Namena |
| --- | --- |
| `npm run docker:dev` | Lokalni PostgreSQL, migracije i razvojni sajt sa hot reload-om. |
| `npm run docker:prod` | Production build, migracije na hostovanoj bazi i `npm run start`. |
| `npm run docker:down` | Gašenje trenutnog Compose okruženja uz očuvanje lokalnog DB volumena. |
| `npm run docker:db` | Pokretanje samo lokalnog PostgreSQL servisa. |
| `npm run docker:import:dev` | Objavljivanje kataloga iz trenutnih JSON fajlova na lokalnoj bazi. |
| `npm run docker:migrate:prod` | Primena migracija na hostovanoj bazi bez pokretanja sajta. |
| `npm run docker:import:prod` | Objavljivanje kataloga na hostovanoj bazi bez pokretanja sajta. |

Development i production koriste isti lokalni port: pokretanje jednog režima
gasi drugi. Sajt je dostupan na `http://localhost:3000`, odnosno portu iz
`APP_PORT`. Docker NPM komande učitavaju `.env` i `.env.local`; development
sam postavlja URL-ove lokalne baze u svojim kontejnerima.

#### Preuzimanje i ažuriranje rasporeda

| Komanda | Namena |
| --- | --- |
| `npm run schedule:download` | Preuzimanje DOCX dokumenata i pregled promena, bez izmene `src/data`. |
| `npm run schedule:download -- --write` | Preuzimanje i upis kompletnog novog rasporeda u `src/data`. |
| `npm run db:import -- --dry-run` | Provera JSON kataloga bez povezivanja sa bazom. |

Uobičajeni postupak za novo FON ažuriranje:

```bash
npm run schedule:download -- --write
npm run db:import -- --dry-run

# Lokalna provera
npm run docker:dev
npm run docker:import:dev

# Objavljivanje na produkcionoj bazi
npm run docker:migrate:prod
npm run docker:import:prod
```

Objavljivanje podataka u bazi osvežava i Vercel sajt. Za izmene aplikacionog
koda potreban je novi Vercel deploy. Uvoz identičnog rasporeda ne povećava
verziju i ne ponavlja obaveštenje korisnicima.

#### Pokretanje bez Docker aplikacije i Prisma alati

| Komanda | Namena |
| --- | --- |
| `npm ci` | Instalacija verzija zavisnosti iz `package-lock.json`; generiše i Prisma klijent. |
| `npm run dev` | Next.js razvojni server. |
| `npm run build` | Production build sa TypeScript i lint proverama. |
| `npm run start` | Pokretanje prethodno napravljenog production build-a. |
| `npm run db:generate` | Generisanje Prisma klijenta nakon izmene šeme. |
| `npm run db:validate` | Provera ispravnosti Prisma šeme. |
| `npm run db:migrate` | Primena postojećih migracija na bazi iz env promenljivih. |
| `npm run db:import` | Objavljivanje kataloga na bazi iz env promenljivih. |
| `npm run db:studio` | Otvaranje Prisma Studio interfejsa za pregled i izmenu podataka. |
| `npm run db:push` | Usklađivanje razvojne baze sa šemom bez pravljenja migracionog fajla. |

Ove DB komande učitavaju `.env` i `.env.local` i koriste njihove URL-ove.
U trenutnoj konfiguraciji oni pokazuju na Neon. Za lokalnu bazu koristi
Docker komande sa `:dev` ili postavi lokalne `DATABASE_URL` i `DIRECT_URL`.
Production izmene šeme primenjuju se preko migracija.

#### Testiranje i dijagnostika

| Komanda | Namena |
| --- | --- |
| `npm test` | JavaScript testovi; integracioni DB testovi se uključuju odgovarajućim test env promenljivama. |
| `node --test tests/schedule-selection.test.cjs` | Ciljani testovi izbora termina i nedeljnog kalendara. |
| `python3 tests/download-schedule.test.py` | Testovi preuzimanja, obrade DOCX podataka i normalizacije sala. |
| `npm run lint` | ESLint provera. |
| `npm run perf:api` | Read-only merenje javnih tRPC endpointa na produkciji (5 zahteva po endpointu). |
| `npm run perf:api -- --db --compare --runs 7` | Naizmenično poređenje Prisma query/join strategija, broj SQL poziva i provera jednakosti odgovora. |
| `npm run perf:api -- --db --runs 1 --explain` | SQL execution/planning vreme kroz `EXPLAIN ANALYZE`, bez izmene podataka. |
| `npx tsc --noEmit` | Samostalna TypeScript provera bez generisanja fajlova. |
| `docker ps -a --filter name=fon-raspored` | Status aplikacionih i migracionih kontejnera. |
| `docker logs -f fon-raspored` | Praćenje logova trenutno pokrenutog sajta. |
| `docker logs fon-raspored-db-init` | Rezultat migracija pri pokretanju Compose okruženja. |

Detaljne komande za integracione testove na zasebnim PostgreSQL bazama nalaze
se u sekciji **Ažuriranje rasporeda i obaveštavanje korisnika** ispod.

#### Performanse na Vercelu

Vercel funkcije su podešene na Frankfurt (`fra1`) u `vercel.json`, uz Neon bazu
u `eu-central-1`. Ako menjaš region baze, uskladi i region funkcija: više
uzastopnih SQL poziva preko Atlantika znatno usporava i jednostavne upite.

Prisma koristi `relationJoins` da povezane redove učita kroz SQL join umesto
posebnog mrežnog poziva za svaku relaciju. Posle izmene generatora pokreni
`npm run db:generate`; ova optimizacija ne zahteva DB migraciju.

Javni katalog, grupe i rasporedi koriste Next.js Data Cache. Svaki HTTP/RSC
zahtev prvo čita trenutnu verziju rasporeda iz baze, a verzija je deo cache
ključa. Zato objavljivanje rasporeda preko `db:import` odmah bira novi cache,
bez čekanja TTL-a ili ručne invalidacije na Vercelu. Privatno stanje naloga
čita se direktno iz baze. Podatke kataloga menjaj preko versioned importera.

Primer merenja lokalnog production build-a sa hostovanom bazom:

```bash
npm run build
npm run start -- --port 3100
# U drugom terminalu:
npm run perf:api -- --url http://localhost:3100 --runs 5
```

DB benchmark zaobilazi Next.js keš kako bi merio stvarne upite. Merenje naloga
koristi nepostojeći sintetički ID, bez čitanja ličnih izbora korisnika.
Prvi uzorak može uključiti cold start aplikacije/konekcije/baze; posmatraj i
pojedinačne uzorke, ne samo medijanu. Izveštaj je u
[`docs/performance.md`](docs/performance.md).

#### Vercel deploy iz Git-a

Produkcijska grana projekta je `prod`. Nakon provere izmena:

```bash
git status --short
git add <putanje-izmenjenih-fajlova>
git commit -m "Opis izmene"
git push origin prod
```

Push na `prod` pokreće Vercel production deploy. Migracije i objavljivanje
rasporeda izvršavaju se navedenim DB/Docker komandama.

Pratite sledeće korake da biste pokrenuli aplikaciju u svom lokalnom okruženju:

### 1. Kloniranje repozitorijuma i instalacija zavisnosti
Klonirajte projekat i pozicionirajte se u direktorijum:
```bash
git clone <url-repozitorijuma>
cd fon-raspored
```
Instalirajte sve potrebne pakete:
```bash
npm install
```

### 2. Podešavanje okruženja (`.env` fajl)
Za novu instalaciju kopirajte primer konfiguracije samo ako `.env` ne postoji:
```bash
test -e .env || cp .env.example .env
```
Otvorite kreirani `.env` fajl i unesite vaše pristupne podatke:
- `DATABASE_URL` – URL za povezivanje aplikacije sa PostgreSQL bazom podataka
- `DIRECT_URL` – direktna PostgreSQL konekcija za Prisma migracije (lokalno ista kao `DATABASE_URL`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` i `CLERK_SECRET_KEY` – Ključevi za Clerk autentifikaciju

Koristite Node.js 24. Komande ucitavaju `.env`, zatim ignorisani `.env.local`;
vrednosti iz `.env.local` imaju prednost, a vec postavljene promenljive procesa
imaju prednost nad oba fajla. Trenutni `.env.local` sadrzi hostovane Neon URL-ove
za produkciju i odvojene `POSTGRES_*` vrednosti za lokalnu Docker bazu.
Development Compose sam postavlja lokalne URL-ove unutar kontejnera.
Za razvoj bez Docker aplikacije, `DATABASE_URL` i `DIRECT_URL` moraju pokazivati
na `localhost` i odgovarati lokalnim `POSTGRES_*` vrednostima.

### 3. Pokretanje baze podataka
Ukoliko imate instaliran **Docker**, prilozeni wrapper ucitava `.env` i
`.env.local` kao podatke, ne kao shell kod, i pokrece samo PostgreSQL servis:
```bash
# Na Linuxu ili macOS-u
chmod +x start-database.sh
./start-database.sh

# Na Windowsu (koristeći WSL i Docker Desktop)
wsl ./start-database.sh
```

### 4. Primena migracija i Prisma klijent
Nakon što je baza pokrenuta, primenite migracije i generisite Prisma klijent:
```bash
npm run db:migrate
npm run db:generate
```

### Uvoz kataloga predmeta i termina

Uz Node.js 24 i PostgreSQL adresu u `DATABASE_URL`, proveri katalog bez povezivanja
sa bazom:

```bash
npm run db:import -- --dry-run
```

Za novu ili praznu bazu primeni semu i uvezi katalog:

```bash
npm run db:migrate
npm run db:generate
npm run db:import
```

PostgreSQL baza ima sest tabela za katalog, cetiri za korisnicke podatke i
`schedule_version` za verziju objavljenog rasporeda.
Skripta za uvoz kataloga ne primenjuje semu: prvo pokreni migracije.
Uvoz objavljuje kompletan aktuelni katalog; izostavljeni predmeti i termini
postaju neaktivni. Njihovi zapisi ostaju sacuvani kao istorija korisnickih izbora.
Snapshot stare baze je `.schedule-import/mysql-to-postgresql.json`; taj privatni
fajl i stari volumen ostaju sacuvani. Pri lokalnom prelasku preneti su svi
zapisi i njihovi ID-jevi, ukljucujuci postojece korisnicke izbore i podesavanja.
Uvoz kataloga u drugu, praznu bazu nije zamena za ovaj prenos: novokreirani
ID-jevi ne moraju odgovarati ID-jevima iz stare baze. Korisnicke podatke treba
prenositi odvojeno uz ocuvanje vlasnistva i svih referenci.

- `subjects`: jedan predmet po nazivu.
- `programs` i `subject_programs`: programi i pripadnost predmeta programu u odredjenoj godini (1-4).
- `timeslots`: termin vezan za jedan predmet, sa tipom `P`/`V`, danom (1 = ponedeljak, 5 = petak), vremenom i salom.
- `study_groups` i `timeslot_groups`: grupe identifikovane godinom i nazivom, povezane sa terminima. Isti naziv grupe u razlicitim godinama nije ista grupa.
- Isti predmet kroz vise godina se objedinjuje; razlicite sale ostaju zasebni termini.
- Ponovni uvoz osvezava programske i grupne veze i zadrzava ID-jeve nepromenjenih predmeta i termina. Uklonjeni termini ostaju u bazi kao neaktivni i nisu dostupni u aktuelnom rasporedu.

### Azuriranje rasporeda i obavestavanje korisnika

Izvor za objavljivanje rasporeda su `src/data/predmeti.json` i
`src/data/termini.json`. Fajlovi predstavljaju **ceo aktuelni raspored za sve
godine**, ne samo izmene. Termin koji izostavis bice povucen iz aktuelnog
rasporeda. Objavljivanje se izvrsava jednom transakcijom: ako bilo koji korak
ne uspe, prethodni raspored i njegova verzija ostaju netaknuti.

1. Preuzmi sva cetiri aktuelna DOCX rasporeda i raspodelu grupa sa
   [zvanicne FON stranice](https://oas.fon.bg.ac.rs/raspored-nastave/).
   Potreban je Python 3; dodatni Python paketi nisu potrebni.

```bash
npm run schedule:download          # Pregled promena, bez izmene src/data
npm run schedule:download -- --write
```

Skripta cuva izvorne dokumente, njihove SHA-256 vrednosti, prethodni/novi katalog
i spisak promena u ignorisanom `.schedule-import/official-.../` direktorijumu.
Prepoznaje nova imena `1godina.docx`–`4godina.docx` i prethodna `*zimski*.docx`.
Ako su iste sale samo navedene drugim redosledom (`09/08` naspram `08/09`),
zadrzava prethodni zapis sale i identitet termina.

Proveri format generisanih podataka (ili JSON fajlova koje si izmenio rucno):

```bash
npm run db:import -- --dry-run
```

2. Proveri novi raspored na lokalnoj bazi:

```bash
npm run docker:dev
npm run docker:import:dev
```

3. Objavi kompletan novi raspored na hostovanoj produkcionoj bazi:

```bash
npm run docker:migrate:prod
npm run docker:import:prod
```

Produkcioni uvoz gradi jednokratni kontejner iz trenutnog koda i JSON fajlova,
pa ne zahteva pokrenut lokalni production sajt. Vercel i Docker aplikacija
citaju isti objavljeni raspored iz hostovane baze.

- Identitet termina cine predmet, tip (`P`/`V`), dan, pocetak, kraj i sala.
  Ako su te vrednosti iste, njegov ID i korisnicki izbor se zadrzavaju.
  Promena vremena ili sale pravi drugi termin; prethodni postaje neaktivan.
- Promene grupa i programskih veza osvezavaju postojeci termin i takodje
  predstavljaju novu verziju rasporeda.
- Isti sadrzaj, cak i u drugom redosledu, ne pravi novu verziju niti novi popup.
  Prvo objavljivanje identicnog postojeceg kataloga samo uspostavlja pocetnu
  evidenciju verzije, bez nepotrebnog obavestenja postojecim korisnicima.
- Postojeci prijavljeni korisnik pri sledecoj poseti dobija popup i automatski
  prelazi na `/termini`. Popup navodi njegove stare termine koji vise ne postoje;
  nepromenjeni izbori su vec oznaceni. Obavestenje se proverava i pri povratku
  u tab i svakih 60 sekundi dok je aplikacija otvorena.
- Potvrda popup-a belezi procitanu verziju po nalogu, na svim uredjajima.
  Upozorenje o uklonjenim terminima ostaje na `/termini` do cuvanja novog izbora.
  Ako korisnik propusti vise azuriranja, vidi sve svoje trenutno neaktivne izbore.
- Server odbija cuvanje iz stare verzije rasporeda i nikada ne prihvata
  neaktivan termin. Novi korisnici i gosti nemaju obavestenje za stare izbore.

Provera objavljivanja na zasebnoj PostgreSQL test bazi koristi
`SCHEDULE_TEST_DATABASE_URL` (lokalni port `55432`, baza `schedule_updates`)
sa prethodno primenjenim migracijama:

```bash
SCHEDULE_TEST_DATABASE_URL="postgresql://test:test@127.0.0.1:55432/schedule_updates?schema=public" npm test
```

Test sa kompletnim prethodnim i novim zvanicnim rasporedom koristi zasebnu
lokalnu bazu `official_schedule_updates`, takodje sa primenjenim migracijama:

```bash
OFFICIAL_SCHEDULE_TEST_DATABASE_URL="postgresql://test:test@127.0.0.1:55432/official_schedule_updates?schema=public" \
SCHEDULE_PREVIOUS_CATALOG_PATH=".schedule-import/official-20261005T161023035982Z/previous-catalog.json" \
node --test tests/official-schedule-update.test.cjs

python3 tests/download-schedule.test.py
```

#### Objavljeno azuriranje od 2. oktobra 2026.

[FON obavestenje](https://oas.fon.bg.ac.rs/brucosi/raspored-nastave-od-2-nedelje/)
navodi raspored od druge nedelje i nove izborne predmete cetvrte godine.
Preuzeti su i provereni rasporedi svih godina, uz nepromenjenu raspodelu 64 grupe.

| Rezultat poredjenja | Broj |
| --- | ---: |
| Prethodni termini | 394 |
| Nepromenjeni termini sa sacuvanim ID-jevima | 349 |
| Povuceni termini | 45 |
| Novi termini | 77 |
| Aktuelni termini | 426 |
| Aktuelni predmeti | 63 |

Normalizacija redosleda sala sprecila je 29 laznih promena. Dodato je 15 novih
predmeta, a jedan prethodni predmet nije u novom rasporedu. Objavljena je
verzija 1 na lokalnoj i hostovanoj bazi. Postojeci korisnicki izbori neaktivnih
termina sacuvani su za obavestenje; nepromenjeni izbori zadrzali su iste ID-jeve.
Test potvrduje obavestenje za pogođeni nalog, ocuvanje izbora nepogođenog naloga,
cuvanje zamene i ponovljeno objavljivanje bez nove verzije. Uvoz koristi grupno
citanje postojecih zapisa da bi smanjio broj uzastopnih upisa na hostovanoj bazi.

Primeri direktnog filtriranja kroz Prisma relacije, bez filtriranja JSON polja:

```ts
const subjects = await db.subject.findMany({
  where: { programs: { some: { year: 3, program: { name: "ISiT" } } } },
  orderBy: { name: "asc" },
});

const monday = await db.timeslot.findMany({
  where: { day: 1, groups: { some: { group: { year: 3, name: "C1" } } } },
  include: { subject: true, groups: { include: { group: true } } },
  orderBy: { startTime: "asc" },
});
```

Vreme se cuva kao `HH:MM` u lokalnoj vremenskoj zoni rasporeda, pa su sortiranje
i poredjenja vremena direktno moguci. Nisu u pitanju datumi pojedinacnih casova.

NPM komande za bazu ucitavaju `.env` i `.env.local` ako postoje;
vec postavljene promenljive procesa imaju prednost.
Svi prikazi ucitavaju katalog iz baze preko tipiziranih tRPC upita. JSON fajlovi
su samo izvor za uvoz i testove, ne izvor podataka u aplikaciji.

- `catalog.get`: javni katalog predmeta, programa i termina, sa stabilnim ID-jevima i grupama po godini.
- `schedule.groups` i `schedule.getSchedule`: javne grupe i nedeljni raspored, bez potrebe za prijavom.
- `account.get`: zasticen upit za sopstvene izbore i podesavanja.
- `account.saveSubjects`, `account.saveTimeslots`, `account.updatePreferences`: zasticene transakcione izmene, sa proverom verzije podataka.

Tabele `user_settings`, `user_subjects`, `user_timeslots` i
`user_program_filters` cuvaju izbore, prikaz rasporeda, grupu i filtere
po Clerk nalogu. Server uzima identitet iskljucivo iz verifikovane sesije.
Promena naloga uklanja prethodni klijentski kes. Nepotvrdjene izmene ostaju
u nacrtu do uspesnog cuvanja; promena iz drugog taba ili uredjaja ne moze
neprimetno prepisati nove izbore.

Za goste, godina i grupa su u URL-u, npr. `/?year=3&group=C1`. Ne kreiraju se
anonimni korisnicki zapisi. Tema se za sve korisnike cuva lokalno u pregledacu,
preko `next-themes` u `localStorage` kljucu `theme`. Promena teme je trenutna,
ne salje API zahtev i ostaje sacuvana nakon osvezavanja, prijave ili odjave.

Stari neoznaceni localStorage izbori se ne prebacuju automatski na nalog, jer
njihov vlasnik nije poznat. Katalog se kesira pet minuta; privatni podaci su
odvojeni po nalogu. Server proverava da svaki sacuvani termin pripada izabranom
predmetu i postuje nedeljne limite. Preklapanja razlicitih casova su dozvoljena.

Za ovaj javni prikaz Vercel mora imati `DATABASE_URL` i `DIRECT_URL` za
dostupnu PostgreSQL bazu sa primenjenim migracijama i uvezenim katalogom.
Baza na `localhost` tvog Mac-a nije dostupna Vercel serveru.

Za Neon ili Supabase u produkciji koristite pooled konekciju za `DATABASE_URL`,
a direktnu, nepooled konekciju za `DIRECT_URL` i migracije. Obe treba da imaju
`sslmode=require`. Za Prisma 5 proverite uputstvo provajdera i verziju poolera:
ako transaction pooler zahteva Prisma PgBouncer kompatibilnost, dodajte
`pgbouncer=true` samo na pooled `DATABASE_URL`, ne na `DIRECT_URL`.
URL kredencijali sa specijalnim znakovima moraju biti percent-encoded.
Projekat ostaje na Prisma 5: datasource koristi `provider = "postgresql"`,
`url = env("DATABASE_URL")` i `directUrl = env("DIRECT_URL")`;
Prisma 7 nadogradnja ili novi Prisma config nisu potrebni.

### 5. Pokretanje razvojnog servera
Pokrenite Next.js aplikaciju u lokalnom razvojnom modu:
```bash
npm run dev
```
Aplikacija će biti dostupna na adresi: [http://localhost:3000](http://localhost:3000).

### Pokretanje pomoću Docker Compose-a

#### Development: lokalna PostgreSQL baza

```bash
npm run docker:dev
```

`compose.yaml` je podrazumevana razvojna konfiguracija i pokreće `next dev` sa
izvornim kodom montiranim u kontejner, PostgreSQL 17 i jednokratni `db-init`.
Oba Prisma URL-a unutar kontejnera pokazuju na `postgres:5432`, cak i kada
`.env.local` sadrzi produkcione URL-ove. Baza prvo prolazi autentifikovani
`SELECT 1` healthcheck, zatim se primenjuju migracije i pokrece aplikacija.
Za potpuno novu lokalnu bazu uvezi katalog nakon pokretanja:

```bash
npm run docker:import:dev
```

#### Production: hostovana PostgreSQL baza

`compose.prod.yaml` nema lokalni PostgreSQL servis ni DB volumen. Koristi
`DATABASE_URL` iz env fajlova za aplikaciju, a `DIRECT_URL` za migracije.
Ako `DIRECT_URL` nije postavljen, koristi Neon/Vercel `DATABASE_URL_UNPOOLED`.
Produkcijska mreza ima izlaz na internet za povezivanje sa hostovanom bazom.

```bash
npm run docker:prod
```

Docker image se gradi kroz `npm run build`, `db-init` izvrsava
`prisma migrate deploy`, a tek nakon uspesnih migracija aplikacija pokrece
`npm run start -- --hostname 0.0.0.0`. Migracije su ponovljive: vec primenjene
migracije se ne izvrsavaju ponovo. Uvoz kataloga je zasebna komanda, koja
koristi jednokratni `db-init` kontejner i radi i bez pokrenute aplikacije:

```bash
npm run docker:import:prod
```

Za primenu migracija na hostovanoj bazi bez build-a ili pokretanja sajta:

```bash
npm run docker:migrate:prod
```

NPM Docker komande ucitavaju `.env` i `.env.local` pre Compose interpolacije
i automatski kreiraju `dev-proxy` mrezu ako nedostaje. Privatni env fajlovi
nisu kopirani u image; Clerk secret se prosledjuje samo u runtime, a javni
Clerk kljuc i kao argument produkcijskog build-a.

Development i production koriste iste nazive kontejnera i port, pa pokretanje
jednog rezima prvo gasi drugi. Lokalni imenovani `postgres-data` volumen
ostaje sacuvan pri prebacivanju rezima i gasenju. Za gasenje:

```bash
npm run docker:down
```

Aplikacija je lokalno dostupna na `http://localhost:3000` (ili portu iz
`APP_PORT`). Za Proxy Host u Nginx Proxy Manager-u koristite:

- Forward Hostname/IP: `fon-raspored`
- Forward Port: `3000`
- Scheme: `http`

Samo Next.js kontejner je povezan na eksternu `dev-proxy` mrezu. PostgreSQL
servis `postgres` (kontejner `fon-raspored-postgres`) koristi internu `backend`
mrezu za aplikaciju i `db-access` mrezu za objavljivanje lokalnog porta.
Lokalnim alatima je dostupan na `127.0.0.1:5432`, a njegovi podaci se cuvaju
u odvojenom `postgres-data` volumenu na `/var/lib/postgresql/data`.
Port mozes promeniti preko `POSTGRES_PORT`; pristup sa drugih uredjaja na
mrezi nije omogucen. Za lokalni DB klijent koristi `POSTGRES_DB`, `POSTGRES_USER`
i `POSTGRES_PASSWORD` iz env fajlova. Ako promenis port, prilagodi i lokalne
`DATABASE_URL` i `DIRECT_URL`. Podrazumevane vrednosti su baza `fon_raspored`,
korisnik `fon` i lozinka `fon_password` (samo lokalni development).
Development Compose oba URL-a za aplikaciju i migracije postavlja na interni host
`postgres:5432`, nezavisno od lokalnih URL-ova i objavljenog porta.
Promena kredencijala u env fajlu ne menja korisnika vec inicijalizovanog volumena.
`./start-database.sh` pokrece samo bazu sa `up -d --no-deps --wait postgres`,
bez aplikacije, migracija ili zahteva za `dev-proxy` mrezom.

---

## 📖 Kratko uputstvo za korišćenje

### 🔍 Podešavanje i pretraga rasporeda
Kada prvi put otvorite aplikaciju ili kliknete na ikonicu zupčanika (podešavanja) u zaglavlju, otvara se prozor za konfiguraciju prikaza:

1. **Pretraga po grupi**: 
   - Izaberite godinu studija (npr. I Godina, II Godina...).
   - Izaberite željenu grupu sa liste (npr. A1, A2, B1...).
2. **Pretraga po prezimenu (Automatska raspodela)**:
   - Izaberite godinu studija i smer (npr. ISiT, Menadžment...).
   - Unesite svoje prezime (možete koristiti i ošišanu latinicu, aplikacija automatski konvertuje i poredi sa ćiriličnim spiskom raspodele).
   - Sistem će na osnovu zvanične raspodele grupa po prezimenima automatski odrediti kojoj grupi pripadate i prikazati njen raspored.

![Podešavanje i biranje grupe](screenshots/biranje%20grupe.png)

---

### 📅 Prikaz rasporeda nastave
Nakon što sačuvate podešavanja, na početnoj stranici će se prikazati raspored za izabranu grupu/prezime:

- **Izbor dana**: Pomoću dugmića na vrhu možete prebacivati prikaz između radnih dana u nedelji (Ponedeljak – Petak). Aplikacija automatski prepoznaje tekući dan i prikazuje ga.
- **Predavanja i vežbe**: Termini su vizuelno obeleženi bojama radi lakšeg razlikovanja:
  - 🟢 **Zelena boja** označava **Predavanja** (P).
  - 🔵 **Plava boja** označava **Vežbe** (V).
- **Detalji termina**: Za svaki čas možete videti tačan naziv predmeta, vreme održavanja (npr. `08:15-10:00`), grupe koje slušaju taj termin, i salu u kojoj se nastava održava.
- **Slobodan dan**: Ukoliko izabrana grupa nema aktivnosti za taj dan, aplikacija će prikazati veselu poruku da ste slobodni tog dana!

![Prikaz rasporeda](screenshots/prikaz%20rasporeda.png)

---

### 🔑 Personalizacija i "Tvoji predmeti"
Za studente koji žele dodatno da prilagode svoj raspored, aplikacija podržava prijavu na nalog:
1. Klikom na dugme za prijavu u gornjem desnom uglu, prijavljujete se preko Clerk servisa.
2. Na stranici `/predmeti` izaberite predmete, zatim na `/termini` izaberite termine koje želite da pratite.
3. Izbori i podešavanja se čuvaju u bazi po nalogu i dostupni su na drugim uređajima nakon prijave. Podaci se ne dele između različitih naloga.
