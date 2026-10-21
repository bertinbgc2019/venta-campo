// Prueba automatizada del aislamiento multi-negocio contra el ruleset
// desplegado, usando la API de pruebas de Firebase Rules.
//
// Uso:  node scripts/probar-reglas.mjs
//
// Cada caso simula una peticion real (get / list / create / update / delete)
// con un usuario concreto y verifica si el servidor la permite o la deniega.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.FIREBASE_PROJECT || "ventas-campo-92a4c";
const DB = "/databases/(default)/documents";

const credenciales = JSON.parse(
  readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8")
);
const gauth = new GoogleAuth({ credentials: credenciales, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const cliente = await gauth.getClient();
const token = (await cliente.getAccessToken()).token;
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// --- Identidades reales del proyecto -------------------------------------
const ROOT = { uid: "NH1Ny0Uhdvdcv5rgou7aMS8ohS02", email: "root@ventas.com" };
const ADMIN = { uid: "0pzdWIPLKRNgQbpoQ1bh58c3aju2", email: "leo26@ventas.campo" }; // negocio PASALE
const VEND1 = { uid: "nMzELg1shjOVSLqndRDGp6VIAF93", email: "luis26@ventas.campo" };
const VEND2 = { uid: "aLrGpP5GlWR14WhJ5u6DeAOmopu1", email: "carlos@ventas.campo" };
const NID = ADMIN.uid; // negocioId = UID del administrador

// --- Datos reales de ejemplo (tomados de la base) ------------------------
const PRODUCTO = { descripcion: "Refresco 600ml", precioVenta: 18, adminId: "adm_1792000480366" };
const CLIENTE_OTRO = { nombre: "Cliente de Carlos", vendedorId: VEND2.uid, adminId: "adm_1" };
const CLIENTE_MIO = { nombre: "Cliente de Luis", vendedorId: VEND1.uid };

const casos = [
  // ---------- ROOT ----------
  { n: "Root lista administradores", m: "list", p: `${DB}/admins`, u: ROOT, e: "ALLOW" },
  { n: "Root lista vendedores", m: "list", p: `${DB}/vendedores`, u: ROOT, e: "ALLOW" },
  { n: "Root lista catalogo de un negocio", m: "list", p: `${DB}/negocios/${NID}/productos`, u: ROOT, e: "ALLOW" },
  { n: "Root lee datos legacy en la raiz", m: "list", p: `${DB}/ventas`, u: ROOT, e: "ALLOW" },

  // ---------- ADMINISTRADOR ----------
  { n: "Admin lee su propio perfil", m: "get", p: `${DB}/admins/${ADMIN.uid}`, u: ADMIN, e: "ALLOW" },
  { n: "Admin lista TODOS los clientes de su negocio", m: "list", p: `${DB}/negocios/${NID}/clientes`, u: ADMIN, e: "ALLOW" },
  { n: "Admin lista todas las ventas de su negocio", m: "list", p: `${DB}/negocios/${NID}/ventas`, u: ADMIN, e: "ALLOW" },
  { n: "Admin lista su catalogo", m: "list", p: `${DB}/negocios/${NID}/productos`, u: ADMIN, e: "ALLOW" },
  { n: "Admin lista las nominas de su negocio", m: "list", p: `${DB}/negocios/${NID}/nominas`, u: ADMIN, e: "ALLOW" },
  { n: "Admin lista a sus vendedores", m: "list", p: `${DB}/negocios/${NID}/vendedores`, u: ADMIN, e: "ALLOW" },
  { n: "Admin crea un producto en su negocio", m: "create", p: `${DB}/negocios/${NID}/productos/nuevo`, u: ADMIN, e: "ALLOW", res: PRODUCTO },
  { n: "Admin crea un cliente en su negocio", m: "create", p: `${DB}/negocios/${NID}/clientes/nuevo`, u: ADMIN, e: "ALLOW", res: CLIENTE_MIO },
  { n: "Admin NO puede leer el perfil de otro admin", m: "get", p: `${DB}/admins/OTRO_UID`, u: ADMIN, e: "DENY" },
  { n: "Admin NO puede listar datos de otro negocio", m: "list", p: `${DB}/negocios/OTRO_NEGOCIO/clientes`, u: ADMIN, e: "DENY" },

  // ---------- VENDEDOR ----------
  { n: "Vendedor lee su propio perfil (espejo)", m: "get", p: `${DB}/vendedores/${VEND1.uid}`, u: VEND1, e: "ALLOW" },
  { n: "Vendedor lee el catalogo de SU negocio", m: "list", p: `${DB}/negocios/${NID}/productos`, u: VEND1, e: "ALLOW" },
  { n: "Vendedor NO puede escribir el catalogo", m: "create", p: `${DB}/negocios/${NID}/productos/pirata`, u: VEND1, e: "DENY", res: PRODUCTO },
  { n: "Vendedor NO puede listar clientes de otro negocio", m: "list", p: `${DB}/negocios/OTRO_NEGOCIO/clientes`, u: VEND1, e: "DENY" },
  { n: "Vendedor NO puede listar todos los clientes de su negocio", m: "list", p: `${DB}/negocios/${NID}/clientes`, u: VEND1, e: "DENY" },
  { n: "Vendedor lee SOLO sus clientes (con filtro vendedorId)", m: "list", p: `${DB}/negocios/${NID}/clientes`, u: VEND1, e: "ALLOW", where: ["vendedorId", "==", VEND1.uid] },
  { n: "Vendedor NO puede leer un cliente de otro vendedor", m: "get", p: `${DB}/negocios/${NID}/clientes/1792004425590`, u: VEND1, e: "DENY" },
  { n: "Vendedor SI puede leer un cliente propio", m: "get", p: `${DB}/negocios/${NID}/clientes/1`, u: VEND1, e: "ALLOW" },
  { n: "Vendedor crea su propia venta", m: "create", p: `${DB}/negocios/${NID}/ventas/999`, u: VEND1, e: "ALLOW", res: { totalVenta: 100, vendedorId: VEND1.uid } },
  { n: "Vendedor NO puede crear una venta a nombre de otro", m: "create", p: `${DB}/negocios/${NID}/ventas/1000`, u: VEND1, e: "DENY", res: { totalVenta: 100, vendedorId: VEND2.uid } },
  { n: "Vendedor NO puede borrar", m: "delete", p: `${DB}/negocios/${NID}/ventas/1791923546936`, u: VEND1, e: "DENY" },
  { n: "Vendedor NO puede leer el perfil de un administrador", m: "get", p: `${DB}/admins/${ADMIN.uid}`, u: VEND1, e: "DENY" },
  { n: "Vendedor NO puede listar el directorio global de vendedores", m: "list", p: `${DB}/vendedores`, u: VEND1, e: "DENY" },

  // ---------- SIN AUTENTICAR ----------
  { n: "Anonimo no lee el catalogo", m: "list", p: `${DB}/negocios/${NID}/productos`, u: null, e: "DENY" },
  { n: "Anonimo no lee administradores", m: "list", p: `${DB}/admins`, u: null, e: "DENY" },
];

const testCases = casos.map((c) => {
  const req = { method: c.m, path: c.p };
  if (c.u) req.auth = { uid: c.u.uid, token: { email: c.u.email, ...(c.u === ROOT ? { root: true } : {}) } };
  if (c.where) req.where = { field: c.where[0], op: c.where[1], value: c.where[2] };
  if (c.res) req.resource = c.res;
  return { request: req, expectation: c.e, expressionReportLevel: "NONE" };
});

// Con --fuente se prueba el archivo local (sin desplegar todavia).
// Sin el argumento se prueba el ruleset que esta ACTIVO en produccion.
const usarFuente = process.argv.includes("--fuente");
const cuerpo = { testSuite: { testCases } };
if (usarFuente) {
  cuerpo.source = { files: [{ name: "firestore.rules", content: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") }] };
  console.log("Probando el archivo LOCAL firestore.rules (sin desplegar)\n");
} else {
  console.log("Probando el ruleset ACTIVO en produccion\n");
}

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(cuerpo),
});
const salida = await res.json();

if (!res.ok) {
  console.error("Error al ejecutar las pruebas:", res.status);
  console.error(JSON.stringify(salida, null, 2));
  process.exit(1);
}

const resultados = salida.testResults || [];
let ok = 0;
let fallos = 0;
for (let i = 0; i < casos.length; i++) {
  const r = resultados[i] || {};
  const esperado = casos[i].e;
  const obtenido = r.result === "ALLOW" ? "ALLOW" : r.result === "DENY" ? "DENY" : (r.error ? "ERROR" : "?");
  const bien = obtenido === esperado;
  if (bien) ok++;
  else fallos++;
  console.log(`${bien ? "✅" : "❌"} ${casos[i].n}  [esperado ${esperado}, obtenido ${obtenido}]`);
  if (!bien && r.error) console.log(`     error: ${r.error.message || JSON.stringify(r.error)}`);
}
console.log(`\n${ok} correctos, ${fallos} fallidos (de ${casos.length})`);
if (fallos > 0) process.exit(1);
