import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT = "ventas-campo-92a4c";
const API_KEY = "AIzaSyDIsos1l56VUhZ88kEembayhHC8IL5opmA";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";
const VEND1 = "nMzELg1shjOVSLqndRDGp6VIAF93";
const VEND2 = "aLrGpP5GlWR14WhJ5u6DeAOmopu1";

const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();
const custom = await auth.createCustomToken(VEND1);
console.log("custom token (recortado):", custom.slice(0, 40), "...");
const r0 = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({token: custom, returnSecureToken: true})});
const j0 = await r0.json();
console.log("exchange status:", r0.status, "keys:", Object.keys(j0));
if (!j0.idToken) { console.log(JSON.stringify(j0)); process.exit(1); }
const idToken = j0.idToken;

async function probar(nombre, body) {
  const r = await fetch(`${BASE}/negocios/${NID}:runQuery`, { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${idToken}`}, body: JSON.stringify(body) });
  const t = await r.text();
  console.log(`\n### ${nombre}  (HTTP ${r.status})`);
  console.log(t.substring(0, 600));
}

const parent = `projects/${PROJECT}/databases/(default)/documents/negocios/${NID}`;
await probar("sin filtro", { structuredQuery: { from: [{ parent, collectionId: "clientes" }] } });
await probar("filtro VEND1", { structuredQuery: { from: [{ parent, collectionId: "clientes" }], where: { fieldFilter: { field: { fieldPath: "vendedorId" }, op: "EQUAL", value: { stringValue: VEND1 } } } } });
await probar("filtro VEND2", { structuredQuery: { from: [{ parent, collectionId: "clientes" }], where: { fieldFilter: { field: { fieldPath: "vendedorId" }, op: "EQUAL", value: { stringValue: VEND2 } } } } });
