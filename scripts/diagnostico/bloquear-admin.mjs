// Bloquea o desbloquea a un administrador como lo hace el Root desde la app.
// Uso:  node scripts/diagnostico/bloquear-admin.mjs bloquear
//        node scripts/diagnostico/bloquear-admin.mjs desbloquear
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const accion = (process.argv[2] || "bloquear").toLowerCase();
const ADM = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";   // leo26@ventas.campo (PASALE)
const NID = ADM;

const clave = JSON.parse(
  readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8")
);
initializeApp({ credential: cert(clave), projectId: "ventas-campo-92a4c" });
const db = getFirestore();

const bloquear = accion !== "desbloquear";

await db.collection("admins").doc(ADM).set({ accesoActivo: !bloquear }, { merge: true });
await db.collection("negocios").doc(NID).set({ suspendido: bloquear }, { merge: true });

const adm = await db.collection("admins").doc(ADM).get();
const neg = await db.collection("negocios").doc(NID).get();
console.log(
  (bloquear ? "🔒 BLOQUEADO" : "🔓 DESBLOQUEADO") +
  " | admins/" + ADM + ".accesoActivo = " + adm.data().accesoActivo +
  " | negocios/" + NID + ".suspendido = " + neg.data().suspendido
);
