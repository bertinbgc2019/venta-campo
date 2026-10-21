import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();
try {
  const u = await auth.getUserByEmail("prueba-temporal@ventas.campo");
  await auth.deleteUser(u.uid);
  console.log("Usuario temporal eliminado:", u.uid);
} catch (e) { console.log("Nada que limpiar:", e.message); }
const res = await auth.listUsers(200);
console.log("\nCuentas restantes en Auth:", res.users.length);
res.users.forEach(u => console.log("  -", u.email));
