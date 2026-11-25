# geo-map — carte géopolitique en globe ou à plat

Site web statique : un globe (ou une carte plate, bouton en bas à droite), un panneau en haut à gauche
pour choisir et superposer les couches, une légende en haut à droite.

- **Fonds de carte** : plan détaillé jusqu'aux villages (OpenFreeMap, données OpenStreetMap),
  satellite Sentinel-2 2024, relief et fonds marins (NASA), lumières nocturnes (NASA).
- **Pays colorés par…** 24 indicateurs : économie (PIB, dette, inflation…), armée (dépenses,
  effectifs, armes, têtes nucléaires SIPRI 2026), énergie (rentes pétrolière et gazière…), société.
- **35 couches** avec icônes : capitales, territoires disputés, régions, zones urbaines, fuseaux,
  points de passage maritimes, frontières maritimes, ZEE, ports, aéroports civils, bases aériennes
  militaires, bases spatiales, centrales (nucléaire, charbon, gaz, fioul, hydro, renouvelables),
  oléoducs, gazoducs, terminaux GNL, gisements, plaques tectoniques, volcans, fleuves,
  frontières de 1815 à 1994, séismes en direct.

## Démarrer

```bash
python3 scripts/build_data.py          # télécharge et prépare les données (~15 Mo), une fois
python3 -m http.server 8080 --directory web
# puis ouvrir http://localhost:8080
```

Python 3.11 ou plus, rien à installer : le script n'utilise que la bibliothèque standard.

## Données à télécharger à la main

Les oléoducs, gazoducs, terminaux GNL et gisements viennent de Global Energy Monitor (licence CC BY 4.0),
qui impose un formulaire gratuit. Remplir le formulaire « Download data » de chaque base sur
globalenergymonitor.org, puis déposer les fichiers reçus (.zip ou .geojson) dans `manual-data/` :

| Base GEM | Nom du fichier attendu | Couches |
|---|---|---|
| Global Oil Infrastructure Tracker | contient `GOIT` | oléoducs |
| Global Gas Infrastructure Tracker | contient `GGIT` | gazoducs, terminaux GNL |
| Global Oil and Gas Extraction Tracker | contient `GOGET` | gisements |

Puis `python3 scripts/build_data.py --only oil_pipelines gas_pipelines lng_terminals oil_gas_fields`.
Tant que les fichiers manquent, ces couches n'apparaissent pas (le script les signale « en attente »).

## Organisation

| Fichier | Rôle |
|---|---|
| `web/catalog.json` | **Le seul endroit où l'on décrit les couches** : source, filtre, couleur, fenêtre d'info. Le script et la page le lisent tous les deux. |
| `static-data/` | Données saisies à la main avec leur source (ogives nucléaires SIPRI 2026). |
| `scripts/build_data.py` | Télécharge (avec cache dans `.cache/`), filtre, allège et écrit `web/data/`. |
| `scripts/geomap/` | `fetch` (réseau + cache), `sources` (lecture GeoJSON / CSV / fichiers manuels), `transform` (filtres, géométrie), `indicators` (Banque mondiale, FMI, fichiers). |
| `web/js/` | `styles` (catalogue → couches MapLibre), `icons` (pictogrammes dessinés), `choropleth` (classes de couleurs), `panel`, `legend`, `main` (assemblage). |
| `deploy/` | Service systemd pour le serveur Debian + mise à jour hebdomadaire des indicateurs. |

### Ajouter une couche

Ajouter un objet dans `overlays` de `web/catalog.json`, puis :

```bash
python3 scripts/build_data.py --only MON_ID
```

Options de `source` : `url`, `path` (fichier du dépôt) ou `manual` ; `format` (`geojson`, `json-points`, `csv-points`
avec `lat`/`lon`) ; `filters` (`{"prop", "in": [...]}` ou `{"prop", "regex"}`, `negate` pour inverser) ;
`props` (propriétés gardées) ; `numeric` ; `precision` (décimales) ; `simplify` (en degrés).
Styles : `icon` (formes : plane, jet, ship, star, bolt, atom, triangle, drop, flame, diamond, rocket), `circle`, `line`, `fill`.
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

OpenFreeMap / OpenStreetMap (ODbL) · Sentinel-2 cloudless 2024, EOX (CC BY-NC-SA 4.0) ·
Natural Earth (domaine public) · OurAirports (domaine public) · WRI Global Power Plant Database (CC BY 4.0) ·
Marine Regions (CC BY 4.0) · Smithsonian GVP · Global Energy Monitor (CC BY 4.0) · PB2002, Bird 2003, via fraxen/tectonicplates (ODC-BY) ·
GeoNuclearData (ODbL) · historical-basemaps, A. Ourednik (GPL-3.0) · NASA GIBS ·
USGS · Banque mondiale (CC BY 4.0) · FMI · SIPRI Yearbook 2026.
Les attributions s'affichent en bas à droite de la carte.
