// Verificacion END-TO-END del aislamiento real, contra Firestore en
// produccion, usando tokens de identidad reales de cada usuario.
//
// Uso:  node scripts/verificar-aislamiento.mjs
//
// No necesita las contrasenas: el Admin SDK genera un token personalizado
// por usuario y se intercambia por un ID token real, que es el mismo que
// usa la app. Despues se hacen consultas al API REST de Firestore con ese
// token y se comprueba si el servidor las permite o las deniega.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT = process.env.FIREBASE_PROJECT || "ventas-campo-92a4c";
const API_KEY = "AIzaSyDIsos1l56VUhZ88kEembayhHC8IL5opmA";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const clave = JSON.parse(
  readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8")
);
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2"; // negocio PASALE (UID de leo26@ventas.campo)
const OTRO_NEGOCIO = "OTRO_NEGOCIO_UID";

const ROOT = "NH1Ny0Uhdvdcv5rgou7aMS8ohS02";
const ADMIN = NID;
const VEND1 = "nMzELg1shjOVSLqndRDGp6VIAF93"; // luis26
const VEND2 = "aLrGpP5GlWR14WhJ5u6DeAOmopu1"; // carlos

async function idTokenDe(uid) {
  const custom = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("No se pudo emitir ID token: " + JSON.stringify(j));
  return j.idToken;
}

async function peticion(method, path, idToken, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}

