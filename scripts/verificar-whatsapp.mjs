// Verifica la lógica de envío por WhatsApp:
//   - Cliente REGISTRADO  -> se usa su número guardado (sin preguntar nada).
//   - Cliente NO registrado (venta de mostrador) -> se le pregunta el número.
//
// Se toma la función REAL de src/app.js (normalizarNumeroWhatsApp y
// numeroWhatsAppParaEnvio) y se ejecuta en Node con el modal simulado.
//
// Uso:  node scripts/verificar-whatsapp.mjs
import { readFileSync } from "node:fs";

const app = readFileSync("src/app.js", "utf8");

function extraerFuncion(src, nombre) {
  // 1) Declaración normal: function nombre( ... ) { ... }
  const decl = `function ${nombre}(`;
  let inicio = src.indexOf(decl);
  if (inicio >= 0) {
    // Si es "async function", se conserva el async
    const previo = src.slice(Math.max(0, inicio - 6), inicio);
    if (previo.endsWith("async ")) inicio = src.lastIndexOf("async ", inicio);
    const llave = src.indexOf("{", inicio);
    let nivel = 0, fin = -1;
    for (let j = llave; j < src.length; j++) {
      if (src[j] === "{") nivel++;
      else if (src[j] === "}") { nivel--; if (nivel === 0) { fin = j; break; } }
    }
    if (fin < 0) throw new Error("No se pudo cerrar " + nombre);
    return src.slice(inicio, fin + 1);
  }
  throw new Error("No se encontro " + nombre + " en src/app.js");
}

const CODIGO_PAIS_WHATSAPP = "52";

const normSrc = extraerFuncion(app, "normalizarNumeroWhatsApp");
const numSrc = extraerFuncion(app, "numeroWhatsAppParaEnvio");

globalThis.normalizarNumeroWhatsApp = new Function(
  "CODIGO_PAIS_WHATSAPP",
  "return (" + normSrc + ");"
)(CODIGO_PAIS_WHATSAPP);

const preguntas = [];
let respuestas = [];

// Simula el modal de captura del número (como el de la app)
const windowMock = {
  pedirNumeroWhatsApp: () => {
    preguntas.push("pedido");
    return Promise.resolve(respuestas.length ? respuestas.shift() : "");
  }
};

const numeroWhatsAppParaEnvio = new Function(
  "window", "CODIGO_PAIS_WHATSAPP",
  "return (" + numSrc + ");"
)(windowMock, CODIGO_PAIS_WHATSAPP);

let ok = 0, fallos = 0;
function comprobar(nombre, condicion, extra = "") {
  if (condicion) { ok++; console.log(`✅ ${nombre}`); }
  else { fallos++; console.log(`❌ ${nombre} ${extra}`); }
}

// ---------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------
const norm = globalThis.normalizarNumeroWhatsApp;
comprobar("10 dígitos -> lada 52", norm("5512345678") === "525512345678", norm("5512345678"));
comprobar("12 dígitos (52 + 10) se respeta", norm("525512345678") === "525512345678");
comprobar("11 dígitos con 1 inicial", norm("15512345678") === "525512345678");
comprobar("Acepta guiones, espacios y paréntesis", norm("55 (1234) 56-78") === "525512345678", norm("55 (1234) 56-78"));
comprobar("Acepta el prefijo +52 con espacios", norm("+52 55 1234 5678") === "525512345678");
comprobar("Quita el 1 de +1 52", norm("+1 52 55 1234 5678") === "525512345678");
comprobar("Número incompleto -> vacío", norm("12345") === "");
comprobar("Vacío -> vacío", norm("") === "");
comprobar("Texto -> vacío", norm("sin numero") === "");

// ---------------------------------------------------------------------
// Cliente REGISTRADO: usa su número y NO pregunta
// ---------------------------------------------------------------------
preguntas.length = 0; respuestas = [];
let r = await numeroWhatsAppParaEnvio({ telefono: "5512345678" });
comprobar("Cliente registrado: usa el número guardado", r === "525512345678", r);
comprobar("Cliente registrado: no pregunta nada", preguntas.length === 0, "preguntas: " + preguntas.length);

r = await numeroWhatsAppParaEnvio({ telefono: "525512345678" });
comprobar("Cliente registrado con lada: no se duplica", r === "525512345678", r);

r = await numeroWhatsAppParaEnvio({ telefono: "55 1234 5678" });
comprobar("Cliente registrado con formato: se limpia", r === "525512345678", r);
comprobar("Cliente registrado: sigue sin preguntar", preguntas.length === 0, "preguntas: " + preguntas.length);

// ---------------------------------------------------------------------
// Cliente NO registrado: se pregunta el número
// ---------------------------------------------------------------------
preguntas.length = 0; respuestas = ["5512345678"];
r = await numeroWhatsAppParaEnvio({ telefono: "" });
comprobar("Cliente no registrado: pregunta el número", preguntas.length === 1, "preguntas: " + preguntas.length);
comprobar("Cliente no registrado: usa el número capturado", r === "525512345678", r);

preguntas.length = 0; respuestas = ["525512345678"];
r = await numeroWhatsAppParaEnvio({});
comprobar("Cliente no registrado: acepta el número con lada", r === "525512345678", r);

preguntas.length = 0; respuestas = ["5512345678"];
r = await numeroWhatsAppParaEnvio({ telefono: "12345" });   // teléfono inservible = no registrado
comprobar("Teléfono inservible: se pregunta", preguntas.length === 1, "preguntas: " + preguntas.length);
comprobar("Teléfono inservible: usa el número capturado", r === "525512345678", r);

// ---------------------------------------------------------------------
// Cancelar
// ---------------------------------------------------------------------
preguntas.length = 0; respuestas = [""];
r = await numeroWhatsAppParaEnvio({ telefono: "" });
comprobar("Si cancela: no se envía nada", r === "", r);
comprobar("Si cancela: sólo una pregunta", preguntas.length === 1, "preguntas: " + preguntas.length);

// ---------------------------------------------------------------------
// La app usa el helper en los dos envíos y el modal existe
// ---------------------------------------------------------------------
comprobar(
  "El ticket PDF usa el helper de número",
  app.includes("const numero = await numeroWhatsAppParaEnvio(op);")
);
comprobar(
  "El resumen de texto usa el helper de número",
  app.includes("const numero = await numeroWhatsAppParaEnvio(ultimaOperacion);")
);
comprobar(
  "Ya no se manda wa.me sin número válido",
  !app.includes("telefonoWhatsApp(ultimaOperacion.telefono)")
);
comprobar(
  "El modal de captura del número está en el HTML",
  app.includes("pedirNumeroWhatsApp") &&
  (() => {
    const html = readFileSync("index.html", "utf8");
    return html.includes('id="modal-numero-whatsapp"') &&
           html.includes('id="input-numero-whatsapp"') &&
           html.includes("confirmarNumeroWhatsApp()");
  })()
);

console.log(`\n🎉 ${ok} correctos, ${fallos} fallidos`);
process.exit(fallos ? 1 : 0);
