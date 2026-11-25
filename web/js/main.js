// Point d'entrée : charge le catalogue, crée la carte et relie le panneau à la carte.

import { buildScale, fillColorExpression } from "./choropleth.js";
import { escapeHtml, formatValue } from "./format.js";
import { buildPanel, renderLegend } from "./panel.js";
import { LAYER, baseStyle, overlayLayers, overlaySource, sortOverlays } from "./styles.js";

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
    .filter(([, value]) => value !== "—")
    .map(([label, value]) => `<div><span class="pl">${escapeHtml(label)}</span> ${escapeHtml(value)}</div>`)
    .join("");
  return `<div class="pt">${escapeHtml(title ?? "")}</div>${lines}`;
}

async function start() {
  if (typeof maplibregl === "undefined") {
    showError("MapLibre est absent : lance d'abord « python3 scripts/build_data.py ».");
    return;
  }
  const catalog = await fetchJson("catalog.json");
  const stats = await fetchJson("data/stats.json").then((s) => s.indicators).catch(() => ({}));

  const map = new maplibregl.Map({
    container: "map",
    style: baseStyle(catalog),
    center: catalog.map.center,
    zoom: catalog.map.zoom,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.GlobeControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  map.on("style.load", () => map.setProjection({ type: catalog.map.projection }));
  map.on("error", (e) => console.warn("Carte :", e.error?.message ?? e));

  await new Promise((resolve) => map.once("load", resolve));

  // --- couches superposables ---
  const overlays = sortOverlays(catalog.overlays);
  const layerIdsOf = new Map();
  for (const ov of overlays) {
    map.addSource(ov.id, overlaySource(ov));
    const layers = overlayLayers(ov);
    for (const layer of layers) map.addLayer(layer, LAYER.labels);
    layerIdsOf.set(ov.id, layers.map((l) => l.id));
  }

  // Les couches en direct ne sont rafraîchies que lorsqu'elles sont affichées.
  const timers = new Map();
  function setLive(ov, visible) {
    clearInterval(timers.get(ov.id));
    timers.delete(ov.id);
    if (!visible) return;
    const reload = () => map.getSource(ov.id).setData(`${ov.live.url}${ov.live.url.includes("?") ? "&" : "?"}t=${Date.now()}`);
    reload();
    timers.set(ov.id, setInterval(reload, ov.live.refresh_s * 1000));
  }
  for (const ov of overlays) if (ov.live && ov.visible) setLive(ov, true);

  // --- pays colorés ---
  const palette = catalog.map.palette;
  const noData = catalog.map.colors.no_data;
  let activeIndicator = null;
  let activeClasses = {};
  const legend = document.getElementById("legend");

  function applyIndicator(id) {
    for (const iso of Object.keys(activeClasses)) map.removeFeatureState({ source: "countries", id: iso });
    activeClasses = {};
    activeIndicator = catalog.indicators.find((i) => i.id === id) ?? null;
    if (!activeIndicator) {
      map.setLayoutProperty(LAYER.choropleth, "visibility", "none");
      renderLegend(legend, null);
      return;
    }
    const scale = buildScale(stats[id], palette);
    activeClasses = scale.classes;
    for (const [iso, cls] of Object.entries(scale.classes)) map.setFeatureState({ source: "countries", id: iso }, { cls });
    map.setPaintProperty(LAYER.choropleth, "fill-color", fillColorExpression(scale.colors, noData));
    map.setLayoutProperty(LAYER.choropleth, "visibility", "visible");
    renderLegend(legend, activeIndicator, scale, noData);
  }

  // --- fonds ---
  function applyBase(id) {
    const base = catalog.bases.find((b) => b.id === id);
    for (const b of catalog.bases) {
      if (b.tiles) map.setLayoutProperty(LAYER.base(b.id), "visibility", b.id === id ? "visible" : "none");
    }
    map.setLayoutProperty(LAYER.land, "visibility", base.tiles ? "none" : "visible");
  }

  buildPanel(document.getElementById("panel"), catalog, stats, {
    onBase: applyBase,
    onIndicator: applyIndicator,
    onOverlay(id, visible) {
      for (const layerId of layerIdsOf.get(id)) map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      const ov = catalog.overlays.find((o) => o.id === id);
      if (ov.live) setLive(ov, visible);
    },
  });

  // --- fenêtres d'information au clic ---
  const overlayByLayer = new Map();
  for (const ov of overlays) if (ov.popup) overlayByLayer.set(LAYER.overlay(ov.id), ov);
  const clickable = [...overlayByLayer.keys(), LAYER.choropleth, LAYER.land];

  map.on("click", (e) => {
    const layers = clickable.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
    const [feature] = map.queryRenderedFeatures(e.point, { layers });
    if (!feature) return;
    const ov = overlayByLayer.get(feature.layer.id);
    const p = feature.properties;
    let html;
    if (ov) {
      // la propriété qui colore la couche est traduite avec sa légende (ex. Operational → En service)
      const label = (f) => (ov.legend && ov.style.color?.by === f.prop ? ov.legend[p[f.prop]] : undefined);
      html = popupHtml(p[ov.popup.title], ov.popup.fields.map((f) => [f.label, label(f) ?? formatValue(p[f.prop], f.format ?? "text")]));
    } else {
      const rows = [];
      if (activeIndicator) {
        const d = stats[activeIndicator.id]?.[p.iso3];
        rows.push([activeIndicator.title, d ? formatValue(d.v, activeIndicator.format, activeIndicator.unit) : "pas de donnée"]);
        if (d?.y) rows.push(["Année", String(d.y)]);
      }
      html = popupHtml(p.name, rows);
    }
    new maplibregl.Popup({ maxWidth: "280px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  map.on("mousemove", (e) => {
    const layers = [...overlayByLayer.keys()].filter((id) => map.getLayoutProperty(id, "visibility") !== "none");
    map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers }).length ? "pointer" : "";
  });
}

start().catch((err) => {
  console.error(err);
  showError(`Erreur au démarrage : ${err.message}`);
});
