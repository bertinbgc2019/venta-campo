import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const c = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(c), projectId: "ventas-campo-92a4c" });
const db = getFirestore();
console.log("=== COLECCIONES RAIZ ===");
for (const col of await db.listCollections()) { const s = await col.get(); console.log(`  ${col.id}: ${s.size}`); }
const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";
console.log("\n=== NEGOCIO PASALE (" + NID + ") ===");
for (const col of await db.collection("negocios").doc(NID).listCollections()) {
  const s = await col.get();
  console.log(`  negocios/${NID}/${col.id}: ${s.size} docs`);
  s.docs.forEach(d => { const x=d.data(); console.log(`     ${d.id} | usuario=${x.usuario||"-"} | vendedorId=${x.vendedorId||"-"} | desc=${x.descripcion||x.nombre||"-"}`); });
}
console.log("\n=== PERFILES ===");
const a = await db.collection("admins").get(); console.log(`admins: ${a.size}`);
a.docs.forEach(d=>{const x=d.data();console.log(`  ${d.id} | ${x.email} | ${x.negocio}`)});
const v = await db.collection("vendedores").get(); console.log(`vendedores: ${v.size}`);
v.docs.forEach(d=>{const x=d.data();console.log(`  ${d.id} | ${x.email} | negocioId=${x.negocioId}`)});
