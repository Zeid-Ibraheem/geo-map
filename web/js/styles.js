// Traduction du catalogue (web/catalog.json) en style et couches MapLibre.
// Fonctions pures : aucune dépendance à la carte ni à la page.

import { iconId } from "./icons.js";

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

const RANK = { fill: 0, line: 1, circle: 2, icon: 3 };

// ---------- expressions ----------

function matchOn(color, valueOf) {
  const expr = ["match", ["to-string", ["get", color.by]]];
  for (const [value, c] of Object.entries(color.values)) expr.push(value, valueOf(c));
  expr.push(valueOf(color.default));
  return expr;
}

export function colorExpression(color) {
  return typeof color === "string" ? color : matchOn(color, (c) => c);
}

export function iconImageExpression(shape, color) {
  return typeof color === "string" ? iconId(shape, color) : matchOn(color, (c) => iconId(shape, c));
}

/** Toutes les couleurs qu'une couche peut utiliser (pour la légende et les icônes). */
export function colorsOf(color) {
  return typeof color === "string" ? [color] : [...new Set([...Object.values(color.values), color.default])];
}

export function radiusExpression(radius) {
  if (typeof radius === "number") return radius;
  const expr = ["interpolate", ["linear"], ["to-number", ["get", radius.by], 0]];
  for (const [value, r] of radius.stops) expr.push(value, r);
  return expr;
}

/** Taille d'icône : grandit avec le zoom, et éventuellement avec une valeur (ex. puissance). */
export function iconSizeExpression(style) {
  const base = style.size ?? 1;
  let factor = base;
  if (style.size_by) {
    factor = ["interpolate", ["linear"], ["to-number", ["get", style.size_by.by], 0]];
    for (const [value, s] of style.size_by.stops) factor.push(value, s * base);
  }
  const at = (k) => (typeof factor === "number" ? factor * k : ["*", k, factor]);
  return ["interpolate", ["linear"], ["zoom"], 1, at(0.45), 5, at(0.75), 10, at(1)];
}

// ---------- fond de carte ----------

/** Couches qui viennent de nous, indépendantes du fond choisi. */
function ownBaseLayers(catalog) {
  const c = catalog.map.colors;
  const rasters = catalog.bases.filter((b) => b.tiles).map((b) => ({
    id: LAYER.base(b.id),
    type: "raster",
    source: `base-${b.id}`,
    layout: { visibility: "none" },
  }));
  return [
    ...rasters,
    {
      id: LAYER.choropleth,
      type: "fill",
      source: "countries",
      layout: { visibility: "none" },
      paint: { "fill-color": c.no_data, "fill-opacity": catalog.map.choropleth_opacity ?? 0.7 },
    },
    {
      id: LAYER.borders,
      type: "line",
      source: "countries",
      layout: { visibility: "none" },
      paint: { "line-color": c.border, "line-width": 0.8 },
    },
  ];
}

function ownSources(catalog) {
  const sources = {
    countries: { type: "geojson", data: "data/countries.geojson", promoteId: "iso3", attribution: catalog.countries.attribution },
  };
  for (const b of catalog.bases) {
    if (b.tiles) sources[`base-${b.id}`] = { type: "raster", tiles: b.tiles, tileSize: 256, maxzoom: b.maxzoom ?? 8, attribution: b.attribution };
  }
  return sources;
}

const FRENCH_NAME = ["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name"]];

/**
 * Style complet. Avec un fond vectoriel (rues, villes, villages), nos couches passent
 * sous ses étiquettes ; sans (hors ligne), on retombe sur un fond simple fait maison.
 */
