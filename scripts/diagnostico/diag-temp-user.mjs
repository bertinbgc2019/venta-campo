import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();
const correo = "prueba-temporal@ventas.campo";
try { await auth.deleteUser(await auth.getUserByEmail(correo).then(u => u.uid)); } catch (_) {}
const u = await auth.createUser({ email: correo, password: "ClaveOriginal123", displayName: "PRUEBA TEMPORAL" });
console.log("Usuario temporal creado:", u.uid);
