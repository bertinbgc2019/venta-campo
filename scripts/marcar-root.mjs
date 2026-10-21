// Marca la cuenta de Root con el claim personalizado "root": true.
//
// Las reglas de Firestore reconocen a Root por este claim, que es mucho
// mas robusto que comparar el correo (depende del claim "email", que
// puede venir vacio si se activa la privacidad de correo de Firebase).
//
// Uso:  node scripts/marcar-root.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT = process.env.FIREBASE_PROJECT || "ventas-campo-92a4c";
const EMAIL_ROOT = "root@ventas.com";

const clave = JSON.parse(
  readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8")
);
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();

const usuario = await auth.getUserByEmail(EMAIL_ROOT);
console.log(`Root: ${usuario.email} (uid ${usuario.uid})`);

await auth.setCustomUserClaims(usuario.uid, { root: true });
console.log("Claim 'root: true' asignado correctamente.");

const verificado = await auth.getUser(usuario.uid);
console.log("Claims actuales:", JSON.stringify(verificado.customClaims));
console.log("\nNota: la sesion de Root debe volver a iniciarse para tomar el nuevo claim.");
