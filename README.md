# Annas Licht

Eine Erinnerungsseite: Wo ist das Licht von Annas Leben gerade unterwegs - und welcher Stern sieht in diesem Augenblick welchen Tag?

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

Vor jeder Änderung an der Seite `sh tools/bump.sh` ausführen: Das gibt allen Dateien eine gemeinsame Versionsnummer und erneuert den Fingerabdruck der Import-Map in der Content-Security-Policy von `index.html`.
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

## Sicherheit in Kürze

- Private Erinnerungen und Fotos liegen nur verschlüsselt im Repository; den Schlüssel bekommt nur, wer Name und Passwort eines Zugangs kennt. Die Passwörter sollten lang sein, denn die verschlüsselten Dateien sind öffentlich abrufbar.
- Der GitHub-Token zum Speichern steckt verschlüsselt in den Zugängen. Er läuft irgendwann ab: Dann geht Ansehen weiter, Speichern nicht. Unter „Anmelden“ kann die Verwaltung einen neuen Token eintragen, der sofort für alle gilt.
- Die Seite lädt nichts von fremden Servern außer den Wetterdaten (Open-Meteo) und spricht sonst nur mit GitHub; eine Content-Security-Policy erzwingt das.
- Die Rollen (Verwaltung, Mitgestalten, Nur ansehen) sind eine Hilfe der Oberfläche, keine harte Grenze.
