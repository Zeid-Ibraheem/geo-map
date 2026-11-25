// Traduction du catalogue (web/catalog.json) en style et couches MapLibre.
// Fonctions pures : aucune dépendance à la carte ni à la page.

export const LAYER = {
  background: "background",
  land: "countries-land",
  choropleth: "countries-choro",
  borders: "countries-line",
  labels: "countries-label",
  base: (id) => `base-${id}`,
  overlay: (id) => `ov-${id}`,
  outline: (id) => `ov-${id}-outline`,
};

const RANK = { fill: 0, line: 1, circle: 2 };

export function colorExpression(color) {
  if (typeof color === "string") return color;
  const expr = ["match", ["to-string", ["get", color.by]]];
  for (const [value, c] of Object.entries(color.values)) expr.push(value, c);
  expr.push(color.default);
  return expr;
}

export function radiusExpression(radius) {
  if (typeof radius === "number") return radius;
  const expr = ["interpolate", ["linear"], ["to-number", ["get", radius.by], 0]];
  for (const [value, r] of radius.stops) expr.push(value, r);
  return expr;
}

/** Style de départ : fond, contours des pays, fonds raster, étiquettes. */
export function baseStyle(catalog) {
  const { map: cfg, countries, bases } = catalog;
  const c = cfg.colors;
  const sources = {
    countries: { type: "geojson", data: "data/countries.geojson", promoteId: "iso3", attribution: countries.attribution },
  };
  const rasterLayers = [];
  for (const base of bases) {
    if (!base.tiles) continue;
    sources[`base-${base.id}`] = { type: "raster", tiles: base.tiles, tileSize: 256, maxzoom: base.maxzoom ?? 8, attribution: base.attribution };
    rasterLayers.push({
      id: LAYER.base(base.id),
      type: "raster",
      source: `base-${base.id}`,
      layout: { visibility: base.default ? "visible" : "none" },
    });
  }
  const defaultBase = bases.find((b) => b.default) ?? bases[0];
  return {
    version: 8,
    glyphs: cfg.glyphs,
    projection: { type: cfg.projection },
    sources,
    layers: [
      { id: LAYER.background, type: "background", paint: { "background-color": c.ocean } },
      ...rasterLayers,
      {
        id: LAYER.land,
        type: "fill",
        source: "countries",
        layout: { visibility: defaultBase?.tiles ? "none" : "visible" },
        paint: { "fill-color": c.land },
      },
      {
        id: LAYER.choropleth,
        type: "fill",
        source: "countries",
        layout: { visibility: "none" },
        paint: { "fill-color": c.no_data, "fill-opacity": 0.85 },
      },
      { id: LAYER.borders, type: "line", source: "countries", paint: { "line-color": c.border, "line-width": 0.6 } },
      {
        id: LAYER.labels,
        type: "symbol",
        source: "countries",
        minzoom: 2.5,
        layout: { "text-field": ["get", "name"], "text-font": [cfg.font], "text-size": 11 },
        paint: { "text-color": c.label, "text-halo-color": c.ocean, "text-halo-width": 1.2 },
      },
    ],
  };
}

export function overlaySource(overlay) {
  return {
    type: "geojson",
    data: overlay.live ? overlay.live.url : `data/${overlay.id}.geojson`,
    attribution: overlay.attribution,
  };
}

/** Couches MapLibre d'un élément du catalogue (une, ou deux pour une surface avec contour). */
export function overlayLayers(overlay) {
  const s = overlay.style;
  const visibility = overlay.visible ? "visible" : "none";
  const base = { source: overlay.id, layout: { visibility } };
  const color = colorExpression(s.color);
  if (s.type === "circle") {
    return [{
      ...base,
      id: LAYER.overlay(overlay.id),
      type: "circle",
      paint: {
        "circle-color": color,
        "circle-radius": radiusExpression(s.radius ?? 3),
        "circle-opacity": s.opacity ?? 0.9,
        "circle-stroke-color": "#000000",
        "circle-stroke-width": 0.5,
        "circle-pitch-alignment": "map",
      },
    }];
  }
  if (s.type === "line") {
    const paint = { "line-color": color, "line-width": s.width ?? 1, "line-opacity": s.opacity ?? 0.9 };
    if (s.dash) paint["line-dasharray"] = s.dash;
    return [{ ...base, id: LAYER.overlay(overlay.id), type: "line", paint }];
  }
  if (s.type === "fill") {
    return [
      { ...base, id: LAYER.overlay(overlay.id), type: "fill", paint: { "fill-color": color, "fill-opacity": s.opacity ?? 0.3 } },
      { ...base, id: LAYER.outline(overlay.id), type: "line", paint: { "line-color": s.outline ?? color, "line-width": 0.8 } },
    ];
  }
  throw new Error(`type de style inconnu pour ${overlay.id} : ${s.type}`);
}

/** Ordre d'empilement : surfaces en dessous, lignes au milieu, points au-dessus. */
export function sortOverlays(overlays) {
  return [...overlays].sort((a, b) => RANK[a.style.type] - RANK[b.style.type]);
}

/** Couleur représentative pour la pastille du panneau. */
export function swatchColor(style) {
  return typeof style.color === "string" ? style.color : Object.values(style.color.values)[0] ?? style.color.default;
}
