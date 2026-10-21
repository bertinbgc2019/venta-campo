import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const db = getFirestore();

console.log("=== ROOT: colecciones de primer nivel ===");
for (const c of await db.listCollections()) console.log("   " + c.id);

console.log("\n=== subcolecciones de negocios/<uid> (buscando docs) ===");
const negSnap = await db.collection("negocios").get();
console.log("docs directos en negocios: " + negSnap.size);
const raizNeg = db.collection("negocios");
// listar todos los docs conocidos de negocios aunque estén vacíos no es posible via get si están vacíos;
// forzamos conocidos:
for (const id of ["0pzdWIPLKRNgQbpoQ1bh58c3aju2"]) {
  console.log("negocio " + id + ":");
  for (const sub of await db.collection("negocios").doc(id).listCollections()) {
    const s = await sub.get();
    console.log("   " + sub.id + ": " + s.size);
  }
}

console.log("\n=== ROOT: raiz productos/clientes/ventas ===");
for (const col of ["productos","clientes","ventas"]) {
  const s = await db.collection(col).get();
  console.log(col + ": " + s.size);
  s.docs.slice(0,8).forEach(d => {
    const x = d.data();
    console.log("   " + d.id + " | adminId=" + (x.adminId||"-") + " | negocio=" + (x.negocio||"-") + " | vendedorId=" + (x.vendedorId||"-"));
  });
}
