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

## Trick – två medvetna rörelser (ändrat 2026-11-22, Toms idé)

1. **Ollie (pop):** höger tumme **ner = gå ner på huk** (stannar där så länge du håller),
   **snäpp uppåt = pop**. Snäppets fart ger höjden; ollien betygsätts av snäppet:
   snabbt + rakt = Perfect, långsamt eller snett = Sloppy (`cleanSnap`/`perfectSnap`, `cleanAngle`/`perfectAngle`).
   Tryck utan att dra uppåt = reser sig igen. Går även från stillastående.
2. **Trick (M3):** ny rörelse i luften – sätt ner fingret, **svep i en riktning** (flick = väljer trick),
   **håll**, **släpp = catch** när brädan roterat klart → Sloppy/Clean/Perfect.

Luft: ~0,9 s, mjukt **häng** vid toppen (lägre gravitation nära vändpunkten, `hangGravity`).
**Kroppen hoppar, brädan följer** (rättat efter Toms referensfoton 2026-11-22): huk innan pop är bara en
lätt knäböj; i luften stannar höften högt och knäna dras UPP och ISÄR (grodhuk: framknä mot nosen, bakknä mot tailen) – inte höften ner mot brädan;
bakfoten på tailen, framfoten glider mot nosen, fötterna lättar från brädan vid toppen; brädan ~50° nos-upp
vid popet. Keyframes i `OLLIE_KEYS` (render.js).
Ingen konstant slow motion – den bryter rytmen och slits ut. `airSlowmo` finns som reglage (0 = av);
slow motion sparas som belöning för sällsynta ögonblick. Animation följer ollie-infografikens 6 faser:
huk → tail slår (nosen upp, brädan vrids kring tailen) → framfoten drar upp → benen in vid toppen →
framfoten planar ut → mjuk landning med böjda knän.

| Svep (i luften) | Trick | Svårighet | Vinkeltolerans |
|---|---|---|---|
| snäpp ↑ (pop) | Ollie | ★ | se ovan |
| ↓ | Pop shove-it | ★★ | ±35° |
| ← | Kickflip | ★★ | ±35° |
| → | Heelflip | ★★ | ±35° |
| ↗ (var ↑ – ↑ är nu pop) | FS shove-it | ★★ | ±35° |
| ↙ | Varial kickflip | ★★★ | ±25° |
| ↖ | Hardflip | ★★★★ | ±20° |
| båge ↓→← (kvartscirkel) | 360 flip | ★★★★★ | rätt krökning |

> Mappningen ses över i M3 – ↑ i luften är nu ledig men kan förväxlas med pop.

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
- **Perfect:** hitstop ~60 ms, ljust ackord byggt ur musikens aktuella ackord (`landingChime`), stark haptik,
  lätt kamera-zoom. För ollien nedtonat till ett kort pling – fanfaren sparas till svårare trick.
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
- **Förgrund (`src/foreground.js`)**, i stil med Toms referensbilder (silhuett-illustration):
  - **Böljande landskap** längs nederkanten i två lager (främre mörkast, parallax 1,45; bakre disigare,
    1,2) med bara enstaka mjuka grästuvor på krönen. Reglage `hills` (0,5).
  - På kullarna: enstaka **helt svarta vägskyltar** (svart skiva, triangel eller gatunamnsblad på en
    pinne – inga genomskinliga detaljer) och några buskar. Glest.
  - Färg följer `mood`. Reglage: `foreground`, `fgBlur` (1,6).
  - Provat och bortvalt 2026-11-21/22: stadsföremål överallt, spretig äng, granar, alla träd och
    hängande grenar.
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

1. **Rullkänsla** – push, momentum, lutning, kamera, hjulljud. *(godkänd 2026-11-22)*
2. **Ollie** – huk + snäpp, luft med häng, 6-fasanimation, landning, popup, statistik *(byggd 2026-11-22, finjusteras – ej formellt godkänd)*
3. **Alla 8 trick** – gestigenkänning, popup
4. **Världen** – gatubitar, kantstenar, trappor, parallax, dygnsrytm
5. **Trickboken** – statistik, mastery, tips, sparning, vänsterhänt läge
6. **Polering + Capacitor** – haptik, iPhone-build, ikon

## Status & nästa steg (2026-11-22, slut på passet)

**Klart:** M1 godkänd. M2 ollie byggd och testad på telefon: gest (huk + snäpp uppåt), animation
omgjord efter referensfoton (kroppen hoppar, grodhuk med knäna isär, smal stans vid toppen),
landningsfeedback, popup med NEW!, statistik. Toms värden: `popVel` 375, `hangWindow` 205,
`perfectSnap` 2000. Förgrund = böljande kullar + helt svarta skyltar + buskar (finslipas senare).
Service worker (network-first) + Uppdatera-knapp löser cache-problemet på telefonen.

**Kväll 2026-11-22 – rörelser från sprite-ark (branch `character-motion`, mergad):** ollie-armarna
kastas ut brett vid popet och sjunker först efter landning. Mjukt fall byggt: vingla → snubbla av → dyk →
magglid (mössan flyger av, brädan rullar iväg) → "…" → resa sig → lufsa ikapp (långa steg), plocka upp
mössan → hoppa på. Utlösare provisorisk: snäpp > `bailAngle` 45°, dev-knappen "Testa fall", F-tangent.
Broms: håller man kvar fingret längre än `brakeHold` (0,28 s) stannar sparkfoten i marken och bromsar i stället för att sparka klart (0,12 s var för kort – vanliga dutt avbröts).
Förhandsversioner testas på `/preview/` (kopia av en branch i `preview/` på main, egna inställningar).

**Öppet i M2 att stämma av nästa gång:**
- `perfectAngle` 12° kan vara för snävt – Toms tumme snäpper naturligt ~17°. Pröva 20°?
- Kännas landningen, plinget och popupen rätt? Höjd/airtime ok efter nya värden?
- Formellt godkännande av M2 innan M3.

**Nästa: M3 – alla trick.** Andra rörelsen i luften: sätt ner fingret, svep (riktning = trick), håll,
släpp = catch. Att göra: se över svepmappningen (↑ är nu pop, FS shove-it flyttad till ↗),
gestigenkänning med vinkeltolerans, brädans rotationer (flip/shove) i animationen, greptejps-blink som
catch-ledtråd, catch-fönster → Sloppy/Clean/Perfect, koppla det befintliga fallet till missade catcher, diskret
ikon för varför man föll, större fanfar för svårare trick.
