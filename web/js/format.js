// Mise en forme des nombres et des textes affichés (français).

const NBSP = " ";
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function formatValue(value, format = "integer", unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "datetime") return new Date(value).toLocaleString("fr-FR");
  if (format === "year") return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : String(value);
  if (typeof value !== "number") {
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    value = n;
  }
  const text = (format === "compact" ? compact : format === "decimal" ? decimal : integer).format(value);
  return unit ? `${text}${NBSP}${unit}` : text;
}

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
