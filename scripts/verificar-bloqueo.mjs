// Verificacion del BLOQUEO EN CASCADA (Root -> Administrador -> Vendedores)
//
// Que debe cumplirse cuando el Root bloquea a un administrador:
//   1. El administrador bloqueado NO puede leer ni escribir datos de su negocio.
//   2. El administrador bloqueado NO puede auto-desbloquearse.
//   3. El administrador bloqueado SI puede leer su propio perfil (para que la
//      app le muestre el aviso de acceso suspendido).
//   4. Los vendedores de ese negocio NO pueden revisar el historial de ventas.
//   5. Los vendedores de ese negocio NO pueden modificar clientes.
//   6. Los vendedores SI siguen viendo el catalogo y sus clientes.
//   7. Root NO pierde acceso a nada.
//
// Uso:  node scripts/verificar-bloqueo.mjs
// Al terminar, el administrador queda como estaba (acceso activo).
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

const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";   // negocio PASALE (UID de leo26@ventas.campo)
const ADMIN = NID;
const ROOT = "NH1Ny0Uhdvdcv5rgou7aMS8ohS02";
const VEND1 = "nMzELg1shjOVSLqndRDGp6VIAF93";  // luis26
const VEND2 = "aLrGpP5GlWR14WhJ5u6DeAOmopu1";  // carlos

async function idTokenDe(uid) {
  const custom = await auth.createCustomToken(uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.ok && !j.idToken) throw new Error("No se pudo emitir ID token: " + JSON.stringify(j));
  return j.idToken;
}

async function peticion(method, path, idToken, body, query = "") {
  const r = await fetch(`${BASE}${path}${query}`, {
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
  let objetos = [];
  try {
    const parseado = JSON.parse(texto);
    objetos = Array.isArray(parseado) ? parseado : [parseado];
  } catch (_) {
    objetos = texto.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (_) { return {}; } });
  }
  for (const o of objetos) {
    if (o.error) { permiso = 403; break; }
    if (o.document) docs++;
  }
  return { status: permiso, docs };
}

const campo = (v) => ({ stringValue: v });
const tokens = {
  root: await idTokenDe(ROOT),
  admin: await idTokenDe(ADMIN),
  vend1: await idTokenDe(VEND1),
  vend2: await idTokenDe(VEND2),
};

let ok = 0;
let fallos = 0;
function comprobar(nombre, obtenido, esperado, extra = "") {
  const bien = obtenido === esperado;
  if (bien) ok++; else fallos++;
  console.log(`${bien ? "✅" : "❌"} ${nombre}  [esperado ${esperado}, obtenido ${obtenido}]${extra ? " " + extra : ""}`);
}

// =====================================================================
// ESTADO INICIAL: negocio activo
// =====================================================================
console.log("=== ANTES DE BLOQUEAR (negocio activo) ===\n");
{
  const a = await consultar("ventas", tokens.admin);
  const v = await consultar("ventas", tokens.vend1, ["vendedorId", VEND1]);
  comprobar("Admin ve las ventas de su negocio", a.status, 200, `(${a.docs} ventas)`);
  comprobar("Vendedor ve su historial de ventas", v.status, 200, `(${v.docs} ventas)`);
}

// =====================================================================
// EL ROOT BLOQUEA AL ADMINISTRADOR
// =====================================================================
console.log("\n=== BLOQUEANDO AL ADMINISTRADOR (como lo hace el Root) ===\n");
const perfilAdmin = db.collection("admins").doc(ADMIN);
const original = (await perfilAdmin.get()).data() || {};
await perfilAdmin.set({ accesoActivo: false }, { merge: true });
await db.collection("negocios").doc(NID).set({ suspendido: true }, { merge: true });
console.log("admins/{uid}.accesoActivo = false  |  negocios/{nid}.suspendido = true\n");

const docTemporal = `prueba-bloqueo-${Date.now()}`;
// El vendedor con clientes propios es carlos (VEND2); luis26 no tiene.
const clientePropio = await db.collection("negocios").doc(NID).collection("clientes").where("vendedorId", "==", VEND2).limit(1).get();
const clienteId = clientePropio.docs[0]?.id;

console.log("--- Administrador bloqueado ---");
{
  const perfil = await peticion("GET", `/admins/${ADMIN}`, tokens.admin);
  comprobar("Admin bloqueado SI lee su perfil (la app le avisa)", perfil.status, 200);

  const clientes = await peticion("GET", `/negocios/${NID}/clientes`, tokens.admin);
  comprobar("Admin bloqueado NO lee los clientes de su negocio", clientes.status, 403);

  const ventas = await peticion("GET", `/negocios/${NID}/ventas`, tokens.admin);
  comprobar("Admin bloqueado NO lee las ventas de su negocio", ventas.status, 403);

  const productos = await peticion("GET", `/negocios/${NID}/productos`, tokens.admin);
  comprobar("Admin bloqueado NO lee el catalogo de su negocio", productos.status, 403);

  const equipo = await peticion("GET", `/negocios/${NID}/vendedores`, tokens.admin);
  comprobar("Admin bloqueado NO lista a sus vendedores", equipo.status, 403);

  const autoDesbloqueo = await peticion("PATCH", `/admins/${ADMIN}?updateMask.fieldPaths=accesoActivo`, tokens.admin, {
    fields: { accesoActivo: campo("true") },
  });
  comprobar("Admin bloqueado NO puede auto-desbloquearse", autoDesbloqueo.status, 403);

  const escritura = await peticion("PATCH", `/negocios/${NID}/ventas/${docTemporal}?updateMask.fieldPaths=vendedorId`, tokens.admin, {
    fields: { vendedorId: campo(ADMIN) },
  });
  comprobar("Admin bloqueado NO escribe ventas", escritura.status, 403);
}

