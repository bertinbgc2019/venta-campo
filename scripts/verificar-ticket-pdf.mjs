// Verifica el ticket en PDF que genera la app.
//
// 1) Toma la plantilla REAL de src/app.js (construirTicketPDF) y la ejecuta
//    en Node con jsPDF, de modo que lo que se revisa es exactamente lo que
//    el usuario recibe en el celular.
// 2) Extrae el texto y su posicion del PDF resultante (los operadores de
//    texto del flujo de contenido) para comprobar la maquetacion: cabecera,
//    datos del cliente, tabla de productos, totales, notas y pie de pagina.
// 3) Comprueba que el PDF es una sola hoja A4 y que contiene todo lo esperado.
//
// Uso:  node scripts/verificar-ticket-pdf.mjs [archivo.pdf]
//        (sin argumento genera el PDF desde src/app.js)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { jsPDF } = require("jspdf");

// ---------------------------------------------------------------------
// 1. Cargar la plantilla real de la app
// ---------------------------------------------------------------------
const app = readFileSync("src/app.js", "utf8");

function extraerFuncion(src, nombre) {
  // 1) Declaración normal: function nombre( ... ) { ... }
  const decl = `function ${nombre}(`;
  let inicio = src.indexOf(decl);
  if (inicio >= 0) {
    const llave = src.indexOf("{", inicio);
    let nivel = 0, fin = -1;
    for (let j = llave; j < src.length; j++) {
      if (src[j] === "{") nivel++;
      else if (src[j] === "}") { nivel--; if (nivel === 0) { fin = j; break; } }
    }
    if (fin < 0) throw new Error("No se pudo cerrar " + nombre);
    return src.slice(inicio, fin + 1);
  }
  // 2) Flecha de una línea: const nombre = (args) => expr;
  const cons = `const ${nombre} = `;
  inicio = src.indexOf(cons);
  if (inicio >= 0) {
    const fin = src.indexOf(";", inicio);
    return src.slice(inicio + cons.length, fin).trim();
  }
  throw new Error("No se encontro " + nombre + " en src/app.js");
}

const fmtNumSrc = extraerFuncion(app, "fmtNum");
const fmtMonedaSrc = extraerFuncion(app, "fmtMoneda");
const fechaLegibleSrc = extraerFuncion(app, "fechaLegible");
const fechaDesdeISO = extraerFuncion(app, "fechaDesdeISO");
const etiquetaMetodoPagoSrc = extraerFuncion(app, "etiquetaMetodoPago");
const construirSrc = extraerFuncion(app, "construirTicketPDF");

const sandbox = { window: { jspdf: { jsPDF } } };
const factory = new Function(
  "window", "fmtNum", "fmtMoneda", "fechaLegible", "fechaDesdeISO", "etiquetaMetodoPago",
  "return (" + construirSrc + ");"
);
const fmtNum = new Function("n", "return (" + fmtNumSrc + ");")(0);
const fmtMoneda = new Function("n", "return (" + fmtMonedaSrc + ");")(0);
const fechaDesdeISOFn = new Function("iso", "return (" + fechaDesdeISO + ");")("2026-01-01");
const fechaLegible = new Function("iso", "return (" + fechaLegibleSrc + ");")("2026-01-01");
const etiquetaMetodoPago = new Function("m", "return (" + etiquetaMetodoPagoSrc + ");")("efectivo");
const construirTicketPDF = factory(sandbox.window, fmtNum, fmtMoneda, fechaLegible, fechaDesdeISOFn, etiquetaMetodoPago);

const OP = {
  tipo: "venta",
  id: "1792610348856",
  fecha: new Date("2026-10-21T13:56:55-06:00").getTime(),
  items: [
    { cantidad: 2, descripcion: "Camisa tactica dry-fit", precio: 250, subtotal: 500 },
    { cantidad: 1, descripcion: "Cinturon tactico con funda", precio: 180, subtotal: 180 }
  ],
  total: 680,
  metodoPago: "efectivo",
  efectivo: 1000,
  cambio: 320,
  clienteNombre: "MORELOS",
  telefono: "5512345678",
  vendedorNombre: "Carlos Lopez",
  negocioNombre: "PASALE",
  anotaciones: "Entregar en la manana del lunes."
};

// ---------------------------------------------------------------------
// 2. Generar el PDF (o usar el archivo indicado)
// ---------------------------------------------------------------------
const arg = process.argv[2];
let archivo = arg;
if (!arg) {
  const doc = construirTicketPDF(OP);
  archivo = "scripts/.ticket-verificacion.pdf";
  writeFileSync(archivo, Buffer.from(doc.output("arraybuffer")));
  console.log("PDF generado desde src/app.js -> " + archivo +
    " (" + doc.getNumberOfPages() + " pagina(s))\n");
}

const buf = readFileSync(archivo);
const lat = buf.toString("latin1");

