// Establece (o restablece) la contraseña REAL de Firebase Authentication
// de un usuario existente, SIN cambiar su UID, su correo ni sus datos.
//
// Por que existe: desde el navegador un administrador NO puede cambiar la
// contraseña de otro usuario (Firebase Auth no lo permite). La app antes
// escribia la contraseña en un campo de Firestore, lo que NO cambiaba la
// contraseña real: el usuario seguía sin poder entrar.
//
// Uso:
//   node scripts/establecer-clave.mjs <correo> <nueva-clave>
//   node scripts/establecer-clave.mjs <correo> <nueva-clave> --sin-copia
//
// El UID, el correo, el DisplayName, el negocio y todos sus datos
// (productos, clientes, ventas, nóminas) se conservan intactos.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT = process.env.FIREBASE_PROJECT || "ventas-campo-92a4c";

const [correo, nuevaClave, ...flags] = process.argv.slice(2);
if (!correo || !nuevaClave) {
  console.error("Uso: node scripts/establecer-clave.mjs <correo> <nueva-clave>");
  process.exit(1);
}
if (nuevaClave.length < 6) {
  console.error("La contraseña debe tener al menos 6 caracteres.");
  process.exit(1);
}
const guardarCopia = !flags.includes("--sin-copia");

const clave = JSON.parse(
  readFileSync(resolve(process.cwd(), "ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json"), "utf8")
);
initializeApp({ credential: cert(clave), projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();

const email = correo.trim().toLowerCase();
const usuario = await auth.getUserByEmail(email);

console.log(`Usuario:  ${usuario.email}`);
console.log(`UID:      ${usuario.uid}   (NO cambia)`);
console.log(`Negocio:  ${usuario.displayName || "(sin nombre)"}`);

// --- 1. Contraseña real de Firebase Auth ---------------------------------
await auth.updateUser(usuario.uid, { password: nuevaClave });
console.log(`\n✅ Contraseña de Firebase Auth actualizada.`);

// --- 2. Copia de referencia en el perfil (para el modo sin conexión) -----
if (guardarCopia) {
  const refinancing = [];
  try {
    const espejo = await db.collection("vendedores").doc(usuario.uid).get();
    if (espejo.exists) {
      await espejo.ref.set({ password: nuevaClave }, { merge: true });
      refinancing.push("vendedores/" + usuario.uid);
    }
  } catch (e) { console.warn("Espejo:", e.message); }

  try {
    const adm = await db.collection("admins").doc(usuario.uid).get();
    if (adm.exists) {
      await adm.ref.set({ password: nuevaClave }, { merge: true });
      refinancing.push("admins/" + usuario.uid);
    }
  } catch (e) { console.warn("Admin:", e.message); }

  try {
    const neg = await db.collection("negocios").doc(usuario.uid).collection("vendedores").doc(usuario.uid).get();
    if (neg.exists) {
      await neg.ref.set({ password: nuevaClave }, { merge: true });
      refinancing.push(`negocios/${usuario.uid}/vendedores/${usuario.uid}`);
    }
  } catch (e) { console.warn("Negocio:", e.message); }

  console.log(`📄 Copia de referencia actualizada en: ${refinancing.join(", ") || "(ninguno)"}`);
}

console.log(`\nEl usuario ya puede entrar con: ${email} / ${nuevaClave}`);
