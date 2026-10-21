import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { GoogleAuth } from "google-auth-library";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const db = getFirestore(); const auth = getAuth();

console.log("=== 1. REGLAS ACTIVAS EN PRODUCCION ===");
const gauth = new GoogleAuth({ credentials: clave, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = await gauth.getClient();
const token = (await client.getAccessToken()).token;
const H = { Authorization: `Bearer ${token}` };
const rel = await (await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, { headers: H })).json();
const rs = await (await fetch(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`, { headers: H })).json();
const contenido = (rs.source?.files || []).map(f => f.content).join("\n");
console.log("Breve vistazo:");
console.log(contenido.split("\n").slice(0, 12).join("\n"));
console.log("... ¿menciona 'negocios'? " + contenido.includes("negocios"));
console.log("... ¿es 'if true'? " + contenido.includes("if true"));

console.log("\n=== 2. PERFILES EN FIRESTORE ===");
for (const col of ["admins","vendedores","usuarios"]) {
  const s = await db.collection(col).get();
  console.log(`\n${col}: ${s.size} docs`);
  s.docs.forEach(d => { const x = d.data(); console.log(`   ${d.id} | usuario=${x.usuario} email=${x.email} rol=${x.rol} acceso=${x.accesoActivo} negocio=${x.negocio||"-"}`); });
}

console.log("\n=== 3. CUENTAS EN AUTHENTICATION (con estado) ===");
const u = (await auth.listUsers(1000)).users;
u.forEach(x => console.log(`   ${x.email} | uid=${x.uid} | disabled=${x.disabled} | providers=${x.providerData.map(p=>p.providerId).join(",")||"NINGUNO"}`));

console.log("\n=== 4. NEGOCIOS ===");
for (const col of await db.listCollections()) console.log(`   ${col.id}`);
const neg = await db.collection("negocios").get();
console.log(`negocios: ${neg.size}`);
for (const n of neg.docs) {
  console.log(`   negocio ${n.id}`);
  for (const sub of await db.collection("negocios").doc(n.id).listCollections()) {
    const s = await sub.get(); console.log(`      ${sub.id}: ${s.size}`);
  }
}
