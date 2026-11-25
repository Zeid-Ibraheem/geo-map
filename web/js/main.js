// Point d'entrée : charge le catalogue, crée la carte et relie panneau, légende et carte.

import { buildScale, fillColorExpression } from "./choropleth.js";
import { escapeHtml, formatValue } from "./format.js";
import { iconImageData, parseIconId } from "./icons.js";
import { renderLegend } from "./legend.js";
import { buildPanel } from "./panel.js";
import { LAYER, composeStyle, overlayLayers, overlaySource, sortOverlays } from "./styles.js";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return response.json();
}

function showError(message) {
  const box = document.getElementById("error");
  box.textContent = message;
  box.hidden = false;
}

function popupHtml(title, rows) {
  const lines = rows
    .filter(([, value]) => value !== "—" && value !== "")
    .map(([label, value]) => `<div><span class="pl">${escapeHtml(label)}</span> ${escapeHtml(value)}</div>`)
    .join("");
  return `<div class="pt">${escapeHtml(title ?? "")}</div>${lines}`;
}

/** Fenêtre d'info d'un objet : champs décrits dans le catalogue, ou toutes ses propriétés (« auto »). */
function overlayPopup(ov, p) {
  if (ov.popup === "auto") {
    const entries = Object.entries(p).filter(([, v]) => v !== null && v !== "" && typeof v !== "object").slice(0, 10);
    const titleKey = Object.keys(p).find((k) => /name|nom/i.test(k)) ?? entries[0]?.[0];
    return popupHtml(p[titleKey], entries.filter(([k]) => k !== titleKey).map(([k, v]) => [k, String(v)]));
  }
  // traduction : table propre au champ, sinon légende de la propriété qui colore la couche
  const translated = (f) => f.values?.[p[f.prop]] ?? (ov.legend && ov.style.color?.by === f.prop ? ov.legend[p[f.prop]] : undefined);
  return popupHtml(p[ov.popup.title], ov.popup.fields.map((f) => [f.label, translated(f) ?? formatValue(p[f.prop], f.format ?? "text", f.unit)]));
}