export function composeStyle(catalog, vectorStyle) {
  const c = catalog.map.colors;
  const own = ownBaseLayers(catalog);

  if (!vectorStyle) {
    return {
      version: 8,
      glyphs: catalog.map.fallback_glyphs,
      projection: { type: catalog.map.projection },
      sources: ownSources(catalog),
      layers: [
        { id: LAYER.background, type: "background", paint: { "background-color": c.ocean } },
        { id: LAYER.land, type: "fill", source: "countries", paint: { "fill-color": c.land } },
        ...own.map((l) => (l.id === LAYER.borders ? { ...l, layout: { visibility: "visible" } } : l)),
        {
          id: LAYER.labels,
          type: "symbol",
          source: "countries",
          minzoom: 2.5,
          layout: { "text-field": ["get", "name"], "text-font": [catalog.map.fallback_font], "text-size": 12 },
          paint: { "text-color": c.label, "text-halo-color": c.ocean, "text-halo-width": 1.2 },
        },
      ],
    };
  }

  const layers = vectorStyle.layers.map((layer) => {
    const field = layer.layout?.["text-field"];
    if (layer.type !== "symbol" || !field || !JSON.stringify(field).includes("name")) return layer;
    return { ...layer, layout: { ...layer.layout, "text-field": FRENCH_NAME } };
  });
  const firstSymbol = layers.findIndex((l) => l.type === "symbol");
  const at = firstSymbol === -1 ? layers.length : firstSymbol;
  return {
    ...vectorStyle,
    projection: { type: catalog.map.projection },
    sources: { ...vectorStyle.sources, ...ownSources(catalog) },
    layers: [...layers.slice(0, at), ...own, ...layers.slice(at)],
  };
}

// ---------- couches superposables ----------

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
  if (s.type === "icon") {
    return [{
      ...base,
      id: LAYER.overlay(overlay.id),
      type: "symbol",
      layout: {
        visibility,
        "icon-image": iconImageExpression(s.icon, s.color),
        "icon-size": iconSizeExpression(s),
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        ...(s.size_by ? { "symbol-sort-key": ["-", 0, ["to-number", ["get", s.size_by.by], 0]] } : {}),
      },
    }];
  }
  if (s.type === "circle") {
    return [{
      ...base,
      id: LAYER.overlay(overlay.id),
      type: "circle",
      paint: {
        "circle-color": color,
        "circle-radius": radiusExpression(s.radius ?? 3),
        "circle-opacity": s.opacity ?? 0.95,
        "circle-stroke-color": s.stroke ?? "#000000",
        "circle-stroke-width": 1,
      },
    }];
  }
  if (s.type === "line") {
    const paint = { "line-color": color, "line-width": s.width ?? 1.2, "line-opacity": s.opacity ?? 1 };
    if (s.dash) paint["line-dasharray"] = s.dash;
    return [{ ...base, id: LAYER.overlay(overlay.id), type: "line", paint }];
  }
  if (s.type === "fill") {
    return [
      { ...base, id: LAYER.overlay(overlay.id), type: "fill", paint: { "fill-color": color, "fill-opacity": s.opacity ?? 0.4 } },
      { ...base, id: LAYER.outline(overlay.id), type: "line", paint: { "line-color": s.outline ?? color, "line-width": s.outline_width ?? 1.2 } },
    ];
  }
  throw new Error(`type de style inconnu pour ${overlay.id} : ${s.type}`);
}

/** Ordre d'empilement : surfaces en dessous, puis lignes, cercles, icônes au-dessus. */
export function sortOverlays(overlays) {
  return [...overlays].sort((a, b) => RANK[a.style.type] - RANK[b.style.type]);
}

/** Ce qu'affiche la légende pour une couche : une ligne par couleur utilisée. */
export function legendEntries(overlay) {
  const s = overlay.style;
  const entry = (color, label) => ({ type: s.type, icon: s.icon, color, label, dash: !!s.dash });
  if (typeof s.color === "string") return [entry(s.color, overlay.title)];
  const labels = overlay.legend ?? {};
  const rows = Object.entries(s.color.values).map(([value, color]) => entry(color, labels[value] ?? value));
  if (labels.__default) rows.push(entry(s.color.default, labels.__default));
  return rows;
}
