import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROJECT = "ventas-campo-92a4c";
const clave = JSON.parse(readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8"));
const gauth = new GoogleAuth({ credentials: clave, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = await gauth.getClient();
const token = (await client.getAccessToken()).token;
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// 1) Ver los proyectos que puede ver
const p = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`, { headers: H });
const pj = await p.json();
console.log("projectId:", pj.projectId, "| name:", pj.name);

// 2) Intentar actualizar el release directamente
const rel = await (await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`, { headers: H })).json();
console.log("release actual:", rel.name, "->", rel.rulesetName, "| createTime:", rel.createTime, "| updateTime:", rel.updateTime);

const rs2 = await (await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`, { headers: H })).json();
console.log("rulesets existentes:", (rs2.rulesets||[]).map(r => r.name.split("/").pop() + " (" + r.createTime + ")").join(", "));
