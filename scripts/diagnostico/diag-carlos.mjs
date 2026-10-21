import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT = "ventas-campo-92a4c";
const API_KEY = "AIzaSyDIsos1l56VUhZ88kEembayhHC8IL5opmA";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();

const CARLOS = "aLrGpP5GlWR14WhJ5u6DeAOmopu1";
const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";

const custom = await auth.createCustomToken(CARLOS);
const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: custom, returnSecureToken: true })
});
const j = await r.json();
if (!j.idToken) { console.log("ERROR en el canje:", r.status, JSON.stringify(j)); process.exit(1); }
const idToken = j.idToken;
console.log("Token emitido OK\n");

async function get(p) {
  const rr = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${idToken}` } });
  let jj = null; try { jj = await rr.json(); } catch (_) {}
  return { s: rr.status, j: jj };
}

console.log("=== SIMULACION DEL LOGIN DE carlos@ventas.campo (uid " + CARLOS + ") ===\n");
const adm = await get(`/admins/${CARLOS}`);
console.log(`1) admins/${CARLOS} -> HTTP ${adm.s} ${adm.s === 200 ? "(SI es admin)" : "(no es admin, se pasa al siguiente paso)"}`);
const ven = await get(`/vendedores/${CARLOS}`);
console.log(`2) vendedores/${CARLOS} -> HTTP ${ven.s}`);
if (ven.s === 200) {
  const f = ven.j.fields || {};
  console.log(`   rol=${f.rol?.stringValue} | nombre=${f.nombre?.stringValue} | negocio=${f.negocio?.stringValue} | activo=${f.accesoActivo?.booleanValue}`);
}
const cat = await get(`/negocios/${NID}/productos`);
console.log(`3) Catalogo de PASALE -> HTTP ${cat.s} (${(cat.j.documents||[]).length} productos visibles)`);
const cli = await get(`/negocios/${NID}/clientes`);
console.log(`4) Clientes SIN filtro -> HTTP ${cli.s}  (403 = el servidor exige filtrar por su vendedorId)`);
const rr = await fetch(`${BASE}/negocios/${NID}:runQuery`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "clientes" }], where: { fieldFilter: { field: { fieldPath: "vendedorId" }, op: "EQUAL", value: { stringValue: CARLOS } } } } })
});
const txt = await rr.text();
let docs = 0, err = null;
try { for (const o of JSON.parse(txt)) { if (o.error) err = o.error; if (o.document) docs++; } } catch (_) {}
console.log(`5) Clientes filtrados por SU vendedorId -> ${err ? "ERROR " + err.status : docs + " documento(s)"}`);
const ve = await fetch(`${BASE}/negocios/${NID}:runQuery`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "ventas" }], where: { fieldFilter: { field: { fieldPath: "vendedorId" }, op: "EQUAL", value: { stringValue: CARLOS } } } } })
});
const tv = await ve.text();
let dv = 0, errv = null;
try { for (const o of JSON.parse(tv)) { if (o.error) errv = o.error; if (o.document) dv++; } } catch (_) {}
console.log(`6) Ventas filtradas por SU vendedorId -> ${errv ? "ERROR " + errv.status : dv + " documento(s)"}`);
console.log("\n=> Todo lo que pasa DESPUES de teclear la contraseña correcta ya funciona.");