async function start() {
  if (typeof maplibregl === "undefined") {
    showError("MapLibre est absent : lance d'abord « python3 scripts/build_data.py ».");
    return;
  }
  const catalog = await fetchJson("catalog.json");
  const stats = await fetchJson("data/stats.json").then((s) => s.indicators).catch(() => ({}));
  const built = await fetchJson("data/layers.json").catch(() => ({}));
  const vectorStyle = await fetchJson(catalog.map.vector_style).catch((err) => {
    console.warn("Fond détaillé indisponible, fond simple utilisé :", err.message);
    return null;
  });

  const map = new maplibregl.Map({
    container: "map",
    style: composeStyle(catalog, vectorStyle),
    center: catalog.map.center,
    zoom: catalog.map.zoom,
    maxZoom: catalog.map.max_zoom,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.GlobeControl(), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  map.on("style.load", () => map.setProjection({ type: catalog.map.projection }));
  map.on("error", (e) => console.warn("Carte :", e.error?.message ?? e));
  // Les icônes sont dessinées seulement quand la carte en a besoin.
  map.on("styleimagemissing", (e) => {
    const icon = parseIconId(e.id);
    if (icon && !map.hasImage(e.id)) map.addImage(e.id, iconImageData(icon.shape, icon.color), { pixelRatio: 2 });
  });

  await new Promise((resolve) => map.once("load", resolve));

  // --- couches superposables ---
  const available = (ov) => ov.live || built[ov.id];
  const overlays = sortOverlays(catalog.overlays.filter(available));
  const layerIdsOf = new Map();
  for (const ov of overlays) {
    map.addSource(ov.id, overlaySource(ov));
    const layers = overlayLayers(ov);
    for (const layer of layers) map.addLayer(layer);
    layerIdsOf.set(ov.id, layers.map((l) => l.id));
  }
  const visible = new Set(overlays.filter((ov) => ov.visible).map((ov) => ov.id));

  // Les couches en direct ne sont rafraîchies que lorsqu'elles sont affichées.
  const timers = new Map();
  function setLive(ov, on) {
    clearInterval(timers.get(ov.id));
    timers.delete(ov.id);
    if (!on) return;
    const reload = () => map.getSource(ov.id).setData(`${ov.live.url}${ov.live.url.includes("?") ? "&" : "?"}t=${Date.now()}`);
    reload();
    timers.set(ov.id, setInterval(reload, ov.live.refresh_s * 1000));
  }
  for (const ov of overlays) if (ov.live && ov.visible) setLive(ov, true);

  // --- légende ---
  const legend = document.getElementById("legend");
  const noData = catalog.map.colors.no_data;
  let activeIndicator = null;
  let activeScale = null;
  const refreshLegend = () => renderLegend(legend, {
    indicator: activeIndicator,
    scale: activeScale,
    noDataColor: noData,
    overlays: catalog.overlays.filter((ov) => visible.has(ov.id)),
  });

  // --- pays colorés ---
  let activeClasses = {};
  function applyIndicator(id) {
    for (const iso of Object.keys(activeClasses)) map.removeFeatureState({ source: "countries", id: iso });
    activeClasses = {};
    activeIndicator = catalog.indicators.find((i) => i.id === id) ?? null;
    activeScale = activeIndicator ? buildScale(stats[id], catalog.map.palette) : null;
    const show = activeIndicator ? "visible" : "none";
    if (activeScale) {
      activeClasses = activeScale.classes;
      for (const [iso, cls] of Object.entries(activeClasses)) map.setFeatureState({ source: "countries", id: iso }, { cls });
      map.setPaintProperty(LAYER.choropleth, "fill-color", fillColorExpression(activeScale.colors, noData));
    }
    map.setLayoutProperty(LAYER.choropleth, "visibility", show);
    if (vectorStyle) map.setLayoutProperty(LAYER.borders, "visibility", show);
    refreshLegend();
  }

  // --- fonds ---
  function applyBase(id) {
    for (const b of catalog.bases) {
      if (b.tiles) map.setLayoutProperty(LAYER.base(b.id), "visibility", b.id === id ? "visible" : "none");
    }
  }
  const defaultBase = catalog.bases.find((b) => b.default);
  if (defaultBase?.tiles) applyBase(defaultBase.id);

  buildPanel(document.getElementById("panel"), { ...catalog, overlays: catalog.overlays.filter(available) }, stats, {
    onBase: applyBase,
    onIndicator: applyIndicator,
    onOverlay(id, on) {
      for (const layerId of layerIdsOf.get(id)) map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
      if (on) visible.add(id);
      else visible.delete(id);
      const ov = catalog.overlays.find((o) => o.id === id);
      if (ov.live) setLive(ov, on);
      refreshLegend();
    },
  });
  refreshLegend();

  const missing = catalog.overlays.filter((ov) => !available(ov));
  if (missing.length) console.info("Couches non préparées (voir README) :", missing.map((o) => o.id).join(", "));

  // --- fenêtres d'information au clic ---
  const overlayByLayer = new Map();
  for (const ov of overlays) if (ov.popup) overlayByLayer.set(LAYER.overlay(ov.id), ov);
  const isShown = (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none";

  map.on("click", (e) => {
    const layers = [...overlayByLayer.keys(), LAYER.choropleth].filter(isShown);
    const [feature] = map.queryRenderedFeatures(e.point, { layers });
    if (!feature) return;
    const ov = overlayByLayer.get(feature.layer.id);
    const p = feature.properties;
    let html;
    if (ov) {
      html = overlayPopup(ov, p);
    } else {
      const d = stats[activeIndicator.id]?.[p.iso3];
      html = popupHtml(p.name, [
        [activeIndicator.title, d ? formatValue(d.v, activeIndicator.format, activeIndicator.unit) : "pas de donnée"],
        ["Année", d?.y ? String(d.y) : "—"],
      ]);
    }
    new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  map.on("mousemove", (e) => {
    const layers = [...overlayByLayer.keys()].filter(isShown);
    map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(e.point, { layers }).length ? "pointer" : "";
  });
}

start().catch((err) => {
  console.error(err);
  showError(`Erreur au démarrage : ${err.message}`);
});
