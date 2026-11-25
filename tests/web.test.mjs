// Tests de la logique de la page : node --test tests/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildScale, classify, computeBreaks, fillColorExpression, pickColors } from "../web/js/choropleth.js";
import { formatValue } from "../web/js/format.js";
import { baseStyle, colorExpression, overlayLayers, radiusExpression, sortOverlays } from "../web/js/styles.js";

const catalog = JSON.parse(readFileSync(new URL("../web/catalog.json", import.meta.url)));

test("quantiles : classes croissantes et toutes les valeurs classées", () => {
  const values = Array.from({ length: 100 }, (_, i) => i * i);
  const breaks = computeBreaks(values, 7);
  assert.equal(breaks.length, 6);
  assert.deepEqual([...breaks].sort((a, b) => a - b), breaks);
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
  assert.ok(scale.classes.RUS >= scale.classes.FRA);
  assert.ok(scale.classes.FRA >= scale.classes.PRK);
  assert.equal(scale.ranges[0].from, 60);
  assert.equal(scale.ranges.at(-1).to, 5420);
  assert.deepEqual(scale.years, [2026, 2026]);
  const expr = fillColorExpression(scale.colors, "#000");
  assert.equal(expr[0], "step");
  assert.equal(expr.length, 3 + 2 * scale.colors.length);
});

test("format français", () => {
  assert.equal(formatValue(1234567, "integer", "$"), "1 234 567 $");
  assert.equal(formatValue(112.34, "decimal", "%"), "112,3 %");
  assert.equal(formatValue(null), "—");
  assert.equal(formatValue("PWR", "text"), "PWR");
});

test("expressions de style", () => {
  assert.equal(colorExpression("#fff"), "#fff");
  assert.deepEqual(colorExpression({ by: "s", values: { a: "#1" }, default: "#2" }), ["match", ["to-string", ["get", "s"]], "a", "#1", "#2"]);
  assert.deepEqual(radiusExpression({ by: "mag", stops: [[4, 2], [8, 10]] }), ["interpolate", ["linear"], ["to-number", ["get", "mag"], 0], 4, 2, 8, 10]);
});

test("catalogue : identifiants uniques et toutes les couches traduisibles", () => {
  const ids = catalog.overlays.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  const layerIds = catalog.overlays.flatMap((o) => overlayLayers(o).map((l) => l.id));
  assert.equal(new Set(layerIds).size, layerIds.length);
  for (const o of catalog.overlays) assert.ok(o.live || o.source?.url, `${o.id} sans source`);
  const indIds = catalog.indicators.map((i) => i.id);
  assert.equal(new Set(indIds).size, indIds.length);
});

test("empilement : surfaces < lignes < points", () => {
  const types = sortOverlays(catalog.overlays).map((o) => o.style.type);
  const rank = { fill: 0, line: 1, circle: 2 };
  for (let i = 1; i < types.length; i++) assert.ok(rank[types[i - 1]] <= rank[types[i]]);
});

test("style de base valide", () => {
  const style = baseStyle(catalog);
  assert.equal(style.version, 8);
  assert.ok(style.sources.countries.promoteId === "iso3");
  const ids = style.layers.map((l) => l.id);
  assert.ok(ids.includes("countries-label"));
  assert.equal(ids.at(-1), "countries-label");
});
