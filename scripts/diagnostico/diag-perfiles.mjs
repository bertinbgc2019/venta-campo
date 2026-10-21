import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const db = getFirestore();

const s = await db.collection("admins").get();
for (const d of s.docs) {
  console.log("=== admins/" + d.id + " ===");
  console.log(JSON.stringify(d.data(), null, 2));
}
console.log("");
const v = await db.collection("vendedores").get();
for (const d of v.docs) {
  console.log("=== vendedores/" + d.id + " ===");
  console.log(JSON.stringify(d.data(), null, 2));
}
