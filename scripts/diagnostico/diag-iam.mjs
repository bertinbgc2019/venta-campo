import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROJECT = "ventas-campo-92a4c";
const SA = "firebase-adminsdk-fbsvc@" + PROJECT + ".iam.gserviceaccount.com";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
const gauth = new GoogleAuth({ credentials: clave, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = await gauth.getClient();
const token = (await client.getAccessToken()).token;
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function get(url, opts) {
  try {
    const r = await fetch(url, { headers: H, ...opts });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch (_) { j = { _raw: t.substring(0, 200) }; }
    return { status: r.status, j };
  } catch (e) { return { status: 0, j: { err: e.message } }; }
}

let r = await get(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SA}:getIamPolicy`);
console.log("=== IAM de la cuenta de servicio ===", r.status);
if (r.j.bindings) r.j.bindings.forEach(b => console.log("   " + b.role + " -> " + (b.members||[]).join(", ")));
else console.log(JSON.stringify(r.j).substring(0, 300));

r = await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, { method: "POST", body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) });
console.log("\n=== IAM del proyecto ===", r.status);
if (r.j.bindings) r.j.bindings.filter(b => (b.members||[]).some(m => m.includes("firebase-adminsdk-fbsvc"))).forEach(b => console.log("   " + b.role));
else console.log(JSON.stringify(r.j).substring(0, 400));
