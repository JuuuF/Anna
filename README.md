# Annas Licht

Eine Erinnerungsseite: Wo ist das Licht von Annas Leben gerade unterwegs – und welcher Stern sieht in diesem Augenblick welchen Tag?

Die Seite ist ein persönliches Geschenk für Familie und Freunde. Persönliche Erinnerungen und Fotos liegen in diesem
Repository ausschließlich verschlüsselt (`data/private.enc`, `media/*.bin`) und sind nur mit einem Zugang lesbar.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `style.css`, `js/` | die Seite (reines HTML/CSS/JavaScript, kein Build-Schritt) |
| `js/space.js`, `js/sky.js` | 3D-Karte und Nachthimmel über Neumünster |
| `js/store.js` | Daten, Verschlüsselung (AES-GCM, PBKDF2), Speichern über die GitHub-API |
| `data/stars.json`, `data/sky.json` | Sternkatalog, erzeugt mit `tools/build_catalog.py` |
| `data/public.json` | öffentliche Eckdaten und Momente |
| `data/users.json` | je Zugang eine versiegelte Box (öffnet sich nur mit Name + Passwort) |

Vor jeder Änderung an der Seite `sh tools/bump.sh` ausführen (gibt allen Dateien eine gemeinsame Versionsnummer).
Bildschirmfotos in vier Gerätegrößen: `sh tools/shots.sh <Ordner> <Name> '#demo'`.

Lokal ansehen: `python3 -m http.server` und <http://localhost:8000> öffnen.
Datenschicht testen: `node tools/test_store.mjs`.

## Ersteinrichtung

1. Auf GitHub einen *fine-grained personal access token* anlegen: nur dieses Repository, Berechtigung **Contents: Read and write**.
2. Auf der Seite „Anmelden“ öffnen, Name, Passwort und Token eintragen.
3. Danach unter „Anmelden“ die Grunddaten eintragen und weitere Zugänge anlegen.

## Quellen

Sterndaten: [HYG-Datenbank](https://github.com/astronexus/HYG-Database) (Hipparcos, Yale Bright Star, Gliese; CC BY-SA 4.0) und
[NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/). Sternbildlinien: [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3).
