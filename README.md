# Adatrögzítő modul közétkeztetőknek – anonimizált demonstrációs verzió

Mobilbarát, kliensoldali adatbeviteli modul az élelmiszerhulladék-keletkezési megfigyelési ív strukturált rögzítéséhez.

A GitHubon közzétett változat anonimizált intézménytörzset használ (`Általános_iskola_01`, `Óvoda_01`, `Bölcsőde_02` stb.). A nyilvános/bírálói használat során az adatrögzítő mezőben is kódolt azonosító (például `Rögzítő_01`) használata javasolt, nem személynév.

A modul korcsoportonként rögzíti a leves és a második fogás kitálalt mennyiségét, visszamért hulladékát, hőmérsékletét, dolgozói érzékszervi értékelését és opcionális ételfotóját.

A fő export ZIP-csomagot készít, amely tartalmazza:
- `entry_events.csv`
- `entry_media.csv`
- `manifest.json`
- `photos/`

A CSV-k pontosvesszővel tagoltak, a numerikus tizedesjel vessző. Az `adatrögzítő_neve` exportmező a kompatibilitás érdekében megmaradt, de a nyilvános verzióban kódolt azonosítót célszerű rögzíteni benne.

## GitHub Pages
A repository gyökerében lévő `index.html` közvetlenül publikálható GitHub Pages segítségével. A modul működéséhez nincs szerveroldali adatbázis; a rögzített adatok a felhasználó böngészőjének helyi IndexedDB-adatbázisában maradnak, amíg a felhasználó nem exportálja őket.

## Adatvédelmi megjegyzés
A nyilvános forráskód nem tartalmazza a kutatás eredeti település- vagy intézményneveit, és nem tartalmaz eredeti–anonim megfeleltetési kulcsot.
