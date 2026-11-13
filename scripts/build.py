#!/usr/bin/env python3
"""Holt den SISMedia-Feed und erzeugt daraus die Dateien unter api/.

Aufruf:
  FEED_URL=https://... python scripts/build.py      # Live-Feed (so läuft es in GitHub Actions)
  python scripts/build.py --input feed.json         # lokale Datei zum Testen

Erzeugt:
  api/index.json                      Liste der Gebiete + aktuelle Saison
  api/<gebiet>/summer.json            Sommerdaten
  api/<gebiet>/winter.json            Winterdaten
  api/<gebiet>/current.json           die laut Datum aktuelle Saison

Eine Datei wird nur neu geschrieben, wenn sich ihr Inhalt geändert hat.
Das Feld "updated" zeigt deshalb, wann sich die Daten zuletzt geändert haben.
Nur die Standardbibliothek wird verwendet, keine Installation nötig.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
API = ROOT / "api"
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))

TYPE_TABLES = {"lifts": "liftTypes", "slopes": "slopeTypes", "trails": "trailTypes",
               "pois": "poiTypes", "gastros": "gastroTypes"}
SEASON_CODES = {"summer": (1, 0), "winter": (2, 0)}  # 0 = ganzjährig, erscheint in beiden


def load_feed(args):
    if args.input:
        return json.loads(Path(args.input).read_text(encoding="utf-8"))
    url = os.environ.get("FEED_URL", "").strip()
    if not url:
        sys.exit("Fehler: Weder --input noch die Umgebungsvariable FEED_URL ist gesetzt.")
    req = urllib.request.Request(url, headers={"User-Agent": "betriebsstatus-build/1.0",
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def slugify(name):
    s = name.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def text(value):
    if isinstance(value, dict):
        return (value.get("de") or value.get("en") or "").strip()
    return (value or "").strip()


def clean_info(s):
    """Markdown aus dem Feed in schlichten Text mit Links umwandeln (wird im Widget escaped)."""
    s = (s or "").replace("**", "").replace("*", "").strip()
    links = [{"text": t, "url": u} for t, u in re.findall(r"\[([^\]]+)\]\((https?://[^)]+)\)", s)]
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1", s)
    link_texts = {l["text"] for l in links}
    # Zeilen, die nur aus einem Link bestehen, nicht doppelt als Text führen
    lines = [ln.strip() for ln in s.splitlines() if ln.strip() and ln.strip() not in link_texts]
    return " · ".join(lines), links


def current_season(now):
    cfg = CONFIG["season"]
    md = now.strftime("%m-%d")
    ws, ss = cfg["winterStart"], cfg["summerStart"]
    # Winter läuft über den Jahreswechsel: ab winterStart oder vor summerStart
    return "winter" if (md >= ws or md < ss) else "summer"


def category_for(source, type_id):
    cats = [c for c in CONFIG["categories"] if c["source"] == source]
    for c in cats:
        if c["types"] and type_id in c["types"]:
            return c
    for c in cats:
        if c["types"] is None:
            return c
    return None


def build_tenant(tenant, season, type_names):
    status_cfg = CONFIG["status"]
    cats = {}
    for source in TYPE_TABLES:
        for o in tenant.get(source, []) or []:
            if o.get("season") not in SEASON_CODES[season]:
                continue
            cat = category_for(source, o.get("type"))
            if not cat:
                continue
            st = status_cfg.get(str(o.get("status")), {"key": "unknown", "label": "unbekannt", "counts_as_open": False})
            info, links = clean_info(o.get("info"))
            item = {
                "id": o.get("id"),
                "name": text(o.get("name")),
                "label": (o.get("label") or "").strip(),
                "status": st["key"],
                "statusLabel": st["label"],
                "statusCode": o.get("status"),
                "isOpen": st["counts_as_open"],
                "sort": o.get("sort", 0),
            }
            for k_src, k_out in (("firstRide", "firstRide"), ("lastRide", "lastRide")):
                if o.get(k_src):
                    item[k_out] = o[k_src]
            if o.get("lengthMeter"):
                item["lengthMeter"] = o["lengthMeter"]
            if info:
                item["info"] = info
            if links:
                item["links"] = links
            web = text(o.get("website"))
            if web.startswith("http"):
                item["website"] = web

            c = cats.setdefault(cat["nr"], {"nr": cat["nr"], "name": cat["name"], "subcategories": {}})
            tid = o.get("type")
            sub = c["subcategories"].setdefault(tid, {
                "nr": tid, "name": type_names[source].get(tid, f"Typ {tid}"), "items": []})
            sub["items"].append(item)

    out = []
    for nr in sorted(cats):
        c = cats[nr]
        subs = []
        for tid in sorted(c["subcategories"], key=lambda t: c["subcategories"][t]["name"]):
            s = c["subcategories"][tid]
            s["items"].sort(key=lambda i: (i["sort"], i["name"]))
            s["total"] = len(s["items"])
            s["open"] = sum(i["isOpen"] for i in s["items"])
            subs.append(s)
        out.append({"nr": c["nr"], "name": c["name"], "total": sum(s["total"] for s in subs),
                    "open": sum(s["open"] for s in subs), "subcategories": subs})
    return out


def write_if_changed(path, payload, now_iso):
    """Schreibt nur bei inhaltlicher Änderung; 'updated' bleibt sonst unverändert."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
            if {k: v for k, v in old.items() if k != "updated"} == payload:
                return False
        except ValueError:
            pass
    data = dict(payload, updated=now_iso)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="Lokale JSON-Datei statt FEED_URL")
    ap.add_argument("--now", help="Zeitpunkt simulieren, z.B. 2026-07-01 (nur für Tests)")
    args = ap.parse_args()

    feed = load_feed(args)
    if not isinstance(feed, dict) or not feed.get("tenants"):
        sys.exit("Fehler: Feed hat kein Feld 'tenants' – nichts geschrieben.")

    tz = ZoneInfo(CONFIG["season"]["timezone"])
    now = dt.datetime.fromisoformat(args.now).replace(tzinfo=tz) if args.now else dt.datetime.now(tz)
    now_iso = now.isoformat(timespec="seconds")
    season_now = current_season(now)

    type_names = {src: {x["id"]: x["type"] for x in feed.get(tbl, [])} for src, tbl in TYPE_TABLES.items()}
    excluded = set(CONFIG.get("exclude", []))

    changed, tenants_index = [], []
    for t in feed["tenants"]:
        name = t.get("tenantName", "")
        if name in excluded:
            continue
        meta = CONFIG["tenants"].get(name, {"slug": slugify(name), "title": name})
        per_season = {}
        for season in ("summer", "winter"):
            per_season[season] = {"tenant": meta["slug"], "title": meta["title"], "season": season,
                                  "seasonLabel": "Sommer" if season == "summer" else "Winter",
                                  "categories": build_tenant(t, season, type_names)}
            if write_if_changed(API / meta["slug"] / f"{season}.json", per_season[season], now_iso):
                changed.append(f"{meta['slug']}/{season}.json")
        if write_if_changed(API / meta["slug"] / "current.json", per_season[season_now], now_iso):
            changed.append(f"{meta['slug']}/current.json")
        tenants_index.append({"slug": meta["slug"], "title": meta["title"]})

    if write_if_changed(API / "index.json", {"currentSeason": season_now, "tenants": tenants_index}, now_iso):
        changed.append("index.json")

    print(f"Saison laut Datum: {season_now}. Geändert: {', '.join(changed) if changed else 'nichts'}")


if __name__ == "__main__":
    main()
