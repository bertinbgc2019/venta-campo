// Genera un custom token de Firebase Auth para un usuario (para simular una
// sesión real en el navegador sin conocer la contraseña).
// Uso:  node scripts/diagnostico/token-usuario.mjs <uid>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const uid = process.argv[2] || "0pzdWIPLKRNgQbpoQ1bh58c3aju2";
const claims = process.argv[3] ? JSON.parse(process.argv[3]) : {};

const clave = JSON.parse(
  readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8")
);
initializeApp({ credential: cert(clave), projectId: "ventas-campo-92a4c" });
const auth = getAuth();

const token = await auth.createCustomToken(uid, claims);
console.log(token.toString());
