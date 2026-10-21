import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: "ventas-campo-92a4c" });
const db = getFirestore();
const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";
const snap = await db.collection("negocios").doc(NID).collection("clientes").get();
console.log("CLIENTES:", snap.docs.length);
for (const d of snap.docs) {
  const x = d.data();
  console.log(" ", d.id, "|", x.nombre, "| vendedorId:", x.vendedorId, "| creado:", x.creadoEn || x.fecha || "");
}
const sv = await db.collection("negocios").doc(NID).collection("ventas").get();
console.log("\nVENTAS:", sv.docs.length);
for (const d of sv.docs) {
  const x = d.data();
  console.log(" ", d.id, "| cliente:", x.clienteNombre, "| vendedorId:", x.vendedorId, "| total:", x.total);
}
