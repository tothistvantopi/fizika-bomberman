# Fizika Bomberman 💣

Többjátékos, retro 16 bites **fizika-bomberman** 7. osztályos tanulóknak. Mindenki egy kis Einstein, színes nyakkendővel; a cél, hogy a többieket kirobbantsd, és te maradj utolsónak. A pályán kérdőjelek vannak: ha ráállsz, **fizikakérdést** kapsz a 7. osztályos *mozgások és erők* (kinematika és dinamika) anyagából, és a helyes válaszért extra jár.

Egy gépen fut a szerver (például a tanár laptopján), a diákok **telefonról, tabletről vagy laptopról** a böngészőjükkel csatlakoznak, ugyanazon a Wi-Fi-n. Nem kell hozzá telepíteni semmit a diákok gépére, és nem kell hozzá internet a játék közben.

> **English:** A multiplayer, retro 16-bit physics bomberman for classrooms (grade 7 mechanics, in Hungarian). One computer runs the server, everybody else joins from a browser on the same Wi-Fi. See [English quick start](#english-quick-start) at the bottom.

---

## Tartalom

- [Gyors indítás](#gyors-indítás)
- [Óra menete a tanári gépen](#óra-menete-a-tanári-gépen)
- [Szabályok és irányítás](#szabályok-és-irányítás)
- [Számítógépes ellenfelek (botok)](#számítógépes-ellenfelek-botok)
- [Hálózat, hibaelhárítás](#hálózat-hibaelhárítás)
- [Beállítások](#beállítások)
- [Játék az interneten (nem csak egy teremben)](#játék-az-interneten-nem-csak-egy-teremben)
- [Fejlesztés](#fejlesztés)
- [A projekt felépítése](#a-projekt-felépítése)
- [English quick start](#english-quick-start)

---

## Gyors indítás

### 1. Telepítsd a Node.js-t (egyszer)

Töltsd le a **LTS** verziót innen: <https://nodejs.org> (legalább 20.19-es, vagy 22.12-es és újabb). Ellenőrzés a terminálban:

```bash
node -v
```

### 2. Töltsd le a játékot

```bash
git clone https://github.com/tothistvantopi/fizika-bomberman.git
cd fizika-bomberman
```

(Vagy a GitHub oldalon **Code → Download ZIP**, majd csomagold ki.)

### 3. Indítsd el

**Mac:** dupla kattintás az `INDITAS.command` fájlra.
Ha a Mac nem engedi megnyitni: jobb kattintás → *Megnyitás*, vagy a terminálban `chmod +x INDITAS.command`.

**Windows:** dupla kattintás az `INDITAS.bat` fájlra.

**Bármely rendszeren, terminálból:**

```bash
npm install     # csak az első alkalommal (internet kell hozzá)
npm run host    # felépíti és elindítja a szervert
```

A szerver kiírja a címeket, például:

```
=== Fizika Bomberman szerver fut ===
Ezen a gépen:   http://localhost:3000
Diákoknak:      http://192.168.1.23:3000
```

- A **tanár** a `localhost` címet nyissa meg a saját gépén.
- A **diákok** a „Diákoknak” címet írják be a böngészőjükbe (vagy beolvassák a QR-kódot, lásd lent).
- Leállítás: `Ctrl+C` a terminálban.

---

## Óra menete a tanári gépen

1. Indítsd el a szervert (fent), nyisd meg a `localhost` címet.
2. **Új Szoba** → add meg a neved → **Szoba Létrehozása**. A képernyőn megjelenik a **szobakód**, a **csatlakozási cím** és egy **QR-kód** (kivetítőre is kitehető).
3. A diákok ugyanazon a Wi-Fi-n megnyitják a címet (vagy beolvassák a QR-kódot), a **Csatlakozás** fülön beírják a nevüket és a 4 betűs szobakódot, és választanak nyakkendő-színt.
4. Ha kevesen vagytok, a váróteremben **botokat** is hozzáadhatsz ([lásd lent](#számítógépes-ellenfelek-botok)).
5. Ha mindenki bent van (legalább 2 játékos, legfeljebb 15), nyomd meg a **Játék Indítása** gombot. 10 másodperces visszaszámlálás alatt mindenki elolvashatja a szabályokat.
6. A játék legfeljebb 5 perc. A végén a **dobogó** mutatja az első 3 helyezettet. Az **Új játék** gombbal mindenkit visszaviszel a váróterembe.

**Egyedül kipróbálás:** *Új Szoba* → **Gyors teszt (te + 7 bot)**.

---

## Szabályok és irányítás

**Cél:** te maradj utolsónak. Mindenki 3 élettel indul; egy robbanás-találat 1 életet vesz el (utána 2 mp-ig villogva védett vagy), a harmadik kiüt. Kiesés után látod, ki ütött ki, és tovább nézheted a játékot. A saját bombád nem árt neked.

| Mit | Billentyűzet | Telefon / tablet |
|---|---|---|
| Mozgás | `WASD` vagy nyilak | bal oldali joystick |
| Bomba | `Szóköz` vagy `B` | piros **BOMBA** gomb |
| Fal építése | `F` | kék **FAL** gomb |
| Térkép | `Q` | **TÉRKÉP** gomb |
| Súgó | `P` | `?` gomb a felső sávban |
| Hang ki/be | `M` | súgó ablak |
| Kvíz válasz | `1` `2` `3` | koppintás a válaszra |

**Bomba:** 2 másodperc múlva kereszt alakban robban, a téglákat összetöri, a láncban lévő bombákat felrobbantja. A robbanás a könnyebb játékosokat messzebbre löki (Δv = J / m).

**Fal:** magad elé építhetsz egy falat, ami **egy robbanást kibír** (megrepedezik), a második már lerombolja. 3 falad van, 12 másodpercenként pótlódik egy.

**Kérdőjel ❓:** ráállva fizikakérdést kapsz 20 másodpercre (közben védett vagy és nem tudsz mozogni). A válasz után azonnal látod, jó volt-e: a kiválasztott válasz zöld (jó) vagy piros (rossz), és csak rossz válasznál jelöli zölddel a helyeset. **Helyes válaszra egy véletlen extra** jár:

| Extra | Hatás |
|---|---|
| 🛡️ Sebezhetetlenség | 30 mp-ig nem sebezhetnek a robbanások |
| ⚡ Gyors mozgás | 30 mp-ig 1,7-szeres sebesség |
| 💥 Óriási robbanás | 30 mp-ig 8 mező hatótávú bombák |
| ♾️ Végtelen bomba | 10 mp-ig korlátlan sok bombát rakhatsz |

**Szűkülő pálya:** 25 másodperc után 12 másodpercenként beomlik a pálya széle. A piros zónában azonnal kiesel (az extrák sem védenek).

**Vége:** aki utoljára marad, nyer. Ha lejár az idő (5 perc), a túlélők közül a **több élet**, majd a **több kiütés** dönt. A kiesettek sorrendjében az utoljára kiesett a jobb helyezett.

A kérdések a **7. osztályos kinematika és dinamika** témaköréből vannak (egyenletes és változó mozgás, gyorsulás, szabadesés, tehetetlenség, tömeg, erő, Newton törvényei, eredő erő, súrlódás, közegellenállás). Elméleti és hétköznapi példás kérdések vannak, **számolás nincs**, és munka/energia sincs. A kérdések a `shared/data/questions.ts` fájlban vannak, könnyen bővíthetők.

---

## Számítógépes ellenfelek (botok)

A váróteremben a szobavezető **+ / −** gombokkal botokat adhat hozzá vagy vehet el (összesen legfeljebb 15 játékos), és kiválaszthatja a **nehézségi szintet**:

| Szint | Viselkedés |
|---|---|
| **Könnyű** | lassan reagál, néha rosszul lép, a kérdéseknek kb. 40%-át találja el, ritkán támad |
| **Közepes** | kikerüli a robbanásokat, vadászik a játékosokra, kérdőjeleket gyűjt, a kérdések kb. 70%-át találja el |
| **Nehéz** | korán menekül a robbanások elől, agresszíven vadászik, szinte mindig jól válaszol |

A botok fizikus nevet kapnak (Newton, Galilei, Curie, …). Úgy gondolkodnak, mint egy játékos: veszélytérképet építenek a bombákról és a szűkülő zónáról, csak akkor raknak bombát, ha biztosan ki tudnak menekülni előle, téglákat törnek, ha elállják az utat, és időnként falat építenek. A viselkedésük a `server/bots.ts` fájlban van.

---

## Hálózat, hibaelhárítás

- **Minden eszköz ugyanazon a Wi-Fi-n legyen.** Egyes iskolai „vendég” hálózatok tiltják, hogy az eszközök lássák egymást (*client isolation*). Ilyenkor a diákok nem érik el a szervert: használj másik hálózatot, vagy kapcsold be a saját telefonod **hotspotját**, és arra csatlakozzon mindenki.
- **Tűzfal:** Mac-en az első indításkor rákérdezhet, hogy a Node fogadhat-e bejövő kapcsolatot: engedélyezd. Windows-on a *Windows Defender tűzfal* kérdésénél válaszd a *Privát hálózat* engedélyezését.
- **Foglalt port:** ha a 3000-es portot már használja valami, a szerver automatikusan a következő szabadot választja (3001, 3002, …), és kiírja a helyes címet. Fix portot így kérhetsz: `PORT=4000 npm run start` (Windows PowerShell: `$env:PORT=4000; npm run start`).
- **Rossz IP-cím látszik:** ha több hálózati kártyád van (VPN, virtuális gép), a szerver az összes címet kiírja; a Wi-Fi-d címét használd, vagy a lobby QR-kódját (az a legvalószínűbb címet mutatja).
- **Ping:** a játék felső sávjában a kapcsolat késleltetése látszik. **Zöld** (80 ms alatt) tökéletes, **sárga** (200 ms alatt) jó, **piros** sokat akadhat: ilyenkor jó, ha kevesebb eszköz van a hálózaton, vagy közelebb vagytok az útválasztóhoz.
- **Újracsatlakozás:** ha egy diák telefonja elalszik vagy kiesik a Wi-Fi, a böngésző automatikusan visszacsatlakozik, és a játékos ugyanott folytatja (a szerver megtartja a helyét).

---

## Beállítások

| Mit | Hogyan |
|---|---|
| Port | `PORT=4000 npm run start` |
| Rövidebb játék (perc nem lehet 5 percnél több) | `MATCH_SECONDS=120 npm run start` |
| Életek száma, pályaméret, extrák ideje, szűkülés üteme, falak, kérdőjelek száma | `shared/constants.ts` |
| Kérdések | `shared/data/questions.ts` |
| Botok viselkedése | `server/bots.ts` |

Módosítás után: `npm run host` (újra felépíti és elindítja).

---

## Online kipróbálható demó (Vercel) + letölthető többjátékos verzió

A repó két változatot tartalmaz ugyanabból a kódból:

| | Demó (online) | Teljes (letöltve) |
|---|---|---|
| Hol fut | a böngészőben, statikus oldalként (Vercel) | a tanári gépen, Node-szerverrel |
| Ellenfelek | csak gépi botok (te + 7 bot) | diákok + botok, max. 15 fő |
| Parancs | `npm run build:demo` | `npm run host` |

A demóhoz nem kell játékszerver: a játékmotor és a botok magában a böngészőben futnak, ezért a Vercel is kiszolgálja. A többjátékos módhoz a repót le kell tölteni (lásd **Gyors indítás**), mert ahhoz tartós WebSocket-szerver kell.

**A demó közzététele a Vercelen:** a Vercelen válaszd az *Add New → Project* pontot, importáld ezt a repót, és hagyd meg a beállításokat: a `vercel.json` már megadja a build parancsot (`npm run build:demo`) és a kimeneti mappát (`dist-demo`).

---

## Játék az interneten (nem csak egy teremben)

A játék egy sima Node-szerver (HTTP + WebSocket), ezért bármilyen olyan helyen futtatható, ahol Node fut, és engedélyezett a WebSocket (pl. egy saját VPS, Render, Railway, Fly.io). Lépések röviden:

```bash
npm ci
npm run build
npm run start      # a PORT környezeti változót használja
```

A böngésző HTTPS oldalon automatikusan `wss://` kapcsolatot használ, külön beállítás nem kell. Egy szerver egyszerre több szobát is kiszolgál (a szobákat a 4 betűs kód különbözteti meg). Az internetes tárhely késleltetése nagyobb, mint a helyi Wi-Fi-é: osztályteremben a helyi szerver a jobb.

---

## Fejlesztés

```bash
npm install
npm run dev     # fejlesztői szerver (Vite, azonnali frissítés)
npm test        # motor-, bot- és protokollteszt (vitest)
npm run lint    # típusellenőrzés (TypeScript)
npm run build   # éles build a dist mappába
```

Technológia: TypeScript, React + Tailwind (kliens), Express + `ws` (szerver), canvas alapú pixel-art megjelenítés. A szerver **autoritatív**: a játékszabályokat a szerver futtatja 20 lépés/másodperces rögzített időlépéssel, a kliensek csak a bemenetet küldik. A saját karakter mozgását a kliens előre számolja (predikció), a többi játékost kis késéssel, interpolálva rajzolja, így a Wi-Fi-n sem ugrál.

## A projekt felépítése

```
server.ts            HTTP + statikus fájlok, port- és IP-kezelés
server/index.ts      WebSocket kapcsolatok, ping, üzenet-irányítás
server/rooms.ts      szobák, lobby, játékciklus, snapshotok
server/bots.ts       a számítógépes ellenfelek
shared/              a kliens és a szerver közös része
  constants.ts       a játék beállításai
  protocol.ts        üzenetek és ellenőrzésük
  data/questions.ts  a fizikakérdések
  engine/            a játékszabályok (pálya, fizika, bombák, kvíz, rangsor) + tesztek
src/                 a böngészős kliens (React, canvas, érintős vezérlők)
```

---

## English quick start

1. Install [Node.js](https://nodejs.org) (LTS, 20.19+ or 22.12+).
2. `git clone` this repository, then run `npm install` and `npm run host` (or double-click `INDITAS.command` on macOS / `INDITAS.bat` on Windows).
3. The terminal prints the address for your players, e.g. `http://192.168.1.23:3000`. Open `http://localhost:3000` on the host computer, create a room and show the room code / QR code.
4. Everybody else opens that address in a phone, tablet or laptop browser on the **same Wi-Fi**, enters a name and the 4-letter room code.
5. Up to 15 players per room, 3 lives each, free-for-all, max. 5 minutes. Add computer opponents (easy/normal/hard) in the lobby. Question marks give physics questions (grade 7 kinematics & dynamics, Hungarian); correct answers give power-ups.

If players cannot connect: check that the Wi-Fi does not isolate clients, allow incoming connections in the firewall, or use a phone hotspot.
