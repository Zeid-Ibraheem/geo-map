// Icônes dessinées à la volée (aucun fichier image) : un disque sombre cerclé de couleur
// avec un pictogramme de la même couleur. Le nom d'une image est « icon:<forme>:<couleur> ».

// Pictogrammes dans une grille de 24 × 24 (tracés originaux, formes simples).
const PATHS = {
  plane: "M12 2c.8 0 1.3.7 1.3 1.5V9l7.7 4.4v2l-7.7-2.2v4.6l2.2 1.7V21L12 20l-3.5 1v-1.5l2.2-1.7v-4.6L3 15.4v-2L10.7 9V3.5C10.7 2.7 11.2 2 12 2z",
  jet: "M12 1.5l1.6 4.5v4.2l8.4 6.3v2.2l-8.4-3.2v3.6l2.6 2.2v1.7L12 21.6l-4.2 1.4v-1.7l2.6-2.2v-3.6L2 18.7v-2.2l8.4-6.3V6z",
  ship: "M2.5 14h19l-2.7 5.7c-.2.4-.6.6-1 .6H6.2c-.4 0-.8-.2-1-.6L2.5 14zM5.5 12.5V9h13v3.5h-13zM9 7.5V4.5h6v3H9z",
  star: "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z",
  bolt: "M13.5 1.5L4 14h6.2L9 22.5 19 9.5h-6.3z",
  triangle: "M12 3.5l9.5 17h-19zM10 8.5l2-1.5 2 1.5-1 1h-2z",
  drop: "M12 2.5C9 7 6 10.3 6 14a6 6 0 0012 0c0-3.7-3-7-6-11.5z",
  flame: "M12 1.5c1.2 3.8 5.5 5.8 5.5 11a5.5 5.5 0 01-11 0c0-2.2 1.1-3.8 2.7-4.9-.2 2.2.9 3.3 2 3.5-.2-3.4.3-6.6.8-9.6z",
  diamond: "M12 2l10 10-10 10L2 12z",
  rocket: "M12 1.5c3.2 2.2 4.8 5.8 4.8 10l2.2 3.8h-3.8l-1 3.2h-4.4l-1-3.2H5l2.2-3.8c0-4.2 1.6-7.8 4.8-10z",
};

const SHAPES = new Set([...Object.keys(PATHS), "atom"]);

export function iconId(shape, color) {
  return `icon:${shape}:${color}`;
}

export function parseIconId(id) {
  const m = /^icon:([a-z]+):(#[0-9a-fA-F]{3,8})$/.exec(id);
  return m && SHAPES.has(m[1]) ? { shape: m[1], color: m[2] } : null;
}

function drawGlyph(ctx, shape, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (shape === "atom") {
    ctx.lineWidth = 1.4;
    for (const angle of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      ctx.beginPath();
      ctx.ellipse(12, 12, 9, 3.4, angle, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(12, 12, 2.2, 0, 2 * Math.PI);
    ctx.fill();
    return;
  }
  ctx.fill(new Path2D(PATHS[shape]));
}

/** Dessine l'icône dans un canevas carré de `px` pixels. */
export function drawIcon(canvas, shape, color, px) {
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  const r = px / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - px * 0.06, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(10, 12, 16, 0.92)";
  ctx.fill();
  ctx.lineWidth = px * 0.07;
  ctx.strokeStyle = color;
  ctx.stroke();
  const scale = (px * 0.62) / 24;
  ctx.save();
  ctx.translate(r - 12 * scale, r - 12 * scale);
  ctx.scale(scale, scale);
  drawGlyph(ctx, shape, color);
  ctx.restore();
  return ctx;
}

/** Image prête pour map.addImage (dessinée en double résolution pour les écrans nets). */
export function iconImageData(shape, color, cssPx = 22) {
  const px = cssPx * 2;
  const ctx = drawIcon(document.createElement("canvas"), shape, color, px);
  return ctx.getImageData(0, 0, px, px);
}

/** Petite image pour le panneau et la légende. */
export function iconDataUrl(shape, color, cssPx = 18) {
  const canvas = document.createElement("canvas");
  drawIcon(canvas, shape, color, cssPx * 2);
  return canvas.toDataURL();
}
