# GitHub Pages – gyors publikálás

A ZeroWaste Entry Web statikus oldal, ezért GitHub Pagesen közvetlenül fut.

## 1. Repository

Hozz létre például:

`zerowaste-entry`

és töltsd fel a ZIP tartalmát a repository gyökerébe.

## 2. Pages

GitHub repository:

**Settings → Pages → Build and deployment**

Egyszerű pilotnál választható a branch alapú publikálás:
- Branch: `main`
- Folder: `/ (root)`

A GitHub által generált cím például:

`https://felhasznalonev.github.io/zerowaste-entry/`

## 3. Telefon

Nyisd meg az URL-t Chrome/Safari böngészőben.

A PWA telepíthető a kezdőképernyőre. Ekkor közel natív alkalmazásként nyílik meg.

## 4. Hol vannak az adatok?

A mérési adatok nem a GitHub repositoryban vannak, hanem a telefon böngészőjének IndexedDB adatbázisában.

Ezért:
- ne töröld a webhelyadatokat biztonsági mentés nélkül;
- rendszeresen exportálj ZeroWaste XLSX-et vagy JSON biztonsági mentést.

## Következő szint

Ha automatikus központi mentést szeretnél, a statikus GitHub Pages frontendet változatlanul megtarthatjuk, és mögé Supabase/PostgreSQL szinkront tehetünk.
