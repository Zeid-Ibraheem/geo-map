# geo-map — carte géopolitique en globe ou à plat

Site web statique : un globe (ou une carte plate, un bouton pour passer de l'un à l'autre),
un panneau en haut à gauche pour choisir les couches et les superposer.

- **Fond de carte** (un seul) : sombre, relief et fonds marins (NASA), lumières nocturnes (NASA).
- **Pays colorés par…** (un seul indicateur) : PIB, PIB par habitant, densité, dette publique,
  dépenses militaires, effectifs militaires, têtes nucléaires (SIPRI 2026).
- **Couches superposables** (autant qu'on veut) : capitales, territoires disputés, fuseaux horaires,
  plaques tectoniques, fleuves, centrales nucléaires, aéroports (militaires en rouge), ports,
  voies ferrées, frontières en 1914 / 1938 / 1945 / 1960, séismes en direct.

Clic sur un objet ou un pays : fenêtre d'information.

## Démarrer

```bash
python3 scripts/build_data.py          # télécharge et prépare les données (~15 Mo), une fois
python3 -m http.server 8080 --directory web
# puis ouvrir http://localhost:8080
```

Python 3.11 ou plus, rien à installer : le script n'utilise que la bibliothèque standard.

## Organisation

| Fichier | Rôle |
|---|---|
| `web/catalog.json` | **Le seul endroit où l'on décrit les couches** : source, filtre, couleur, fenêtre d'info. Le script et la page le lisent tous les deux. |
| `static-data/` | Données saisies à la main avec leur source (ogives nucléaires SIPRI 2026). |
| `scripts/build_data.py` | Télécharge (avec cache dans `.cache/`), filtre, allège et écrit `web/data/`. |
| `scripts/geomap/` | `fetch` (réseau + cache), `transform` (géométrie, sans réseau), `indicators` (Banque mondiale, FMI, fichiers). |
| `web/js/` | `styles` (catalogue → couches MapLibre), `choropleth` (classes de couleurs), `panel` (panneau, légende), `main` (assemblage). |
| `deploy/` | Service systemd pour le serveur Debian + mise à jour hebdomadaire des indicateurs. |

### Ajouter une couche

Ajouter un objet dans `overlays` de `web/catalog.json`, puis :

```bash
python3 scripts/build_data.py --only MON_ID
```

Options de `source` : `url`, `format` (`geojson` par défaut, ou `json-points` avec `lat`/`lon`),
`keep` (filtre par valeur), `props` (propriétés gardées), `precision` (décimales), `simplify` (en degrés).
Une couche avec `live` au lieu de `source` est lue directement par le navigateur et rafraîchie
toutes les `refresh_s` secondes quand elle est affichée.

### Mettre à jour

- Indicateurs (une fois par an suffit) : `python3 scripts/build_data.py --only stats --refresh`.
  Si une source est en panne, l'ancienne valeur est gardée.
- Données fixes (frontières, gisements…) : les URL sont figées sur une version précise, rien à faire.

## Déploiement sur le serveur Debian

```bash
sudo cp deploy/geo-map.env.example /etc/geo-map.env    # puis adapter le dossier, l'adresse et le port
sudo cp deploy/geo-map@.service deploy/geo-map-stats@.service deploy/geo-map-stats@.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now "geo-map@$USER.service" "geo-map-stats@$USER.timer"
```

Pour y accéder depuis tes appareils, mettre l'adresse Tailscale du serveur dans `GEO_MAP_BIND`.

## Tests

```bash
python3 -m unittest discover tests
node --test tests/*.test.mjs
```

## Sources et licences des données

Natural Earth (domaine public) · PB2002, Bird 2003, via fraxen/tectonicplates (ODC-BY) ·
GeoNuclearData (ODbL) · historical-basemaps, A. Ourednik (GPL-3.0) · NASA GIBS ·
USGS · Banque mondiale (CC BY 4.0) · FMI · SIPRI Yearbook 2026.
Les attributions s'affichent en bas à droite de la carte.
