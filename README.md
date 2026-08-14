# Adatrögzítő modul közétkeztetőknek

Mobilbarát, kliensoldali adatbeviteli modul az élelmiszerhulladék-keletkezési megfigyelési ív strukturált rögzítéséhez.

A modul intézményenként és korcsoportonként rögzíti a leves és a második fogás kitálalt mennyiségét, visszamért hulladékát, hőmérsékletét, dolgozói érzékszervi értékelését és opcionális ételfotóját.

A fő export egy ZIP-csomag, amely közvetlenül betölthető a hozzá tartozó adatfeldolgozó modulba. A ZIP tartalma:
- `entry_events.csv`
- `entry_media.csv`
- `manifest.json`
- `photos/`

A CSV-k pontosvesszővel tagoltak, a numerikus tizedesjel vessző. Az export tartalmazza az adatrögzítő nevét.

A használathoz nyissa meg az `index.html` fájlt, vagy telepítse a statikus fájlokat HTTPS-kiszolgálásra/PWA-ként.