// ---------------------------------------------------------------------
// 3. Extraer texto y posiciones del PDF
// ---------------------------------------------------------------------
const streams = [];
let pos = 0;
while (true) {
  const i = lat.indexOf("stream", pos);
  if (i < 0) break;
  let d = i + 6;
  if (lat[d] === "\r") d++;
  if (lat[d] === "\n") d++;
  const fin = lat.indexOf("endstream", d);
  if (fin < 0) break;
  streams.push({ dict: lat.slice(Math.max(0, i - 400), i), data: buf.slice(d, fin) });
  pos = fin + 9;
}

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
  for (const op of txt.split(/\r?\n/)) {
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

console.log("Archivo: " + archivo);
console.log("Objetos de texto: " + lineas.length + "\n");
console.log("y      x     tam  texto");
console.log("------ ----- ---- ---------------------------------------------");
for (const l of [...lineas].sort((a, b) => (b.y - a.y) || (a.x - b.x))) {
  console.log(String(l.y).padStart(6), String(l.x).padStart(5), String(l.size).padStart(4), " " + l.txt);
}

// ---------------------------------------------------------------------
// 4. Comprobaciones
// ---------------------------------------------------------------------
const textos = lineas.map(l => l.txt).join(" | ");
const en = (t) => textos.indexOf(t) >= 0;
const yDe = (t) => { const l = lineas.find(x => x.txt.indexOf(t) >= 0); return l ? l.y : null; };
const A4_ANCHO = 595, A4_ALTO = 842;

const checks = [
  ["Titulo del documento", en("NOTA DE VENTA")],
  ["NO aparece el nombre del negocio", !en("PASALE")],
  ["NO aparece el lema del negocio", !en("equipo de campo")],
  ["Aviso: nota informativa", en("nota informativa")],
  ["Aviso: no es una factura", en("no es una factura")],
  ["Folio", en("Folio: 1792610348856")],
  ["Fecha de emision", en("21/10/2026")],
  ["Etiqueta CLIENTE", en("CLIENTE")],
  ["Nombre del cliente", en("MORELOS")],
  ["Etiqueta ATENDIO", en("ATENDI")],
  ["Nombre del vendedor", en("Carlos Lopez")],
  ["Telefono del cliente", en("5512345678")],
  ["Columna PRODUCTO", en("PRODUCTO")],
  ["Columna CANT.", en("CANT.")],
  ["Columna PRECIO", en("PRECIO")],
  ["Columna IMPORTE", en("IMPORTE")],
  ["Producto 1", en("Camisa tactica dry-fit")],
  ["Producto 2", en("Cinturon tactico con funda")],
  ["Total de la venta", en("$680.00")],
  ["Panel TOTAL", en("TOTAL")],
  ["Forma de pago", en("Efectivo")],
  ["Efectivo recibido", en("$1000.00")],
  ["Cambio", en("Cambio")],
  ["Bloque NOTAS", en("NOTAS")],
  ["Texto de la nota", en("Entregar en la manana del lunes.")],
  ["Cierre de agradecimiento", en("Gracias por su preferencia")],
  ["Maquetacion: la cabecera esta arriba", (yDe("NOTA DE VENTA") || 0) > A4_ALTO - 80],
  ["Maquetacion: el pie esta abajo", (yDe("Gracias por su preferencia") || 0) < 120],
  ["Maquetacion: la tabla esta en la mitad superior", (yDe("PRODUCTO") || 0) > A4_ALTO * 0.55],
  ["Maquetacion: los totales estan por debajo de la tabla", (yDe("TOTAL") || 0) < (yDe("PRODUCTO") || 0)],
  ["Maquetacion: nada se sale del margen izquierdo", lineas.every(l => l.x >= 45)],
  ["Maquetacion: nada se sale del margen derecho", lineas.every(l => l.x <= A4_ANCHO - 45)]
];

console.log("\n--- comprobaciones ---");
let fallos = 0;
for (const [nombre, ok] of checks) {
  if (!ok) fallos++;
  console.log((ok ? "✅" : "❌") + " " + nombre);
}

// El PDF debe ser una sola hoja A4
const paginas = (lat.match(/\/Type\s*\/Page[^s]/g) || []).length;
const mb = lat.match(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
const esA4 = !!mb && Math.abs(parseFloat(mb[1]) - 595.28) < 1 && Math.abs(parseFloat(mb[2]) - 841.89) < 1;
if (paginas !== 1) fallos++;
console.log((paginas === 1 ? "✅" : "❌") + " El documento tiene una sola hoja (" + paginas + ")");
if (!esA4) fallos++;
console.log((esA4 ? "✅" : "❌") + " El documento es tamaño A4 (" + (mb ? mb[1] + " x " + mb[2] + " pt" : "sin MediaBox") + ")");

console.log("\n" + (fallos === 0 ? "🎉" : "⚠️") + " " + (checks.length + 2 - fallos) + " correctos, " + fallos + " fallidos");
process.exit(fallos > 0 ? 1 : 0);
