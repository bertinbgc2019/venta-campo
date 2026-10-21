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
  console.log(`\n=== negocios/${NID}/${col} (${s.size}) ===`);
  s.docs.forEach(d => {
    const x = d.data();
    console.log(`  ${d.id} | vendedorId=${x.vendedorId ?? "-"} | adminId=${x.adminId ?? "-"} | negocio=${x.negocio ?? "-"}`);
  });
}
