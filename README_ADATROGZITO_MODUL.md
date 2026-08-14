# Adatrögzítő modul közétkeztetőknek

A kliensoldali PWA az élelmiszerhulladék-keletkezési megfigyelési ív digitális kitöltésére szolgál.

## Export
A fő exportgomb ZIP-csomagot készít `entry_events.csv`, `entry_media.csv`, `manifest.json` és `photos/` tartalommal. A csomag közvetlenül betölthető a kapcsolódó adatfeldolgozó modul **Adatimport** felületén.

Az `entry_events.csv` tartalmazza az `adatrögzítő_neve` mezőt is. A tizedesértékek a CSV-ben magyar tizedesvesszővel íródnak, az oszlopelválasztó pontosvessző.

## Érzékszervi adatfelvétel
Az öt 1–5 pontos attribútumhoz CATA-jellemzők tartoznak. A `Megfelelő` csak 5 pontos értékelésnél választható; 1–4 pontnál kizárólag kedvezőtlen/hibajellemző tulajdonságok választhatók. Minden attribútumlistában legalább 30 előre definiált jellemző található.
