"""Lecture des indicateurs par pays (Banque mondiale, FMI, fichiers locaux).

Chaque fournisseur renvoie le même format : {"ISO3": {"v": valeur, "y": année}}.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Callable

Values = dict[str, dict]


def worldbank_url(code: str) -> str:
    # mrnev=1 : dernière valeur non vide pour chaque pays
    return f"https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=20000&mrnev=1"


def parse_worldbank(payload) -> Values:
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        message = payload[0].get("message") if isinstance(payload, list) and payload else payload
        raise ValueError(f"réponse Banque mondiale inattendue : {message}")
    out: Values = {}
    for row in payload[1]:
        iso3, value = row.get("countryiso3code"), row.get("value")
        if iso3 and value is not None:
            out[iso3] = {"v": value, "y": int(row["date"])}
    return out


def imf_url(code: str) -> str:
    return f"https://www.imf.org/external/datamapper/api/v1/{code}"


def parse_imf(payload, code: str, max_year: int) -> Values:
    """Le FMI publie aussi des projections : on garde la dernière année <= max_year."""
    series = payload["values"][code]
    out: Values = {}
    for iso3, by_year in series.items():
        years = [int(y) for y, v in by_year.items() if v is not None and int(y) <= max_year]
        if years:
            y = max(years)
            out[iso3] = {"v": by_year[str(y)], "y": y}
    return out


def parse_file(data: dict, field: str) -> Values:
    year = data.get("year")
    return {
        iso3: {"v": row[field], "y": year}
        for iso3, row in data["values"].items()
        if row.get(field) is not None
    }


def load_indicator(spec: dict, *, get_json: Callable[[str], object], repo_root: Path,
                   today: date | None = None) -> Values:
    """`get_json(url)` est injecté : il gère le cache et le réseau, ce module n'en sait rien."""
    provider = spec["provider"]
    if provider == "worldbank":
        return parse_worldbank(get_json(worldbank_url(spec["code"])))
    if provider == "imf":
        # année passée : l'année en cours est encore une estimation au moment de la publication
        max_year = (today or date.today()).year - 1
        return parse_imf(get_json(imf_url(spec["code"])), spec["code"], max_year)
    if provider == "file":
        data = json.loads((repo_root / spec["path"]).read_text(encoding="utf-8"))
        return parse_file(data, spec["field"])
    raise ValueError(f"fournisseur inconnu : {provider}")
