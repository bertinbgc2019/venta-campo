import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
const gauth = new GoogleAuth({ credentials: clave, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = await gauth.getClient();
const token = (await client.getAccessToken()).token;
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const rel = await (await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, { headers: H })).json();
const target = rel.rulesetName;

console.log("PATCH release -> " + target);
const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, {
  method: "PATCH", headers: H, body: JSON.stringify({ rulesetName: target })
});
console.log("status:", r.status);
console.log(await r.text());
