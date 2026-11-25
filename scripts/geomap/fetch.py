"""Téléchargement avec cache local.

Chaque URL est téléchargée une seule fois dans le dossier de cache ;
les lancements suivants réutilisent le fichier sauf si on force le rafraîchissement.
"""

from __future__ import annotations

import hashlib
import os
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

USER_AGENT = "geo-map-builder/1.0 (+https://github.com/Zeid-Ibraheem/geo-map)"
TIMEOUT_S = 120


class OfflineMiss(RuntimeError):
    """Le fichier n'est pas en cache et le mode hors ligne est actif."""


def cache_path(cache_dir: Path, url: str) -> Path:
    """Nom de fichier stable et lisible : <hash court>-<nom d'origine>."""
    digest = hashlib.sha1(url.encode()).hexdigest()[:12]
    name = Path(urlparse(url).path).name or "index"
    return cache_dir / f"{digest}-{name}"


def fetch(url: str, cache_dir: Path, *, refresh: bool = False, offline: bool = False) -> Path:
    """Renvoie le chemin local du contenu de `url`, en le téléchargeant si besoin."""
    target = cache_path(cache_dir, url)
    if target.exists() and not refresh:
        return target
    if offline:
        raise OfflineMiss(f"absent du cache (mode hors ligne) : {url}")

    cache_dir.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    tmp = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response, open(tmp, "wb") as out:
        while chunk := response.read(1 << 16):
            out.write(chunk)
    os.replace(tmp, target)  # écriture atomique : jamais de fichier à moitié écrit en cache
    return target
