"""Transformations géographiques pures (sans réseau, sans fichier) : faciles à tester."""

from __future__ import annotations

import math
from typing import Any, Iterable

Feature = dict[str, Any]


# ---------- filtres et propriétés ----------

def keep_matching(features: Iterable[Feature], keep: dict[str, list] | None) -> list[Feature]:
    """Garde les objets dont chaque propriété listée a une des valeurs autorisées."""
    if not keep:
        return list(features)
    return [
        f for f in features
        if all((f.get("properties") or {}).get(k) in allowed for k, allowed in keep.items())
    ]


def select_props(features: Iterable[Feature], props: list[str] | None) -> list[Feature]:
    """Ne garde que les propriétés utiles (réduit fortement la taille des fichiers)."""
    if props is None:
        return list(features)
    out = []
    for f in features:
        p = f.get("properties") or {}
        out.append({**f, "properties": {k: p.get(k) for k in props}})
    return out


def points_from_records(records: list[dict], lat: str, lon: str) -> list[Feature]:
    """Convertit une liste d'enregistrements (lat/lon en colonnes) en points GeoJSON."""
    features = []
    for r in records:
        y, x = r.get(lat), r.get(lon)
        if y is None or x is None:
            continue
        props = {k: v for k, v in r.items() if k not in (lat, lon)}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(x), float(y)]},
            "properties": props,
        })
    return features


# ---------- géométrie ----------

def _perp_dist(p, a, b) -> float:
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify_line(points: list, tolerance: float) -> list:
    """Douglas-Peucker itératif : retire les points qui ne changent presque pas le tracé."""
    if tolerance <= 0 or len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        best_i, best_d = -1, tolerance
        for i in range(start + 1, end):
            d = _perp_dist(points[i], points[start], points[end])
            if d > best_d:
                best_i, best_d = i, d
        if best_i != -1:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    return [p for p, k in zip(points, keep) if k]


def _simplify_ring(ring: list, tolerance: float) -> list:
    simplified = simplify_line(ring, tolerance)
    return simplified if len(simplified) >= 4 else ring  # un anneau valide a au moins 4 points


def _round_coords(coords, precision: int):
    if not coords:
        return coords  # géométrie vide : certaines sources en contiennent
    if isinstance(coords[0], (int, float)):
        return [round(c, precision) for c in coords]
    return [_round_coords(c, precision) for c in coords]


def transform_geometry(geom: dict | None, *, precision: int | None, simplify: float | None) -> dict | None:
    if geom is None:
        return None
    gtype, coords = geom["type"], geom.get("coordinates")
    if simplify:
        if gtype == "LineString":
            coords = simplify_line(coords, simplify)
        elif gtype == "MultiLineString":
            coords = [simplify_line(line, simplify) for line in coords]
        elif gtype == "Polygon":
            coords = [_simplify_ring(r, simplify) for r in coords]
        elif gtype == "MultiPolygon":
            coords = [[_simplify_ring(r, simplify) for r in poly] for poly in coords]
    if precision is not None and coords is not None:
        coords = _round_coords(coords, precision)
    return {"type": gtype, "coordinates": coords}


def transform_features(features: Iterable[Feature], *, precision: int | None = None,
                       simplify: float | None = None) -> list[Feature]:
    if precision is None and not simplify:
        return list(features)
    return [
        {**f, "geometry": transform_geometry(f.get("geometry"), precision=precision, simplify=simplify)}
        for f in features
    ]


# ---------- pays ----------

def first_valid(props: dict, keys: list[str]) -> str | None:
    """Première valeur exploitable (Natural Earth met « -99 » quand le code n'existe pas)."""
    for k in keys:
        v = props.get(k)
        if v not in (None, "", "-99", -99):
            return v
    return None


def prepare_countries(features: Iterable[Feature], id_props: list[str], name_props: list[str]) -> list[Feature]:
    """Ajoute `iso3` (clé de jointure avec les indicateurs) et `name`, retire le reste."""
    out = []
    for f in features:
        p = f.get("properties") or {}
        out.append({
            "type": "Feature",
            "geometry": f.get("geometry"),
            "properties": {"iso3": first_valid(p, id_props), "name": first_valid(p, name_props)},
        })
    return out


def feature_collection(features: list[Feature]) -> dict:
    return {"type": "FeatureCollection", "features": features}
