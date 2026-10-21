// Despliega firestore.rules al proyecto de Firebase.
//
// Uso:  node scripts/desplegar-reglas.mjs
//
// El CLI de Firebase no se puede usar con la cuenta de servicio porque
// pide permisos de serviceusage (403). Por eso el despliegue se hace
// directo contra la API de Firebase Rules:
//   1) POST  /v1/projects/{p}/rulesets        -> crea el ruleset
//   2) PATCH /v1/projects/{p}/releases/cloud.firestore -> lo activa
//
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.FIREBASE_PROJECT || "ventas-campo-92a4c";
const ARCHIVO = resolve(process.cwd(), "firestore.rules");

const credenciales = JSON.parse(
  readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8")
);

const gauth = new GoogleAuth({
  credentials: credenciales,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const cliente = await gauth.getClient();
const token = (await cliente.getAccessToken()).token;
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const contenido = readFileSync(ARCHIVO, "utf8");
console.log(`Archivo: ${ARCHIVO} (${contenido.split("\n").length} lineas)`);

// --- 1. Crear el ruleset -------------------------------------------------
const resRuleset = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: contenido }] } }),
});
const ruleset = await resRuleset.json();
if (!resRuleset.ok) {
  console.error("Error creando ruleset:", resRuleset.status, JSON.stringify(ruleset, null, 2));
  process.exit(1);
}
console.log(`Ruleset creado: ${ruleset.name}`);

// --- 2. Activarlo (update del release) -----------------------------------
const nombreRelease = `projects/${PROJECT}/releases/cloud.firestore`;
const resRelease = await fetch(`https://firebaserules.googleapis.com/v1/${nombreRelease}`, {
  method: "PATCH",
  headers: H,
  body: JSON.stringify({
    release: { name: nombreRelease, rulesetName: ruleset.name },
    updateMask: "rulesetName",
  }),
});
const release = await resRelease.json();
if (!resRelease.ok) {
  console.error("Error activando el release:", resRelease.status, JSON.stringify(release, null, 2));
  process.exit(1);
}
console.log(`Release actualizado -> ${release.rulesetName}`);
console.log(`   updateTime: ${release.updateTime}`);

// --- 3. Verificar ---------------------------------------------------------
const resVerif = await fetch(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`, { headers: H });
const verif = await resVerif.json();
const activo = (verif.source?.files || []).map((f) => f.content).join("\n");
console.log("\n--- Reglas activas (verificacion) ---");
console.log(activo);
console.log("\nOK: reglas desplegadas en", PROJECT);
