import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();

console.log("=== Proveedores / config de Identity Toolkit ===");
const proj = await auth.projectConfigManager().getProjectConfig();
console.log("  authorizedDomains: " + (proj.authorizedDomains || []).join(", "));
console.log("  smsRegion: " + (proj.smsRegionConfig ? "definido" : "-"));

console.log("\n=== Metadatos de proveedor anonimo ===");
try {
  const { GoogleAuth } = await import("google-auth-library");
  const gauth = new GoogleAuth({ credentials: clave, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await gauth.getClient();
  const token = (await client.getAccessToken()).token;
  const r = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  console.log(JSON.stringify(j, null, 2));
} catch (e) { console.log("  error: " + e.message); }
