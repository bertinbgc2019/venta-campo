import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const db = getFirestore();
const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";

for (const col of ["productos","clientes","ventas","vendedores"]) {
  const s = await db.collection("negocios").doc(NID).collection(col).get();
  console.log(`negocios/${NID}/${col}: ${s.size} docs`);
}
const v = await db.collection("negocios").doc(NID).collection("vendedores").doc("nMzELg1shjOVSLqndRDGp6VIAF93").get();
console.log("\nficha luis26 (integridad):");
console.log(JSON.stringify(v.data(), null, 2));
console.log("\nraiz: admins=" + (await db.collection("admins").get()).size + " vendedores=" + (await db.collection("vendedores").get()).size);
