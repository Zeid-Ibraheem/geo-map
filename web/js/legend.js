// Légende (en haut à droite) : ce que signifie chaque couleur et chaque icône visible.

import { escapeHtml, formatValue } from "./format.js";
import { iconDataUrl } from "./icons.js";
import { legendEntries } from "./styles.js";

/** Pastille HTML : icône, trait, surface ou rond selon le type de couche. */
export function swatchHtml({ type, icon, color, dash }) {
  if (type === "icon") return `<img class="swatch-icon" alt="" src="${iconDataUrl(icon, color)}">`;
  const cls = type === "line" ? (dash ? "swatch-line dashed" : "swatch-line") : type === "fill" ? "swatch-fill" : "swatch-circle";
  return `<span class="swatch ${cls}" style="--c:${color}"></span>`;
}

function indicatorHtml(indicator, scale, noDataColor) {
  const fmt = (v) => formatValue(v, indicator.format, indicator.unit);
  const years = scale.years ? (scale.years[0] === scale.years[1] ? `${scale.years[0]}` : `${scale.years[0]}–${scale.years[1]}`) : "?";
  return `
    <section>
      <div class="legend-title">${escapeHtml(indicator.title)}</div>
      ${scale.ranges.map((r) => `<div class="legend-row">${swatchHtml({ type: "fill", color: r.color })}${escapeHtml(fmt(r.from))} → ${escapeHtml(fmt(r.to))}</div>`).join("")}
      <div class="legend-row">${swatchHtml({ type: "fill", color: noDataColor })}Pas de donnée</div>
      <div class="legend-note">${scale.count} pays · ${escapeHtml(years)} · ${escapeHtml(indicator.attribution)}</div>
    </section>`;
}

function overlayHtml(overlay) {
  const entries = legendEntries(overlay);
  const single = entries.length === 1;
  return `
    <section>
      ${single ? "" : `<div class="legend-title">${escapeHtml(overlay.title)}</div>`}
      ${entries.map((e) => `<div class="legend-row">${swatchHtml(e)}${escapeHtml(e.label)}</div>`).join("")}
    </section>`;
}

/**
 * @param state {indicator, scale, noDataColor, overlays} — overlays = couches visibles, dans l'ordre du catalogue
 */
export function renderLegend(root, state) {
  const parts = [];
  if (state.indicator && state.scale) parts.push(indicatorHtml(state.indicator, state.scale, state.noDataColor));
  for (const ov of state.overlays) parts.push(overlayHtml(ov));
  root.hidden = parts.length === 0;
  root.innerHTML = parts.length ? `<div class="legend-head">Légende</div>${parts.join("")}` : "";
}
