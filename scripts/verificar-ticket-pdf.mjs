// Extrae el texto y su posicion del PDF generado por el ticket, para
// comprobar que la plantilla quedo bien maquetada (sin abrir el PDF).
// Uso: node scripts/verificar-ticket-pdf.mjs [archivo.pdf]
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const archivo = process.argv[2] || "public/ticket_prueba_app.pdf";
const buf = readFileSync(archivo);
const lat = buf.toString("latin1");

// --- localizar todos los streams ---
const streams = [];
let pos = 0;
while (true) {
  const i = lat.indexOf("stream", pos);
  if (i < 0) break;
  const inicio = i + 6;
  if (lat[inicio] === "\r") { /* ok */ }
  let d = inicio;
  if (lat[d] === "\r") d++;
  if (lat[d] === "\n") d++;
  const fin = lat.indexOf("endstream", d);
  if (fin < 0) break;
  const dict = lat.slice(Math.max(0, i - 400), i);
  streams.push({ dict, data: buf.slice(d, fin) });
  pos = fin + 9;
}

// --- descomprimir y extraer operadores de texto ---
const lineas = [];
for (const s of streams) {
  let txt;
  if (s.dict.includes("FlateDecode")) {
    try { txt = inflateSync(s.data).toString("latin1"); } catch (_) { continue; }
  } else {
    txt = s.data.toString("latin1");
  }
  if (!txt.includes("BT")) continue;

  let x = 0, y = 0, size = 0, font = "";
  const ops = txt.split(/\r?\n/);
  for (const op of ops) {
    if (op.trim() === "BT") { x = 0; y = 0; }   // BT reinicia la matriz de texto
    let m = op.match(/^\/(\S+)\s+([\d.]+)\s+Tf$/);
    if (m) { font = m[1]; size = parseFloat(m[2]); continue; }
    m = op.match(/^1\s+0\s+0\s+1\s+([-\d.]+)\s+([-\d.]+)\s+Tm$/);
    if (m) { x = parseFloat(m[1]); y = parseFloat(m[2]); continue; }
    m = op.match(/^([-\d.]+)\s+([-\d.]+)\s+Td$/);
    if (m) { x += parseFloat(m[1]); y += parseFloat(m[2]); continue; }
    m = op.match(/^\((.*)\)\s*Tj$/);
    if (m) {
      const t = m[1].replace(/\\([()\\])/g, "$1");
      if (t.trim()) lineas.push({ x: Math.round(x), y: Math.round(y), size, font, txt: t });
      continue;
    }
    m = op.match(/^\[(.*)\]\s*TJ$/);
    if (m) {
      const partes = m[1].match(/\((.*?)\)/g) || [];
      const t = partes.map(p => p.slice(1, -1)).join("");
      if (t.trim()) lineas.push({ x: Math.round(x), y: Math.round(y), size, font, txt: t });
    }
  }
}

// --- imprimir maquetacion ---
const ordenadas = [...lineas].sort((a, b) => (b.y - a.y) || (a.x - b.x));
console.log(`Archivo: ${archivo}`);
console.log(`Objetos de texto: ${lineas.length}\n`);
console.log("y      x     tam  texto");
console.log("------ ----- ---- ---------------------------------------------");
for (const l of ordenadas) {
  console.log(String(l.y).padStart(6), String(l.x).padStart(5), String(l.size).padStart(4), " " + l.txt);
}
const textos = lineas.map(l => l.txt).join(" | ");
console.log("\n--- comprobaciones ---");
const checks = [
  ["Encabezado del negocio", /PASALE/],
  ["Tipo de documento", /NOTA DE VENTA/],
  ["Folio", /Folio: 1792610348856/],
  ["Cliente", /MORELOS/],
  ["Vendedor", /Carlos Lopez/],
  ["Columna PRODUCTO", /PRODUCTO/],
  ["Columna CANT.", /CANT\./],
  ["Columna PRECIO", /PRECIO/],
  ["Columna IMPORTE", /IMPORTE/],
  ["Total", /TOTAL/],
  ["Forma de pago", /Efectivo/],
  ["Efectivo recibido", /Efectivo recibido/],
  ["Cambio", /Cambio/],
  ["Notas", /NOTAS/],
  ["Gracias", /Gracias por su preferencia/]
];
let fallos = 0;
for (const [nombre, rx] of checks) {
  const ok = rx.test(textos);
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
}
console.log(`\n${fallos === 0 ? "🎉" : "⚠️"} ${checks.length - fallos} correctos, ${fallos} fallidos`);
process.exit(fallos > 0 ? 1 : 0);
