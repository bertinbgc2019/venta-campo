import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"))), projectId: "ventas-campo-92a4c" });
const auth = getAuth();
const PROJECT = "ventas-campo-92a4c";
const API_KEY = "AIzaSyDIsos1l56VUhZ88kEembayhHC8IL5opmA";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ROOT = "NH1Ny0Uhdvdcv5rgou7aMS8ohS02";
const ADM = "0pzdWIPLKRNgQbpoQ1bh58c3aju2";
const NID = ADM;
async function idToken(uid, claims) {
  const ct = (await auth.createCustomToken(uid, claims || {})).toString();
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ct, returnSecureToken: true })
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("No idToken: " + JSON.stringify(j).slice(0, 200));
  return j.idToken;
}
async function rest(method, path, tok, body) {
  const r = await fetch(BASE + path, { method, headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const full = await r.text();
  let json = null;
  try { json = JSON.parse(full); } catch (_) {}
  return { status: r.status, json, msg: json && json.error ? json.error.message : full.slice(0, 160) };
}
const boolField = (name, v) => ({ fields: { [name]: { booleanValue: v } } });

const tokRoot = await idToken(ROOT, { root: true });
const tokAdm = await idToken(ADM, {});

const r1 = await rest("PATCH", `/admins/${ADM}?updateMask.fieldPaths=accesoActivo`, tokRoot, boolField("accesoActivo", false));
console.log("1) Root bloquea al admin            ->", r1.status, r1.status < 300 ? "✅ OK" : "❌ " + r1.msg);

const r2 = await rest("GET", `/admins/${ADM}`, tokAdm);
const leido = r2.json && r2.json.fields && r2.json.fields.accesoActivo ? r2.json.fields.accesoActivo.booleanValue : null;
console.log("2) Admin lee su perfil              ->", r2.status, "| accesoActivo:", leido, leido === false ? "✅ la app lo rechazará" : "❌");

const r3 = await rest("PATCH", `/admins/${ADM}?updateMask.fieldPaths=accesoActivo`, tokAdm, boolField("accesoActivo", true));
console.log("3) Admin intenta desbloquearse      ->", r3.status, r3.status < 300 ? "❌ FALLO: se desbloqueó" : "✅ BLOQUEADO: " + r3.msg.slice(0, 90));

const r4 = await rest("PATCH", `/negocios/{NID}?updateMask.fieldPaths=suspendido`.replace("{NID}", NID), tokRoot, boolField("suspendido", true));
console.log("4) Root marca negocio suspendido     ->", r4.status, r4.status < 300 ? "✅ OK" : "❌ " + r4.msg);

const r5 = await rest("PATCH", `/negocios/${NID}?updateMask.fieldPaths=suspendido`, tokAdm, boolField("suspendido", false));
console.log("5) Admin intenta limpiar el flag    ->", r5.status, r5.status < 300 ? "❌ FALLO: pudo limpiarlo" : "✅ BLOQUEADO");

const r6 = await rest("GET", `/negocios/${NID}/ventas`, tokAdm);
console.log("6) Admin lee historial de ventas     ->", r6.status, r6.status < 300 ? "❌ FALLO: aún lee" : "✅ BLOQUEADO");

await rest("PATCH", `/admins/${ADM}?updateMask.fieldPaths=accesoActivo`, tokRoot, boolField("accesoActivo", true));
await rest("PATCH", `/negocios/${NID}?updateMask.fieldPaths=suspendido`, tokRoot, boolField("suspendido", false));
console.log("\nEstado restaurado.");
