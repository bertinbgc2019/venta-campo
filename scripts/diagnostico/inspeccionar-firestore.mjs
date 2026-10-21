// ============================================================
// SCRIPT DE INSPECCIÓN (solo lectura)
// Muestra qué hay actualmente en Firestore para planear la migración.
// Uso: node scripts/inspeccionar-firestore.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = 'ventas-campo-92a4c';
const CLAVE = process.argv[2] || 'ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json';
const credencial = JSON.parse(readFileSync(resolve(process.cwd(), CLAVE), 'utf8'));

initializeApp({ credential: cert(credencial), projectId: PROJECT_ID });

const db = getFirestore();
const auth = getAuth();

function linea(t) { console.log('\n' + '='.repeat(60) + '\n' + t + '\n' + '='.repeat(60)); }

async function main() {
  linea('1. USUARIOS EN FIREBASE AUTHENTICATION');
  try {
    const lista = await auth.listUsers(1000);
    console.log(`Total: ${lista.users.length}`);
    lista.users.forEach(u => {
      console.log(`  UID: ${u.uid}`);
      console.log(`    email: ${u.email}`);
      console.log(`    displayName: ${u.displayName}`);
    });
  } catch (e) {
    console.error('Error leyendo Authentication:', e.message);
  }

  for (const col of ['admins', 'vendedores', 'usuarios']) {
    linea(`2. COLECCIÓN: ${col}`);
    try {
      const snap = await db.collection(col).get();
      console.log(`Documentos: ${snap.size}`);
      snap.docs.forEach(d => {
        const x = d.data();
        console.log(`  doc.id: ${d.id}`);
        console.log(`    usuario: ${x.usuario}  | email: ${x.email}`);
        console.log(`    nombre: ${x.nombreCompleto || x.nombre}  | rol: ${x.rol}`);
        console.log(`    authUid: ${x.authUid || '(sin authUid)'}`);
        console.log(`    adminId: ${x.adminId || '-'}  | negocio: ${x.negocio || '-'}`);
        console.log(`    accesoActivo: ${x.accesoActivo}`);
      });
    } catch (e) {
      console.error(`Error leyendo ${col}:`, e.message);
    }
  }

  for (const col of ['productos', 'clientes', 'ventas', 'nominas']) {
    linea(`3. COLECCIÓN DE DATOS: ${col}`);
    try {
      const snap = await db.collection(col).get();
      console.log(`Documentos: ${snap.size}`);
      const porAdmin = {};
      snap.docs.forEach(d => {
        const x = d.data();
        const k = x.adminId || '(sin adminId)';
        porAdmin[k] = (porAdmin[k] || 0) + 1;
      });
      Object.entries(porAdmin).forEach(([k, n]) => console.log(`  adminId ${k}: ${n} documentos`));
      // Muestra un ejemplo
      if (snap.size > 0) {
        console.log('  --- Ejemplo del primer documento ---');
        console.log('  ' + JSON.stringify(snap.docs[0].data(), null, 2).split('\n').join('\n  '));
      }
    } catch (e) {
      console.error(`Error leyendo ${col}:`, e.message);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
