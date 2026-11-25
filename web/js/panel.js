// Panneau de couches (en haut à gauche).
// Ne connaît pas MapLibre : il appelle seulement les fonctions qu'on lui donne.

import { swatchHtml } from "./legend.js";
import { legendEntries } from "./styles.js";

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
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

function section(title, open, ...content) {
  return el("details", { class: "section", open }, el("summary", {}, title), ...content);
}

function groupBy(items) {
  const groups = new Map();
  for (const item of items) {
    const g = item.group ?? "Autres";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(item);
  }
  return groups;
}

/**
 * @param root     élément qui reçoit le panneau
 * @param catalog  catalogue des couches
 * @param stats    indicateurs déjà chargés ({id: {ISO3: {v, y}}})
 * @param actions  {onBase(id), onIndicator(id|null), onOverlay(id, visible)}
 */
export function buildPanel(root, catalog, stats, actions) {
  const body = el("div", { class: "panel-body" });
  const toggle = el("button", { class: "panel-toggle", type: "button", "aria-expanded": "true" }, "Couches");
  toggle.addEventListener("click", () => {
    const hidden = body.toggleAttribute("hidden");
    toggle.setAttribute("aria-expanded", String(!hidden));
  });

  body.append(section("Fond de carte", true,
    catalog.bases.map((b) => radio("base", b.id, b.title, !!b.default, () => actions.onBase(b.id)))));

  const indicatorRows = [radio("indicator", "", "Aucun", true, () => actions.onIndicator(null))];
  for (const [group, items] of groupBy(catalog.indicators)) {
    indicatorRows.push(el("div", { class: "subhead" }, group));
    for (const ind of items) {
      const missing = !stats[ind.id];
      indicatorRows.push(radio("indicator", ind.id, ind.title + (missing ? " (pas de données)" : ""), false,
        () => actions.onIndicator(ind.id), missing));
    }
  }
  body.append(section("Pays colorés par…", false, indicatorRows));

  for (const [group, items] of groupBy(catalog.overlays)) {
    const open = items.some((ov) => ov.visible);
    body.append(section(group, open, items.map((ov) => {
      const sample = legendEntries(ov)[0];
      return el("label", { class: "row", title: ov.note ?? "" },
        el("input", { type: "checkbox", checked: !!ov.visible, onchange: (e) => actions.onOverlay(ov.id, e.target.checked) }),
        el("span", { class: "swatch-box", html: swatchHtml(sample) }),
        el("span", {}, ov.title));
    })));
  }

  root.replaceChildren(toggle, body);
}
