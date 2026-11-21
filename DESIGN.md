# Cruise – design

Soft feelgood-skatespel för mobil. Lätt att rulla, svårt att sätta trick.
Beslutat i grill-session 2026-11-21. Ändra här när ett beslut ändras.

## Grund

| Beslut | Val |
|---|---|
| Perspektiv | 2D från sidan med parallax, landscape |
| Plattform | iPhone. Webb/PWA först, sedan **Capacitor** → App Store (samma kod) |
| Motor | PixiJS 8 (vendorad i `vendor/`) + egen fysik, ingen fysikmotor |
| Roller | Claude kodar, Tom designar/testar/bestämmer känsla |
| Ambition | Hobby, byggt för att kunna släppas |
| Hosting under utveckling | GitHub Pages, testa via länk på telefonen |

## Rulla

- **Vänster halva:** tryck = push (spark), håll kvar efter sparken = fotbroms.
  Tryck under pågående spark köas (rytmiskt pushande); hålls det köade trycket
  kvar blir det broms i stället för en extra spark.
- **Höger halva:** pop + trick (M2+).
- Vänsterhänt läge byter zonerna (inställning, M5).
- Farten avtar långsamt; nedförsbackar ger fart. Ingen bakåtrullning i M1.
- Värld: oändlig gata av handgjorda bitar i slumpad ordning (M4) – stad → park → strand,
  långsam dygnsrytm. M1 använder en matematisk böljande väg som platshållare.
- Hinder v1: flatground, kickers, kantstenar, trappor/gaps. Grinds/slides = v2.

## Trick – en gest per trick

1. **Finger ner** (höger zon) = pop
2. **Dra** med fingret kvar = flick (väljer trick)
3. **Lyft** = catch – timingen ger kvaliteten

Rent tryck = ollie.

| Svep | Trick | Svårighet | Vinkeltolerans |
|---|---|---|---|
| tryck | Ollie | ★ | – |
| ↓ | Pop shove-it | ★★ | ±35° |
| ↑ | FS shove-it | ★★ | ±35° |
| ← | Kickflip | ★★ | ±35° |
| → | Heelflip | ★★ | ±35° |
| ↙ | Varial kickflip | ★★★ | ±25° |
| ↖ | Hardflip | ★★★★ | ±20° |
| båge ↓→← (kvartscirkel) | 360 flip | ★★★★★ | rätt krökning |

Slarvigt svep → fel trick → fall. Stances (nollie/fakie/switch) senare, multiplicerar svårighet.

### Catch-fönster (± kring ögonblicket brädan roterat klart)

| | ★–★★ | ★★★ | ★★★★–★★★★★ |
|---|---|---|---|
| Perfect | ±50 ms | ±40 ms | ±30 ms |
| Clean | ±100 ms | ±80 ms | ±60 ms |
| Sloppy | ±160 ms | ±130 ms | ±100 ms |
| utanför | fall | fall | fall |

Greptejpen blinkar när den vänder upp = visuell catch-ledtråd. Alla värden i `src/config.js`.

## Feedback

- **Popup:** tricknamn stort, kvalitet under, svårighet i stjärnor. Tonar bort ~1,5 s. Inga poäng.
- **Första gången** ett trick landas: större "NEW!"-effekt + ackord.
- **Perfect:** hitstop ~80 ms, ljust ackord, dammpuff, stark haptik, lätt kamera-zoom.
- **Clean:** nöjt "klonk", lätt haptik. **Sloppy:** vingel, skrapigt ljud.
- **Fall:** mjukt – snubblar, joggar ikapp brädan, igång efter ~1,5 s. Inget game over.
- **Varför man föll:** diskret ikon (för tidigt / för sent / fel riktning) som tonar bort.

## Progression

- **Trickboken:** per trick – gest-illustration, försök, landade %, perfekta %.
- Nivåer: **Learning** → **Landed** (första landning) → **Mastered** (10 perfekta, guldkant).
- Allt tillgängligt från start. Mastered låser upp färger på kläder/bräda.
- Diskreta tips i början, ingen tutorialbana.
- Sparning: localStorage nu (lägg Cruise på hemskärmen – Safari rensar annars), Capacitor-lagring i appen.

## Stil

Förebild för *principerna* (inte looken): Journey. Vi lånar teknikerna, inte deras
figur, mantel, öken eller mönster – Cruise är en skejtare i en stad i gyllene ljus.

- **Nästan monokrom varm miljö** (sand/persika/guld) + **en mättad accent**: figurens
  teal-färgade huvtröja (inte röd – för att inte likna Journeys mantel), korall mössa som sekundär.
- **Luftperspektiv:** varje parallax-lager blandas mot `FOG` ju längre bort; dimband mellan lagren.
- **Ljus:** solskiva med stor bloom, mjuka ljusstrålar (additiva), dammkorn som svävar i ljuset, drivande moln.
- **Sekundär rörelse:** fjädrar för lutning/nedböjning/huvud (lätt överslag = mjukhet),
  huvtröjans bakkant fladdrar i fartvinden, verlet-simulerade snören, studsande pompom och huva,
  knäna fjädrar vid trottoarskarvar. Kod: `src/cloth.js`, `src/atmosphere.js`.
