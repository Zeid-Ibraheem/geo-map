// Classes de couleurs pour colorer les pays selon un indicateur.
// On utilise des quantiles : chaque classe contient à peu près le même nombre de pays,
// ce qui reste lisible même quand les valeurs sont très inégales (PIB, ogives…).

export function computeBreaks(values, classCount) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks = [];
  for (let i = 1; i < classCount; i++) {
    const t = sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / classCount))];
    if (t > sorted[0] && !breaks.includes(t)) breaks.push(t);
  }
  return breaks;
}

/** Numéro de classe : nombre de seuils inférieurs ou égaux à la valeur. */
export function classify(value, breaks) {
  let cls = 0;
  for (const t of breaks) if (value >= t) cls++;
  return cls;
}

/** Répartit la palette sur le nombre de classes réellement utilisées. */
export function pickColors(palette, classCount) {
  if (classCount <= 1) return [palette[palette.length - 1]];
  return Array.from({ length: classCount }, (_, i) => palette[Math.round((i * (palette.length - 1)) / (classCount - 1))]);
}

/** Tout ce qu'il faut pour colorer la carte et dessiner la légende. */
export function buildScale(valuesByIso, palette) {
  const entries = Object.entries(valuesByIso ?? {}).filter(([, d]) => Number.isFinite(d?.v));
  const values = entries.map(([, d]) => d.v);
  const breaks = computeBreaks(values, palette.length);
  const colors = pickColors(palette, breaks.length + 1);
  const classes = Object.fromEntries(entries.map(([iso, d]) => [iso, classify(d.v, breaks)]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ranges = colors.map((color, i) => ({
    color,
    from: i === 0 ? min : breaks[i - 1],
    to: i === colors.length - 1 ? max : breaks[i],
  }));
  const years = entries.map(([, d]) => d.y).filter(Number.isFinite);
  return {
    classes,
    colors,
    ranges,
    count: entries.length,
    years: years.length ? [Math.min(...years), Math.max(...years)] : null,
  };
}

/** Expression MapLibre : couleur selon la classe stockée dans l'état de chaque pays. */
export function fillColorExpression(colors, noDataColor) {
  const expr = ["step", ["coalesce", ["feature-state", "cls"], -1], noDataColor];
  colors.forEach((c, i) => expr.push(i, c));
  return expr;
}
