import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

const adminIds = new Set((await db.collection("admins").get()).docs.map(d => d.id));
const vendIds = new Set((await db.collection("vendedores").get()).docs.map(d => d.id));

const res = await auth.listUsers(200);
let n = 0;
for (const u of res.users) {
  n++;
  const perfil = adminIds.has(u.uid) ? "ADMIN" : vendIds.has(u.uid) ? "VENDEDOR" : "SIN PERFIL (no puede entrar)";
  console.log(`${String(n).padStart(2)}. ${u.email.padEnd(26)} uid=${u.uid} claims=${JSON.stringify(u.customClaims||{})} ${perfil}`);
}
console.log("\nTotal cuentas Auth:", n);
