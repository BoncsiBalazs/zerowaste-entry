# ZeroWaste Entry Web / PWA

Ez a ZeroWaste Entry teljesen kliensoldali webalkalmazás. A használó telefonján vagy tabletjén fut a böngészőben; **nem kell R, RStudio vagy bekapcsolt PC**.

## Működés

- GitHub Pages kiszolgálja a statikus HTML/CSS/JavaScript fájlokat.
- A beküldött mérési adatok a készülék **IndexedDB** helyi adatbázisába kerülnek.
- A webapp PWA-ként telepíthető a telefon kezdőképernyőjére.
- Az első sikeres betöltés után az alkalmazás alapfunkciói offline is használhatók.
- XLSX és CSV export készíthető ZeroWaste raw struktúrában.
- Az XLSX export intézményenként külön munkalapot készít.

## Fontos adatbiztonsági korlát

A GitHub Pages nem adatbázis. A beküldött adatok **nem kerülnek fel a GitHub repositoryba**; a telefonon maradnak.

Ez az egykészülékes pilothoz megfelelő. A böngésző webhelyadatainak törlése az IndexedDB adatokat is törölheti, ezért rendszeres XLSX/CSV vagy JSON biztonsági export javasolt.

Ha később automatikus felhőmentés vagy több készülékes használat kell, a következő réteg egy központi adatbázis (például Supabase/PostgreSQL) lesz.

## GitHub Pages telepítés

1. Hozz létre egy új GitHub repositoryt, például `zerowaste-entry`.
2. Töltsd fel a csomag összes fájlját a repository gyökerébe.
3. GitHub: **Settings → Pages**.
4. A publikálási forrásnál válaszd a `main` branch gyökerét (`/ root`), vagy használj GitHub Actions Pages workflow-t.
5. A webapp címe tipikusan:
   `https://FELHASZNALONEV.github.io/zerowaste-entry/`
6. Telefonon nyisd meg ezt az URL-t.
7. Android/Chrome alatt válaszd a „Telepítés” / „Hozzáadás a kezdőképernyőhöz” lehetőséget.

## Bemeneti logika

Közös beküldés:
- dátum;
- korosztály;
- intézmény;
- leves;
- leves sensory;
- második fogás;
- második sensory;
- ellenőrzés és beküldés.

Minden kötelező mező validálva van. A rendszer nem enged tovább/beküldeni, ha kötelező adat vagy szükséges egységkonverziós paraméter hiányzik.

## Adagolási konverzió

A felhasználó megadhat:
- kg;
- liter;
- darab;
- adag.

Standard ZeroWaste dimenziók:
- leves kitálalt mennyiség → liter;
- második fogás kitálalt mennyiség → kg;
- visszamért hulladék → kg.

Az adagolási útmutató tartományainál automatikus konverzióhoz a tartomány középértéke kerül felhasználásra. Az eredeti mennyiség, eredeti egység és a konverzió alapja is mentésre kerül.

## 63 °C

A hőmérséklet csúszkán rögzíthető. 63 °C alatti értéknél a felület piros figyelmeztetést mutat.

## Export

Az Export oldalon megadható:
- kezdő dátum;
- záró dátum;
- intézmény.

Kimenet:
- `.xlsx`;
- `.csv`;
- teljes helyi JSON biztonsági mentés.

Az XLSX/CSV oszlopai közvetlenül a ZeroWaste hulladék raw importjához igazodnak.

## Reference adatok

A `data.js` a korábban összeállított törzsadatokat tartalmazza:
- korcsoportok;
- intézmények;
- étlap + standardizált ételnevek;
- fogás-komponens besorolások;
- adagolási útmutató;
- érzékszervi descriptorok.

Az alkalmazásban új intézmény és új étel is hozzáadható; ezek az adott készülék helyi adatbázisában maradnak.
