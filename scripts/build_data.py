#!/usr/bin/env python3
"""Prépare les données de la carte à partir de web/catalog.json.

Télécharge chaque source (avec cache), la filtre et l'allège, puis écrit :
  web/data/countries.geojson   contours des pays + code ISO3
  web/data/<id>.geojson        une couche par fichier
  web/data/layers.json         liste des couches prêtes (la page n'affiche que celles-ci)
  web/data/stats.json          indicateurs par pays (PIB, dette, ogives…)
  web/vendor/                  la bibliothèque MapLibre (version figée dans le catalogue)

Exemples :
  python3 scripts/build_data.py                         # tout
  python3 scripts/build_data.py --only ports            # une seule couche
  python3 scripts/build_data.py --only stats --refresh  # retélécharge les indicateurs
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from geomap import transform as tf  # noqa: E402
from geomap.fetch import fetch  # noqa: E402
from geomap.indicators import load_indicator  # noqa: E402
from geomap.sources import ManualFileMissing, read_features  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
WEB = REPO / "web"
DATA = WEB / "data"


def write_json(path: Path, data) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
    return len(text.encode())


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def build_countries(spec: dict, get_path) -> int:
    raw = json.loads(get_path(spec["url"]).read_text(encoding="utf-8"))
    features = tf.prepare_countries(raw["features"], spec["id_props"], spec["name_props"])
    features = tf.transform_features(features, precision=spec.get("precision"))
    return write_json(DATA / "countries.geojson", tf.feature_collection(features))


def build_stats(indicators: list[dict], get_json, previous: dict) -> tuple[dict, list[str]]:
    """Un indicateur en échec garde sa version précédente au lieu de disparaître."""
    out, errors = {}, []
    for spec in indicators:
        try:
            values = load_indicator(spec, get_json=get_json, repo_root=REPO)
            if not values:
                raise ValueError("aucune valeur reçue")
            out[spec["id"]] = values
            print(f"  ok    indicateur {spec['id']:<22} {len(values)} pays")
        except Exception as exc:  # noqa: BLE001 — on veut continuer avec les autres
            errors.append(f"indicateur {spec['id']} : {exc}")
            kept = spec["id"] in previous
            if kept:
                out[spec["id"]] = previous[spec["id"]]
            print(f"  ÉCHEC indicateur {spec['id']:<22} {'(ancienne version conservée) ' if kept else ''}{exc}")
    return out, errors


def vendor_maplibre(version: str, get_path) -> None:
    base = f"https://unpkg.com/maplibre-gl@{version}/dist/"
    for name in ("maplibre-gl.js", "maplibre-gl.css"):
        target = WEB / "vendor" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(get_path(base + name).read_bytes())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalog", type=Path, default=WEB / "catalog.json")
    parser.add_argument("--cache-dir", type=Path, default=REPO / ".cache")
    parser.add_argument("--manual-dir", type=Path, default=REPO / "manual-data",
                        help="dossier des fichiers téléchargés à la main (défaut : manual-data/)")
    parser.add_argument("--only", nargs="+", metavar="ID", help="ne construire que ces couches (ou 'countries', 'stats', 'vendor')")
    parser.add_argument("--refresh", action="store_true", help="ignorer le cache et retélécharger")
    parser.add_argument("--offline", action="store_true", help="n'utiliser que le cache, aucun accès réseau")
    args = parser.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    wanted = set(args.only) if args.only else None

    def selected(item_id: str) -> bool:
        return wanted is None or item_id in wanted

    def get_path(url: str) -> Path:
        return fetch(url, args.cache_dir, refresh=args.refresh, offline=args.offline)

    def get_json(url: str):
        return json.loads(get_path(url).read_text(encoding="utf-8"))

    errors: list[str] = []
    waiting: list[str] = []

    def step(label: str, action) -> bool:
        try:
            size = action()
            suffix = f"{size / 1e6:6.2f} Mo" if isinstance(size, int) else ""
            print(f"  ok    {label:<28} {suffix}")
            return True
        except ManualFileMissing as exc:
            waiting.append(f"{label} : {exc}")
            print(f"  ATTENTE {label:<26} fichier manuel absent (voir la fin)")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{label} : {exc}")
            print(f"  ÉCHEC {label:<28} {exc}")
        return False

    print("Préparation des données…")
    if selected("vendor"):
        step("maplibre " + catalog["map"]["maplibre_version"], lambda: vendor_maplibre(catalog["map"]["maplibre_version"], get_path))
    if selected("countries"):
        step("countries", lambda: build_countries(catalog["countries"], get_path))

    manifest_path = DATA / "layers.json"
    manifest = read_json(manifest_path, {})
    known = {ov["id"] for ov in catalog["overlays"]}
    manifest = {k: v for k, v in manifest.items() if k in known}  # oublie les couches retirées du catalogue
    for layer in catalog["overlays"]:
        if "live" in layer or not selected(layer["id"]):
            continue  # les couches en direct sont lues par le navigateur, rien à préparer

        def build(layer=layer) -> int:
            features = read_features(layer["source"], get_path, args.manual_dir, REPO)
            size = write_json(DATA / f"{layer['id']}.geojson", tf.feature_collection(features))
            manifest[layer["id"]] = {"features": len(features)}
            return size

        step(layer["id"], build)
    write_json(manifest_path, manifest)

    if selected("stats"):
        stats_path = DATA / "stats.json"
        previous = read_json(stats_path, {"indicators": {}})["indicators"]
        indicators, stat_errors = build_stats(catalog["indicators"], get_json, previous)
        errors += stat_errors
        write_json(stats_path, {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "indicators": indicators,
        })

    if waiting:
        print(f"\n{len(waiting)} couche(s) en attente d'un fichier téléchargé à la main :")
        for w in waiting:
            print("  -", w)
    if errors:
        print(f"\n{len(errors)} erreur(s) :")
        for e in errors:
            print("  -", e)
        return 1
    print("\nTerminé." + (" (couches manuelles en attente, voir ci-dessus)" if waiting else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
