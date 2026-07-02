# FON Raspored Nastave 🗓️

Web aplikacija za interaktivni prikaz rasporeda nastave na **Fakultetu organizacionih nauka (FON)** za zimski semestar 2024/25. Aplikacija omogućava studentima da brzo i jednostavno pronađu svoj raspored predavanja i vežbi, bilo direktnim izborom grupe ili automatskim određivanjem grupe na osnovu smera i prezimena. Takođe nudi mogućnost personalizacije i čuvanja sopstvenih predmeta za prijavljene korisnike.

Aplikacija je hostovana i javno dostupna na adresi: **[fon-ispiti.vercel.app](https://fon-ispiti.vercel.app)**

---

## 🚀 Korišćene Tehnologije

Aplikacija je izgrađena na **T3 Stack-u** i koristi sledeće tehnologije:

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router) sa [TypeScript-om](https://www.typescriptlang.org/)
- **Baza podataka**: [Prisma ORM](https://www.prisma.io/) u kombinaciji sa [MySQL](https://www.mysql.com/) bazom podataka
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
Kopirajte primer konfiguracije okruženja:
```bash
cp .env.example .env
```
Otvorite kreirani `.env` fajl i unesite vaše pristupne podatke:
- `DATABASE_URL` – URL za povezivanje sa MySQL bazom podataka
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` i `CLERK_SECRET_KEY` – Ključevi za Clerk autentifikaciju

### 3. Pokretanje baze podataka
Ukoliko imate instaliran **Docker**, možete jednostavno pokrenuti lokalnu bazu podataka pomoću priložene skripte (skripta automatski čita lozinku i port iz `.env` fajla):
```bash
# Na Linuxu ili macOS-u
chmod +x start-database.sh
./start-database.sh

# Na Windowsu (koristeći WSL i Docker Desktop)
wsl ./start-database.sh
```

### 4. Primena migracija i Prisma klijent
Nakon što je baza pokrenuta, generišite Prisma klijent i primenite bazu podataka:
```bash
npx prisma db push
```

### 5. Pokretanje razvojnog servera
Pokrenite Next.js aplikaciju u lokalnom razvojnom modu:
```bash
npm run dev
```
Aplikacija će biti dostupna na adresi: [http://localhost:3000](http://localhost:3000).

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
2. Na stranici `/podesavanja` (Tvoji predmeti) možete učitati sve predmete sa svog smera ili dodati sopstvene predmete pojedinačno.
3. Ovo omogućava bazi podataka da pamti vaše izabrane predmete kako bi raspored prikazivao samo one predmete koje vi slušate.
