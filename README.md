# FON Raspored Nastave 🗓️

Web aplikacija za interaktivni prikaz rasporeda nastave na **Fakultetu organizacionih nauka (FON)** za zimski semestar 2026/27. Aplikacija omogućava studentima da brzo i jednostavno pronađu svoj raspored predavanja i vežbi, bilo direktnim izborom grupe ili automatskim određivanjem grupe na osnovu smera i prezimena. Takođe nudi mogućnost personalizacije i čuvanja sopstvenih predmeta za prijavljene korisnike.

Aplikacija je hostovana i javno dostupna na adresi: **[fon-raspored.vercel.app](https://fon-raspored.vercel.app)**

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
`user_program_filters` cuvaju izbore, prikaz rasporeda, grupu, filtere i temu
po Clerk nalogu. Server uzima identitet iskljucivo iz verifikovane sesije.
Promena naloga uklanja prethodni klijentski kes. Nepotvrdjene izmene ostaju
u nacrtu do uspesnog cuvanja; promena iz drugog taba ili uredjaja ne moze
neprimetno prepisati nove izbore.

Za goste, godina i grupa su u URL-u, npr. `/?year=3&group=C1`. Ne kreiraju se
anonimni korisnicki zapisi. Gost moze privremeno promeniti izgled aplikacije;
za prijavljenog korisnika, tema iz baze je merodavna.

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
