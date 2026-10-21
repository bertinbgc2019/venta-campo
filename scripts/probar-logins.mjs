// Prueba REAL de inicio de sesión, igual que lo hace la app:
//
//   1) Firebase Auth  ->  accounts:signInWithPassword  (identidad real)
//   2) Firestore      ->  lee admins/{uid} y vendedores/{uid}
//   3) Si el rol es admin, comprueba que puede listar TODO su negocio
//      Si el rol es vendedor, comprueba que lee el catalogo y SOLO lo suyo
//
// Uso:  node scripts/probar-logins.mjs <correo> <clave> [<correo> <clave> ...]
//
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT = process.env.FIREBASE_PROJECT || "ventas-campo-92a4c";
const API_KEY = "AIzaSyDIsos1l56VUhZ88kEembayhHC8IL5opmA";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.error("Uso: node scripts/probar-logins.mjs <correo> <clave> [<correo> <clave> ...]");
  process.exit(1);
}

const pares = [];
for (let i = 0; i < args.length; i += 2) pares.push([args[i].trim().toLowerCase(), args[i + 1]]);

async function signIn(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) {
    const codigo = (j.error && j.error.message) || "ERROR";
    throw new Error(codigo.replace("EMAIL_NOT_FOUND", "ese correo no existe")
      .replace("INVALID_PASSWORD", "contraseña incorrecta")
      .replace("INVALID_LOGIN_CREDENTIALS", "correo o contraseña incorrectos")
      .replace("USER_DISABLED", "cuenta deshabilitada")
      .replace("TOO_MANY_ATTEMPTS_TRY_LATER", "demasiados intentos, espera un momento"));
  }
  return j;
}

async function leer(path, idToken) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  let j = null;
  try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}

let fallos = 0;
for (const [email, password] of pares) {
  console.log(`\n${"=".repeat(60)}\nCUENTA: ${email}`);
  let sesion;
  try {
    sesion = await signIn(email, password);
    console.log(`✅ 1) Firebase Auth: acceso concedido (uid ${sesion.localId})`);
  } catch (e) {
    console.log(`❌ 1) Firebase Auth: ${e.message}`);
    fallos++;
    continue;
  }
  const uid = sesion.localId;
  const token = sesion.idToken;

  const adm = await leer(`/admins/${uid}`, token);
  const vend = await leer(`/vendedores/${uid}`, token);

  let rol = null;
  if (adm.status === 200 && adm.body) {
    rol = "admin";
    console.log(`✅ 2) Perfil admin leído (negocio: ${adm.body.fields?.negocio?.stringValue || "?"})`);
  } else if (vend.status === 200 && vend.body) {
    rol = "vendedor";
    console.log(`✅ 2) Perfil vendedor leído (${vend.body.fields?.nombre?.stringValue || "?"})`);
  } else {
    console.log(`❌ 2) Perfil NO encontrado en admins/ ni en vendedores/ -> "usuario no está registrado"`);
    fallos++;
    continue;
  }

  // 3) Comprobacion de datos segun el rol
  const clientes = await leer(`/negocios/${uid}/clientes`, token);
  const catalogo = await leer(`/negocios/${uid}/productos`, token);
  const ventas = await leer(`/negocios/${uid}/ventas`, token);

  if (rol === "admin") {
    const ok = clientes.status === 200 && catalogo.status === 200 && ventas.status === 200;
    console.log(`${ok ? "✅" : "❌"} 3) Admin ve todo su negocio (clientes ${clientes.status}, catálogo ${catalogo.status}, ventas ${ventas.status})`);
    if (!ok) fallos++;
  } else {
    // El vendedor NO puede listar clientes sin filtro: debe filtrar por su UID.
    const filtrado = await fetch(`${BASE}/negocios/${uid}:runQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "clientes" }],
          where: { fieldFilter: { field: { fieldPath: "vendedorId" }, op: "EQUAL", value: { stringValue: uid } } },
        },
      }),
    });
    const ok = catalogo.status === 200 && clientes.status === 403 && filtrado.status === 200;
    console.log(`${ok ? "✅" : "❌"} 3) Vendedor: catálogo ${catalogo.status}, sin filtro ${clientes.status} (debe ser 403), con filtro ${filtrado.status}`);
    if (!ok) fallos++;
  }
}

console.log(`\n${fallos === 0 ? "🎉 Todos los accesos funcionan." : `⚠️ ${fallos} prueba(s) fallida(s).`}`);
if (fallos > 0) process.exit(1);
