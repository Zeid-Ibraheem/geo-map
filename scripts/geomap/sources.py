"""Lecture d'une source décrite dans le catalogue → liste d'objets GeoJSON.

Formats : "geojson" (par défaut), "json-points" (liste d'enregistrements avec lat/lon),
"csv-points" (CSV avec colonnes lat/lon).
Une source "manual" désigne un fichier téléchargé à la main (formulaire obligatoire),
déposé dans le dossier manual-data/ ; il peut être dans une archive .zip.
"""

from __future__ import annotations

import csv
import fnmatch
import io
import json
import zipfile
from pathlib import Path
from typing import Callable

from . import transform as tf


class ManualFileMissing(RuntimeError):
    """Le fichier à télécharger à la main n'est pas encore là."""


def _find_manual(manual_dir: Path, spec: dict) -> tuple[str, bytes]:
    """Renvoie (nom, contenu) du fichier correspondant ; cherche aussi dans les .zip."""
    file_glob, member_glob = spec["file"], spec.get("member", "*.geojson")
    candidates = sorted(manual_dir.glob(file_glob)) if manual_dir.exists() else []
    for path in reversed(candidates):  # le plus récent par ordre de nom (dates dans les noms)
        if path.suffix.lower() != ".zip":
            return path.name, path.read_bytes()
        with zipfile.ZipFile(path) as archive:
            members = [m for m in archive.namelist() if fnmatch.fnmatch(Path(m).name.lower(), member_glob.lower())]
            if members:
                biggest = max(members, key=lambda m: archive.getinfo(m).file_size)
                return f"{path.name}/{biggest}", archive.read(biggest)
    raise ManualFileMissing(f"à télécharger à la main : {spec['how']} → déposer dans {manual_dir}/ ({file_glob})")


def _parse(content: bytes, src: dict) -> list[dict]:
    fmt = src.get("format", "geojson")
    text = content.decode("utf-8-sig")
    if fmt == "geojson":
        return json.loads(text)["features"]
    if fmt == "json-points":
        return tf.points_from_records(json.loads(text), src["lat"], src["lon"], src.get("numeric"))
    if fmt == "csv-points":
        return tf.points_from_records(csv.DictReader(io.StringIO(text)), src["lat"], src["lon"], src.get("numeric"))
    raise ValueError(f"format inconnu : {fmt}")


def read_features(src: dict, get_path: Callable[[str], Path], manual_dir: Path, repo_root: Path) -> list[dict]:
    if "manual" in src:
        _, content = _find_manual(manual_dir, src["manual"])
    elif "path" in src:  # fichier du dépôt (données saisies à la main, avec leur source)
        content = (repo_root / src["path"]).read_bytes()
    else:
        content = get_path(src["url"]).read_bytes()
    features = _parse(content, src)
    features = tf.apply_filters(features, src.get("filters"))
    features = tf.select_props(features, src.get("props"))
    return tf.transform_features(features, precision=src.get("precision"), simplify=src.get("simplify"))
