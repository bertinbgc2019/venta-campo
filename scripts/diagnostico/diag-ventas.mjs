import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"))), projectId: "ventas-campo-92a4c" });
const db = getFirestore();
const NID = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";

function normalizarGPS(valor) {
  const crudo = String(valor == null ? "" : valor).trim();
  if (!crudo) return "Sin GPS";
  const partes = crudo.split(",").map(x => parseFloat(String(x).trim()));
  if (partes.length < 2 || isNaN(partes[0]) || isNaN(partes[1])) return "Sin GPS";
  if (partes[0] < -90 || partes[0] > 90 || partes[1] < -180 || partes[1] > 180) return "Sin GPS";
  return partes[0].toFixed(5) + ", " + partes[1].toFixed(5);
}

const snap = await db.collection("negocios").doc(NID).collection("clientes").get();
let corregidos = 0;
for (const d of snap.docs) {
  const gps = d.data().gps;
  const nuevo = normalizarGPS(gps);
  if (nuevo !== gps) {
    await d.ref.set({ gps: nuevo }, { merge: true });
    console.log("Corregido:", d.data().nombre, "|", JSON.stringify(gps), "->", JSON.stringify(nuevo));
    corregidos++;
  }
}
console.log(corregidos === 0 ? "No habia valores GPS corruptos" : ("Clientes corregidos: " + corregidos));
const check = await db.collection("negocios").doc(NID).collection("clientes").get();
for (const d of check.docs) console.log("  -", d.data().nombre, "| gps:", JSON.stringify(d.data().gps));
