// Tests de la logique de la page : node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildScale, classify, computeBreaks, fillColorExpression, pickColors } from "../web/js/choropleth.js";
import { formatValue } from "../web/js/format.js";
import { parseIconId } from "../web/js/icons.js";
import {
  colorExpression, colorsOf, composeStyle, iconImageExpression, iconSizeExpression,
  legendEntries, overlayLayers, radiusExpression, sortOverlays,
} from "../web/js/styles.js";

const catalog = JSON.parse(readFileSync(new URL("../web/catalog.json", import.meta.url)));

test("quantiles : classes croissantes et toutes les valeurs classées", () => {
  const values = Array.from({ length: 100 }, (_, i) => i * i);
  const breaks = computeBreaks(values, 7);
  assert.equal(breaks.length, 6);
  assert.equal(classify(0, breaks), 0);
  assert.equal(classify(99 * 99, breaks), 6);
});

test("quantiles : valeurs identiques → une seule classe", () => {
  assert.deepEqual(computeBreaks([5, 5, 5], 7), []);
  assert.equal(pickColors(["a", "b", "c"], 1).length, 1);
});

test("échelle des ogives SIPRI", () => {
  const sipri = JSON.parse(readFileSync(new URL("../static-data/nuclear-warheads-sipri-2026.json", import.meta.url)));
  const values = Object.fromEntries(Object.entries(sipri.values).map(([k, v]) => [k, { v: v.total_inventory, y: 2026 }]));
  const scale = buildScale(values, catalog.map.palette);
  assert.equal(scale.count, 9);
  assert.ok(scale.classes.RUS >= scale.classes.FRA && scale.classes.FRA >= scale.classes.PRK);
  assert.equal(scale.ranges[0].from, 60);
  assert.equal(scale.ranges.at(-1).to, 5420);
  assert.equal(fillColorExpression(scale.colors, "#000").length, 3 + 2 * scale.colors.length);
});

test("format français", () => {
  assert.equal(formatValue(1234567, "integer", "$"), "1 234 567 $");
  assert.equal(formatValue(112.34, "decimal", "%"), "112,3 %");
  assert.equal(formatValue(2004.6, "year"), "2005");
  assert.equal(formatValue(null), "—");
});

test("expressions de couleur, d'icône et de taille", () => {
  const byType = { by: "s", values: { a: "#111111" }, default: "#222222" };
  assert.deepEqual(colorExpression(byType), ["match", ["to-string", ["get", "s"]], "a", "#111111", "#222222"]);
  assert.deepEqual(iconImageExpression("plane", byType), ["match", ["to-string", ["get", "s"]], "a", "icon:plane:#111111", "icon:plane:#222222"]);
  assert.deepEqual(parseIconId("icon:plane:#111111"), { shape: "plane", color: "#111111" });
  assert.equal(parseIconId("icon:inconnu:#111111"), null);
  assert.deepEqual(colorsOf(byType), ["#111111", "#222222"]);
  assert.deepEqual(radiusExpression({ by: "mag", stops: [[4, 2], [8, 10]] }), ["interpolate", ["linear"], ["to-number", ["get", "mag"], 0], 4, 2, 8, 10]);
  const size = iconSizeExpression({ size: 1, size_by: { by: "mw", stops: [[0, 0.5], [1000, 2]] } });
  assert.equal(size[2][0], "zoom"); // le zoom doit être l'entrée principale
  assert.equal(size[4][0], "*");
});

test("catalogue : identifiants uniques, couches traduisibles, icônes connues", () => {
  const ids = catalog.overlays.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  const layerIds = catalog.overlays.flatMap((o) => overlayLayers(o).map((l) => l.id));
  assert.equal(new Set(layerIds).size, layerIds.length);
  for (const o of catalog.overlays) {
    assert.ok(o.live || o.source?.url || o.source?.manual || o.source?.path, `${o.id} sans source`);
    if (o.style.type === "icon") for (const c of colorsOf(o.style.color)) assert.ok(parseIconId(`icon:${o.style.icon}:${c}`), `${o.id} : icône ${o.style.icon} ${c}`);
  }
  assert.equal(new Set(catalog.indicators.map((i) => i.id)).size, catalog.indicators.length);
});

test("couleurs : aucune couche ponctuelle ne partage la couleur d'une autre", () => {
  const owner = new Map();
  for (const o of catalog.overlays) {
    if (!["icon", "circle"].includes(o.style.type)) continue;
    for (const c of colorsOf(o.style.color)) {
      assert.ok(!owner.has(c.toLowerCase()) || owner.get(c.toLowerCase()) === o.id, `${c} utilisé par ${owner.get(c.toLowerCase())} et ${o.id}`);
      owner.set(c.toLowerCase(), o.id);
    }
  }
  const years = catalog.overlays.filter((o) => o.group === "Histoire").map((o) => o.style.color);
  assert.equal(new Set(years).size, years.length, "chaque année a sa couleur");
});

test("légende : une ligne par catégorie, libellés traduits", () => {
  const nuclear = catalog.overlays.find((o) => o.id === "nuclear_plants");
  const rows = legendEntries(nuclear);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].label, "Réacteur en service");
  assert.equal(rows[0].icon, "atom");
});

test("empilement : surfaces < lignes < cercles < icônes", () => {
  const rank = { fill: 0, line: 1, circle: 2, icon: 3 };
  const types = sortOverlays(catalog.overlays).map((o) => o.style.type);
  for (let i = 1; i < types.length; i++) assert.ok(rank[types[i - 1]] <= rank[types[i]]);
});

test("fond vectoriel : nos couches sous les étiquettes, noms en français", () => {
  const vector = {
    version: 8,
    sources: { openmaptiles: { type: "vector", url: "x" } },
    layers: [
      { id: "water", type: "fill", source: "openmaptiles" },
      { id: "road", type: "line", source: "openmaptiles" },
      { id: "place", type: "symbol", source: "openmaptiles", layout: { "text-field": "{name:latin}" } },
      { id: "shield", type: "symbol", source: "openmaptiles", layout: { "text-field": "{ref}" } },
    ],
  };
  const style = composeStyle(catalog, vector);
  const ids = style.layers.map((l) => l.id);
  assert.ok(ids.indexOf("countries-choro") > ids.indexOf("road"));
  assert.ok(ids.indexOf("countries-choro") < ids.indexOf("place"));
  assert.ok(ids.indexOf("base-satellite") < ids.indexOf("place"));
  assert.equal(style.layers.find((l) => l.id === "place").layout["text-field"][0], "coalesce");
  assert.equal(style.layers.find((l) => l.id === "shield").layout["text-field"], "{ref}");
  assert.ok(style.sources.openmaptiles && style.sources.countries);
});

test("fond simple de secours (hors ligne)", () => {
  const style = composeStyle(catalog, null);
  assert.equal(style.version, 8);
  assert.equal(style.layers.at(-1).id, "countries-label");
});