// Listado con filtro real (equivalente a .where(...).get() de la app)
async function consultar(coleccion, idToken, filtro) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: coleccion }],
      ...(filtro
        ? { where: { fieldFilter: { field: { fieldPath: filtro[0] }, op: "EQUAL", value: { stringValue: filtro[1] } } } }
        : {}),
    },
  };
  const r = await fetch(`${BASE}/negocios/${NID}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(body),
  });
  const texto = await r.text();
  let permiso = 200;
  let docs = 0;
  // La respuesta puede venir como un array JSON o como NDJSON.
  let objetos = [];
  try {
    const parseado = JSON.parse(texto);
    objetos = Array.isArray(parseado) ? parseado : [parseado];
  } catch (_) {
    objetos = texto.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (_) { return {}; } });
  }
  for (const o of objetos) {
    if (o.error) {
      permiso = o.error.status === "PERMISSION_DENIED" || o.error.code === 7 ? 403 : 400;
      break;
    }
    if (o.document) docs++;
  }
  return { status: permiso, docs, permiso };
}

const tokens = {
  root: await idTokenDe(ROOT),
  admin: await idTokenDe(ADMIN),
  vend1: await idTokenDe(VEND1),
  vend2: await idTokenDe(VEND2),
};
console.log("Tokens reales emitidos para root / leo26 (admin) / luis26 / carlos\n");

const casos = [
  // --- Root ---
  { n: "Root lista administradores", m: "GET", p: "/admins", t: "root", e: 200 },
  { n: "Root lista vendedores", m: "GET", p: "/vendedores", t: "root", e: 200 },
  { n: "Root lista catalogo del negocio", m: "GET", p: `/negocios/${NID}/productos`, t: "root", e: 200 },
  { n: "Root lista clientes del negocio", m: "GET", p: `/negocios/${NID}/clientes`, t: "root", e: 200 },

  // --- Admin ---
  { n: "Admin lee su perfil", m: "GET", p: `/admins/${ADMIN}`, t: "admin", e: 200 },
  { n: "Admin lista TODOS los clientes de su negocio", m: "GET", p: `/negocios/${NID}/clientes`, t: "admin", e: 200 },
  { n: "Admin lista todas las ventas de su negocio", m: "GET", p: `/negocios/${NID}/ventas`, t: "admin", e: 200 },
  { n: "Admin lista su catalogo", m: "GET", p: `/negocios/${NID}/productos`, t: "admin", e: 200 },
  { n: "Admin lista a sus vendedores", m: "GET", p: `/negocios/${NID}/vendedores`, t: "admin", e: 200 },
  { n: "Admin NO lee datos de otro negocio", m: "GET", p: `/negocios/${OTRO_NEGOCIO}/clientes`, t: "admin", e: 403 },
  { n: "Admin NO lee datos legacy en la raiz", m: "GET", p: "/clientes", t: "admin", e: 403 },

  // --- Vendedor ---
  { n: "Vendedor lee su perfil espejo", m: "GET", p: `/vendedores/${VEND1}`, t: "vend1", e: 200 },
  { n: "Vendedor lee el catalogo de SU negocio", m: "GET", p: `/negocios/${NID}/productos`, t: "vend1", e: 200 },
  { n: "Vendedor NO lista clientes sin filtro (debe fallar)", m: "GET", p: `/negocios/${NID}/clientes`, t: "vend1", e: 403 },
  { n: "Vendedor NO lee un cliente de otro vendedor", m: "GET", p: `/negocios/${NID}/clientes/1792004425590`, t: "vend1", e: 403 },
  { n: "Vendedor SI lee una venta propia", m: "GET", p: `/negocios/${NID}/ventas/1791923546936`, t: "vend1", e: 200 },
  { n: "Vendedor NO lee una venta de otro vendedor", m: "GET", p: `/negocios/${NID}/ventas/1792176423324`, t: "vend1", e: 403 },
  { n: "Vendedor NO lista clientes de otro negocio", m: "GET", p: `/negocios/${OTRO_NEGOCIO}/clientes`, t: "vend1", e: 403 },
  { n: "Vendedor NO lee el perfil del administrador", m: "GET", p: `/admins/${ADMIN}`, t: "vend1", e: 403 },
  { n: "Vendedor NO lista el directorio global", m: "GET", p: "/vendedores", t: "vend1", e: 403 },

  // --- Sin sesion ---
  { n: "Anonimo NO lee el catalogo", m: "GET", p: `/negocios/${NID}/productos`, t: null, e: 403 },
  { n: "Anonimo NO lee administradores", m: "GET", p: "/admins", t: null, e: 403 },
];

let ok = 0, fallos = 0;
for (const c of casos) {
  const r = await peticion(c.m, c.p, c.t ? tokens[c.t] : null);
  const bien = r.status === c.e;
  if (bien) ok++; else fallos++;
  console.log(`${bien ? "✅" : "❌"} ${c.n}  [esperado HTTP ${c.e}, obtenido ${r.status}]`);
  if (!bien && r.body) console.log(`     ${JSON.stringify(r.body).substring(0, 250)}`);
}

// --- Consultas filtradas (las que hace la app) --------------------------
console.log("\n--- Consultas filtradas ---");
const filtradas = [
  { n: "Admin lista clientes de su negocio (sin filtro)", col: "clientes", t: "admin", f: null, e: 200 },
  { n: "Vendedor lista clientes filtrando por SU vendedorId", col: "clientes", t: "vend1", f: ["vendedorId", VEND1], e: 200 },
  { n: "Vendedor lista clientes filtrando por otro vendedorId", col: "clientes", t: "vend1", f: ["vendedorId", VEND2], e: 403 },
  { n: "Vendedor lista ventas filtrando por SU vendedorId", col: "ventas", t: "vend1", f: ["vendedorId", VEND1], e: 200 },
  { n: "Vendedor lista ventas de otro vendedor", col: "ventas", t: "vend1", f: ["vendedorId", VEND2], e: 403 },
  { n: "Vendedor lista nominas de otro vendedor", col: "nominas", t: "vend1", f: ["vendedorId", VEND2], e: 403 },
];
for (const c of filtradas) {
  const r = await consultar(c.col, tokens[c.t], c.f);
  const bien = r.permiso === c.e;
  if (bien) ok++; else fallos++;
  console.log(`${bien ? "✅" : "❌"} ${c.n}  [esperado ${c.e}, obtenido ${r.permiso}${r.docs ? `, ${r.docs} docs` : ", 0 docs"}]`);
}

// --- Escrituras ---------------------------------------------------------
console.log("\n--- Escrituras (documentos temporales) ---");
const docTmp = `tmp-verif-${Date.now()}`;
const campo = (v) => ({ stringValue: v });
const num = (v) => ({ doubleValue: v });

const ventasTmp = await peticion("PATCH", `/negocios/${NID}/ventas/${docTmp}`, tokens.vend1, {
  fields: { vendedorId: campo(VEND1), totalVenta: num(100), negocioId: campo(NID) },
});
const escAdmin = await peticion("PATCH", `/negocios/${NID}/ventas/${docTmp}-a`, tokens.admin, {
  fields: { vendedorId: campo(VEND1), totalVenta: num(100), negocioId: campo(NID) },
});
const escAjeno = await peticion("PATCH", `/negocios/${NID}/ventas/${docTmp}-b`, tokens.vend1, {
  fields: { vendedorId: campo(VEND2), totalVenta: num(100), negocioId: campo(NID) },
});
const escOtroNeg = await peticion("PATCH", `/negocios/${OTRO_NEGOCIO}/ventas/${docTmp}-c`, tokens.vend1, {
  fields: { vendedorId: campo(VEND1), totalVenta: num(100), negocioId: campo(OTRO_NEGOCIO) },
});
const escCatalogo = await peticion("PATCH", `/negocios/${NID}/productos/${docTmp}`, tokens.vend1, {
  fields: { descripcion: campo("Pirata"), precioVenta: num(1) },
});
const borraPropio = await peticion("DELETE", `/negocios/${NID}/ventas/${docTmp}`, tokens.vend1);

const escrituras = [
  { n: "Vendedor crea su propia venta", r: ventasTmp, e: 200 },
  { n: "Admin crea una venta en su negocio", r: escAdmin, e: 200 },
  { n: "Vendedor NO crea una venta a nombre de otro", r: escAjeno, e: 403 },
  { n: "Vendedor NO escribe en otro negocio", r: escOtroNeg, e: 403 },
  { n: "Vendedor NO modifica el catalogo", r: escCatalogo, e: 403 },
  { n: "Vendedor NO puede borrar", r: borraPropio, e: 403 },
];
for (const c of escrituras) {
  const bien = c.r.status === c.e;
  if (bien) ok++; else fallos++;
  console.log(`${bien ? "✅" : "❌"} ${c.n}  [esperado HTTP ${c.e}, obtenido ${c.r.status}]`);
  if (!bien && c.r.body) console.log(`     ${JSON.stringify(c.r.body).substring(0, 250)}`);
}

// --- Ficha del vendedor dentro de su negocio ----------------------------
console.log("\n--- Ficha del vendedor en su negocio ---");
const fichaRef = db.collection("negocios").doc(NID).collection("vendedores").doc(VEND1);
const fichaOrig = await fichaRef.get();
const fichaDatos = fichaOrig.data() || {};
const mask = (campo) => `?updateMask.fieldPaths=${campo}`;

const actualizaFicha = await peticion("PATCH", `/negocios/${NID}/vendedores/${VEND1}${mask("password")}`, tokens.vend1, {
  fields: { password: campo("prueba-temporal") },
});
const fichaOtroNegocio = await peticion("PATCH", `/negocios/${OTRO_NEGOCIO}/vendedores/${VEND1}${mask("password")}`, tokens.vend1, {
  fields: { password: campo("prueba-temporal") },
});
const fichaCambiaNegocio = await peticion("PATCH", `/negocios/${NID}/vendedores/${VEND1}${mask("negocioId")}`, tokens.vend1, {
  fields: { negocioId: campo(OTRO_NEGOCIO) },
});
const fichaAjena = await peticion("PATCH", `/negocios/${NID}/vendedores/${VEND2}${mask("password")}`, tokens.vend1, {
  fields: { password: campo("prueba-temporal") },
});

const fichas = [
  { n: "Vendedor actualiza SU ficha (cambio de clave)", r: actualizaFicha, e: 200 },
  { n: "Vendedor NO escribe su ficha en otro negocio", r: fichaOtroNegocio, e: 403 },
  { n: "Vendedor NO cambia su negocioId", r: fichaCambiaNegocio, e: 403 },
  { n: "Vendedor NO toca la ficha de otro vendedor", r: fichaAjena, e: 403 },
];
for (const c of fichas) {
  const bien = c.r.status === c.e;
  if (bien) ok++; else fallos++;
  console.log(`${bien ? "✅" : "❌"} ${c.n}  [esperado HTTP ${c.e}, obtenido ${c.r.status}]`);
  if (!bien && c.r.body) console.log(`     ${JSON.stringify(c.r.body).substring(0, 250)}`);
}

// Restaurar la ficha original
await fichaRef
  .set(
    { password: fichaDatos.password !== undefined ? fichaDatos.password : FieldValue.delete() },
    { merge: true }
  )
  .catch(() => {});
await db.collection("negocios").doc(OTRO_NEGOCIO).collection("vendedores").doc(VEND1).delete().catch(() => {});

// --- Limpieza -----------------------------------------------------------
for (const id of [docTmp, `${docTmp}-a`, `${docTmp}-b`, `${docTmp}-c`]) {
  await db.collection("negocios").doc(NID).collection("ventas").doc(id).delete().catch(() => {});
  await db.collection("negocios").doc(NID).collection("productos").doc(id).delete().catch(() => {});
}
await db.collection("negocios").doc(OTRO_NEGOCIO).collection("ventas").doc(`${docTmp}-c`).delete().catch(() => {});
console.log("\nDocumentos temporales de prueba eliminados.");

console.log(`\n${ok} correctos, ${fallos} fallidos`);
if (fallos > 0) process.exit(1);
