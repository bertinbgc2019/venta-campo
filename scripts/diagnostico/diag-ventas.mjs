import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: "ventas-campo-92a4c" });
const db = getFirestore();
const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";
const v = await db.collection("negocios").doc(NID).collection("ventas").get();
console.log("ventas:", v.size);
for (const d of v.docs) {
  const f = d.data();
  console.log(" -", d.id, "|", f.clienteNombre || "(mostrador)", "| total", f.totalVenta, "| vendedor", f.vendedorId);
}
console.log("\nclientes por vendedor:");
const c = await db.collection("negocios").doc(NID).collection("clientes").get();
for (const d of c.docs) console.log(" -", d.id, "|", d.data().nombre, "| vendedorId", d.data().vendedorId);