console.log("\n--- Vendedores del negocio bloqueado ---");
{
  const ventas = await consultar("ventas", tokens.vend1, ["vendedorId", VEND1]);
  comprobar("Vendedor NO revisa el historial de ventas", ventas.status, 403);

  const ventasSinFiltro = await peticion("GET", `/negocios/${NID}/ventas`, tokens.vend1);
  comprobar("Vendedor NO lista ventas sin filtro", ventasSinFiltro.status, 403);

  const catalogo = await peticion("GET", `/negocios/${NID}/productos`, tokens.vend1);
  comprobar("Vendedor SI sigue viendo el catalogo", catalogo.status, 200);

  const clientes = await consultar("clientes", tokens.vend2, ["vendedorId", VEND2]);
  comprobar("Vendedor SI sigue viendo SUS clientes (agenda)", clientes.status, 200, `(${clientes.docs} clientes)`);

  let edicion = { status: 0 };
  if (clienteId) {
    edicion = await peticion("PATCH", `/negocios/${NID}/clientes/${clienteId}?updateMask.fieldPaths=direccion`, tokens.vend2, {
      fields: { direccion: campo("DIRECCION DE PRUEBA BLOQUEO") },
    });
  }
  comprobar("Vendedor NO modifica clientes", edicion.status, 403);

  const alta = await peticion("PATCH", `/negocios/${NID}/clientes/${docTemporal}?updateMask.fieldPaths=vendedorId`, tokens.vend1, {
    fields: { vendedorId: campo(VEND1) },
  });
  comprobar("Vendedor NO registra clientes nuevos", alta.status, 403);

  const ventaNueva = await peticion("PATCH", `/negocios/${NID}/ventas/${docTemporal}-v?updateMask.fieldPaths=vendedorId`, tokens.vend1, {
    fields: { vendedorId: campo(VEND1) },
  });
  comprobar("Vendedor NO registra ventas nuevas", ventaNueva.status, 403);

  const ficha = await peticion("PATCH", `/negocios/${NID}/vendedores/${VEND1}?updateMask.fieldPaths=accesoActivo`, tokens.vend1, {
    fields: { accesoActivo: campo("true") },
  });
  comprobar("Vendedor NO manipula su propio estado de acceso", ficha.status, 403);

  const negocioDoc = await peticion("GET", `/negocios/${NID}`, tokens.vend1);
  comprobar("Vendedor lee el estado de su negocio (banner de aviso)", negocioDoc.status, 200);
}

console.log("\n--- Root ---");
{
  const clientes = await peticion("GET", `/negocios/${NID}/clientes`, tokens.root);
  comprobar("Root sigue viendo todo", clientes.status, 200);

  const admins = await peticion("GET", "/admins", tokens.root);
  comprobar("Root sigue listando administradores", admins.status, 200);

  const desbloqueo = await peticion("PATCH", `/admins/${ADMIN}?updateMask.fieldPaths=accesoActivo`, tokens.root, {
    fields: { accesoActivo: campo("true") },
  });
  comprobar("Root puede desbloquear al administrador", desbloqueo.status, 200);
}

// =====================================================================
// RESTAURAR
// =====================================================================
console.log("\n=== RESTAURANDO EL ESTADO ORIGINAL ===\n");
await perfilAdmin.set({ accesoActivo: original.accesoActivo !== false }, { merge: true });
await db.collection("negocios").doc(NID).set({ suspendido: false }, { merge: true });
await db.collection("negocios").doc(NID).collection("clientes").doc(docTemporal).delete().catch(() => {});
await db.collection("negocios").doc(NID).collection("ventas").doc(`${docTemporal}-v`).delete().catch(() => {});

{
  const ventas = await consultar("ventas", tokens.admin);
  const ventasVend = await consultar("ventas", tokens.vend1, ["vendedorId", VEND1]);
  comprobar("Admin vuelve a ver las ventas", ventas.status, 200, `(${ventas.docs} ventas)`);
  comprobar("Vendedor vuelve a ver su historial", ventasVend.status, 200, `(${ventasVend.docs} ventas)`);
}

console.log(`\n${fallos === 0 ? "🎉" : "⚠️"} ${ok} correctos, ${fallos} fallidos`);
if (fallos > 0) process.exit(1);
