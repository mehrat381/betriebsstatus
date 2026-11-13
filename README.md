# Betriebsstatus-Widgets

Zeigt den aktuellen Betriebsstatus (Bahnen, Pisten, Wege, Freizeit, Gastronomie) der Gebiete
Kleine Scheidegg / Männlichen, Grindelwald-First und Mürren-Schilthorn auf beliebigen Webseiten an.
Datenquelle ist der Feed von Siscontrol SISMedia.

## So funktioniert es

1. Eine **GitHub Action** läuft alle 15 Minuten, holt den Feed und erzeugt daraus pro Gebiet
   aufbereitete Dateien im Ordner `api/`. Geändert und committet wird nur, wenn sich die Daten
   tatsächlich geändert haben.
2. **GitHub Pages** stellt `api/` und `widget.js` öffentlich bereit.
3. Auf der Webseite genügt ein kurzer Code-Schnipsel. Das Widget lädt die Daten und aktualisiert
   sich alle 10 Minuten selbst.

```
Feed (SISMedia) ──► GitHub Action (scripts/build.py) ──► api/*.json ──► GitHub Pages ──► widget.js auf der Webseite
```

## Einrichten (einmalig)

1. **Neues Repository** auf GitHub anlegen und alle Dateien dieses Ordners hochladen
   (inkl. der versteckten Ordner `.github/` und der Datei `.nojekyll`).
2. **Feed-Adresse hinterlegen:** *Settings → Secrets and variables → Actions → New repository secret*
   - Name: `FEED_URL`
   - Wert: die vollständige URL des SISMedia-Feeds (inkl. eines allfälligen Schlüssels).
     Die Adresse steht so nie im Code und ist für Aussenstehende nicht sichtbar.
3. **Schreibrechte für Actions:** *Settings → Actions → General → Workflow permissions →
   Read and write permissions* auswählen und speichern.
4. **GitHub Pages einschalten:** *Settings → Pages → Build and deployment → Source: Deploy from a branch*,
   Branch `main`, Ordner `/ (root)`.
5. **Ersten Lauf starten:** *Actions → Betriebsstatus aktualisieren → Run workflow*.
   Danach liegt `api/` im Repository.
6. Nach ein bis zwei Minuten ist die Demo-Seite erreichbar unter
   `https://<BENUTZER>.github.io/<REPO>/`. Dort Optionen wählen und den Code kopieren.

## Einbinden auf der Webseite

```html
<div data-bss-tenant="grindelwald-first"></div>
<script src="https://<BENUTZER>.github.io/<REPO>/widget.js" defer></script>
```

Das Script muss pro Seite nur einmal eingebunden werden, auch bei mehreren Widgets.

| Attribut | Werte | Bedeutung |
|---|---|---|
| `data-bss-tenant` | `kleine-scheidegg`, `grindelwald-first`, `muerren-schilthorn` | Gebiet (Pflicht) |
| `data-bss-season` | `auto` (Standard), `summer`, `winter` | Saison; `auto` wählt nach Datum |
| `data-bss-categories` | z.B. `1,2` | nur bestimmte Kategorien (Nummern siehe unten) |
| `data-bss-hide-unknown` | `true` | Objekte mit Status «unbekannt» ausblenden |
| `data-bss-expanded` | `true` | alle Kategorien aufgeklappt anzeigen |
| `data-bss-details` | `true` | Betriebszeiten, Länge und Infotexte anzeigen |
| `data-bss-title` | Text | eigener Titel statt Gebietsname |
| `data-bss-base` | URL | andere Datenquelle (Standard: Ordner von `widget.js`) |

### Kategorien

| Nr. | Kategorie | Unterkategorien (Typ-Code aus dem Feed) |
|---|---|---|
| 1 | Bahnen & Lifte | Pendelbahn (1), Gondelbahn (2), Skilift (3), Sesselbahn 2er/4er/6er (5/6/7), Standseilbahn (9), Schienenbahn (10), Zahnradbahn (11), Förderband (14), Kinderlift (15) |
| 2 | Pisten | Blaue (1), Rote (2), Schwarze Piste (3), Talabfahrt (8), Gelbe Freeride-Piste (13) |
| 3 | Langlauf | klassisch (5), skating (6) |
| 4 | Schlittelwege | Schlitteln (9) |
| 5 | Wanderwege | Wanderweg (2) |
| 6 | Schneeschuhwege | Schneeschuhwanderweg (1) |
| 7 | Klettersteige | Klettersteig (3) |
| 8 | Freizeit & Angebote | alle POI-Typen des Feeds |
| 9 | Gastronomie | Bar (1), Restaurant (2) |

### Status

| Code | Anzeige | zählt als offen |
|---|---|---|
| 0 | unbekannt (im Feed «Disabled») | nein |
| 1 | geschlossen | nein |
| 2 | offen | ja |
| 3 | in Vorbereitung | nein |
| 7 | frei | ja |
| 8 | voll | ja |

Objekte mit Saison-Code 0 (ganzjährig) erscheinen im Sommer und im Winter.

## Anpassen

Alles Inhaltliche steht in **`config.json`**:

- `exclude` – Gebiete, die nicht erscheinen sollen (aktuell «Jungfrau Region»).
- `tenants` – Kurzname (für `data-bss-tenant`) und Titel pro Gebiet.
- `season` – ab welchem Datum `auto` Winter bzw. Sommer zeigt (Standard: Winter ab 15.11., Sommer ab 01.05.).
- `status` – Anzeigetexte und welche Status als «offen» zählen.
- `categories` – Kategorien, Nummern und welche Typ-Codes dazugehören.

Nach dem Committen einer Änderung läuft die Action automatisch einmal neu.
Farben und Schrift des Widgets stehen oben in `widget.js` (Funktion `injectStyles`).

## Lokal testen

```bash
python scripts/build.py --input pfad/zum/feed.json     # optional: --now 2026-07-01 simuliert ein Datum
python -m http.server 8000                             # dann http://localhost:8000 öffnen
```

## Dateien der API

| Datei | Inhalt |
|---|---|
| `api/index.json` | Liste der Gebiete und aktuelle Saison |
| `api/<gebiet>/summer.json` | Sommer |
| `api/<gebiet>/winter.json` | Winter |
| `api/<gebiet>/current.json` | aktuelle Saison laut Datum |

`updated` in jeder Datei = Zeitpunkt der letzten inhaltlichen Änderung.

## Hinweise

- GitHub führt zeitgesteuerte Workflows nicht minutengenau aus; Verzögerungen sind möglich.
- In öffentlichen Repositories deaktiviert GitHub zeitgesteuerte Workflows nach 60 Tagen ohne
  Aktivität im Repository. Solange sich die Daten regelmässig ändern, entstehen Commits;
  falls der Workflow trotzdem einmal deaktiviert wird, unter *Actions* wieder einschalten.
- GitHub Pages ist bei kostenlosen Konten nur für öffentliche Repositories verfügbar.
  Die aufbereiteten Daten sind damit öffentlich einsehbar – Nutzung mit dem Datenlieferanten abklären.
