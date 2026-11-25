// Panneau de couches (en haut à gauche) et légende (en bas à gauche).
// Ne connaît pas MapLibre : il appelle seulement les fonctions qu'on lui donne.

import { escapeHtml, formatValue } from "./format.js";
import { swatchColor } from "./styles.js";

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const child of children.flat()) if (child != null) node.append(child);
  return node;
}

function radio(name, value, label, checked, onChange, disabled = false) {
  return el("label", { class: "row" + (disabled ? " disabled" : "") },
    el("input", { type: "radio", name, value, checked, disabled, onchange: onChange }),
    el("span", {}, label));
}

function section(title, ...content) {
  return el("details", { class: "section", open: true }, el("summary", {}, title), ...content);
}

/**
 * @param root     élément qui reçoit le panneau
 * @param catalog  catalogue des couches
 * @param stats    indicateurs déjà chargés ({id: {ISO3: {v, y}}})
 * @param actions  {onBase(id), onIndicator(id|null), onOverlay(id, visible)}
 */
export function buildPanel(root, catalog, stats, actions) {
  const body = el("div", { class: "panel-body" });
  const toggle = el("button", { class: "panel-toggle", type: "button", "aria-expanded": "true", title: "Afficher / masquer" }, "Couches");
  toggle.addEventListener("click", () => {
    const hidden = body.toggleAttribute("hidden");
    toggle.setAttribute("aria-expanded", String(!hidden));
  });

  body.append(section("Fond de carte",
    catalog.bases.map((b) => radio("base", b.id, b.title, !!b.default, () => actions.onBase(b.id)))));

  body.append(section("Pays colorés par…",
    radio("indicator", "", "Aucun", true, () => actions.onIndicator(null)),
    catalog.indicators.map((ind) => {
      const missing = !stats[ind.id];
      return radio("indicator", ind.id, ind.title + (missing ? " (pas de données)" : ""), false,
        () => actions.onIndicator(ind.id), missing);
    })));

  const groups = new Map();
  for (const ov of catalog.overlays) {
    if (!groups.has(ov.group)) groups.set(ov.group, []);
    groups.get(ov.group).push(ov);
  }
  for (const [group, items] of groups) {
    body.append(section(group, items.map((ov) => {
      const row = el("label", { class: "row" },
        el("input", { type: "checkbox", checked: !!ov.visible, onchange: (e) => actions.onOverlay(ov.id, e.target.checked) }),
        el("span", { class: `swatch swatch-${ov.style.type}`, style: `--c:${swatchColor(ov.style)}` }),
        el("span", {}, ov.title));
      if (!ov.legend || typeof ov.style.color === "string") return row;
      const sub = el("div", { class: "sublegend" },
        Object.entries(ov.legend).map(([value, label]) =>
          el("span", {}, el("span", { class: "swatch swatch-circle", style: `--c:${ov.style.color.values[value] ?? ov.style.color.default}` }), label)));
      return el("div", {}, row, sub);
    })));
  }

  root.replaceChildren(toggle, body);
}

/** Légende de l'indicateur actif. `scale` vient de buildScale(). */
export function renderLegend(root, indicator, scale, noDataColor) {
  if (!indicator || !scale) {
    root.hidden = true;
    return;
  }
  const fmt = (v) => formatValue(v, indicator.format, indicator.unit);
  const years = scale.years ? (scale.years[0] === scale.years[1] ? `${scale.years[0]}` : `${scale.years[0]}–${scale.years[1]}`) : "?";
  root.innerHTML = `
    <div class="legend-title">${escapeHtml(indicator.title)}</div>
    ${scale.ranges.map((r) => `
      <div class="legend-row"><span class="swatch swatch-fill" style="--c:${r.color}"></span>${escapeHtml(fmt(r.from))} → ${escapeHtml(fmt(r.to))}</div>`).join("")}
    <div class="legend-row"><span class="swatch swatch-fill" style="--c:${noDataColor}"></span>Pas de donnée</div>
    <div class="legend-note">${scale.count} pays · données ${escapeHtml(years)} · ${escapeHtml(indicator.attribution)}</div>`;
  root.hidden = false;
}