- **Från INSIDE:** fint brus över bilden mot färgband i gradienter + svagt filmkorn (`grain`);
  markdimma i världen (`src/fog.js`) – dimbankar som driver med vinden, olika täta längs vägen,
  ett lager bakom och ett framför gubben så han åker *genom* dimman (`fogAmount`); disets
  täthet i fjärran följer samma täthet. Gubben andas i takt med musiken (två andetag per ackord).
- **Stämning (`mood`, `src/palette.js`):** tre nyckellägen som blandas – 0 = GOLDEN (Journey),
  0,5 = EMBER (blandningen: mörk plommonhimmel över brinnande horisont, mörka varma siluetter),
  1 = DUSK (INSIDE: mörk skifferhimmel, nästan svarta siluetter, lyktor som lyser).
  Standard 0,5. Samma nyckellägen animeras av dygnsrytmen i M4.
- **Gubben i luften:** lätt oskärpa på konturerna (`riderSoftness`) + lite dis i hans färger
  (`riderHaze`); skuggas mot skymningen och får varmt motljus i kanten vid mörkare stämning.
- **Outfit (`src/outfit.js`):** färgton/mättnad/ljushet per plagg (tröja, byxor, mössa) i dev-panelen,
  med förval (Original, Svart, Svart/röd, Sand). Snören och skor alltid benvita. Kantljuset tar
  tröjans färg i dagsljus och blir varmt motljus i skymning – håller en svart outfit läsbar.
- **Förgrund (`src/foreground.js`):** mörka, lätt suddiga siluetter mellan kamera och gubbe,
  parallax 1,45 (skymning blir kort), vajar i vinden, färg följer `mood`. Mot enformighet:
  - **Zoner** som glider fram längs vägen: *park* (träd, buskar, ormbunkar, blommor, vass, bänkar),
    *gata* (vägskyltar, gatunamn, busskur, cykelställ, pollare, elskåp, trafikljus, elsparkcykel,
    brandpost, krukor, elledningar, ljusslingor, hängande butiksskyltar), *villa* (brevlådor,
    häckar, staket/räcken, buskar, ljusslingor).
  - Aldrig samma föremål två gånger i rad; tomma platser ger andrum; storlek och spegling varierar.
  - **Procedurella grenar** i 6 stilar: ek, hängbjörk, gran, lönn, kal, murgröna. Träd: björk
    (med näverränder), ek, tall.
  - Ljusslingor, trafikljus och hängande lampor glöder (starkare i skymning).
  - Reglage: `foreground` (0 av, <0,5 utan träd), `fgBlur`. Inför trick (M2–3): bedöm om träd
    i full höjd stör läsbarheten – i så fall glesa ut eller tona ner när de passerar gubben.
- Platt geometrisk vektorgrafik, mjuka gradienter, allt ritat i kod.
- En ansiktslös figur (hoodie + mössa), kroppsspråket gör jobbet.
- Ljud: procedurellt i prototypen, "inbäddat i bomull" (lågpass + kompressor på master);
  egna inspelade skateljud inför release.
- **Musik: generativ ambient i kod** (`src/music.js`) – ersätter lo-fi-loopen. Långsamma pad-ackord
  (Dmaj9 → Bm9 → Gmaj9 → A6/9, 8 s/ackord), mjuk bas, glesa vindspelstoner (D-dur pentatonisk) i stor reverb.
  Reagerar på farten: tunnare/mörkare när man står still, fylligare/ljusare + fler toner i fart.
  **Allt i D-dur** – landningsljud (M2) byggs av `currentChordNotes()` så de alltid stämmer med musiken.
  Egen volym `musicVolume` i dev-panelen.
- Fotljud: skrap vid spark nästan ohörbart; ytterst dov duns när foten landar på brädan igen.

## Verktyg

- **Dev-panel:** trefingertryck (telefon) eller `D` (dator). Reglage för all fysik/känsla,
  sparas i localStorage. "Kopiera ändringar" ger JSON att klistra in till Claude.
- Dator-test: `A` / `←` = vänster tumme.

## Milstolpar

Varje steg testas på telefonen och godkänns innan nästa.

1. **Rullkänsla** – push, momentum, lutning, kamera, hjulljud. *(klar för test 2026-11-21)*
2. **Ollie** – pop, luft, catch, landning, fall, landningsfeedback
3. **Alla 8 trick** – gestigenkänning, popup
4. **Världen** – gatubitar, kantstenar, trappor, parallax, dygnsrytm
5. **Trickboken** – statistik, mastery, tips, sparning, vänsterhänt läge
6. **Polering + Capacitor** – haptik, iPhone-build, ikon
