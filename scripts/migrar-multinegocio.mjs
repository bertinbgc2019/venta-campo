// ============================================================
// MIGRACIÓN MULTI-NEGOCIO
//
// Qué hace:
//   1. Empareja cada cuenta de Firebase Authentication con su perfil.
//   2. Crea los perfiles faltantes:
//        admins/{uid}                 (administradores)
//        vendedores/{uid}             (espejo, para login por UID)
//        negocios/{adminUid}/vendedores/{uid}
//   3. Mueve los datos existentes a negocios/{adminUid}/...
//        productos, clientes, ventas, nominas
//   4. NO borra nada del origen (las colecciones viejas quedan intactas
//      como respaldo; puedes borrarlas luego desde la consola).
//   5. NO toca contraseñas ni cuentas de Authentication.
//
// Uso:
//   node scripts/migrar-multinegocio.mjs            (simulación, no escribe)
//   node scripts/migrar-multinegocio.mjs --ejecutar (aplica los cambios)
// ============================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = 'ventas-campo-92a4c';
const CLAVE = 'ventas-campo-92a4c-firebase-adminsdk-fbsvc-1f54aa407d.json';
const EJECUTAR = process.argv.includes('--ejecutar');

initializeApp({
  credential: cert(JSON.parse(readFileSync(resolve(process.cwd(), CLAVE), 'utf8'))),
  projectId: PROJECT_ID
});

const db = getFirestore();
const auth = getAuth();

// ---------------------------------------------
// 1. PLAN DE MIGRACIÓN (según lo confirmado)
// ---------------------------------------------
// Cada entrada: correo de Auth -> qué perfil crear
const PLAN = {
  'root@ventas.com':      { rol: 'root' },
  'leo26@ventas.campo':   { rol: 'admin',  negocio: 'PASALE',  nombre: 'LEONILA RAMIREZ' },
  'luis26@ventas.campo':  { rol: 'vendedor', negocio: 'PASALE', nombre: 'Luis 26',  adminEmail: 'leo26@ventas.campo' },
  'carlos@ventas.campo':  { rol: 'vendedor', negocio: 'PASALE', nombre: 'Carlos',   adminEmail: 'leo26@ventas.campo' },
  'carlopez@ventas.campo':{ rol: 'vendedor', negocio: 'PASALE', nombre: 'Carlos López', adminEmail: 'leo26@ventas.campo' }
  // admin@ventas.com, vendedor@ventas.com, carlopez@ventas.com:
  // quedan SIN perfil (no podrán entrar hasta que se registren).
};

// Vendedores cuyo vendedorId en los datos es un ID viejo y hay que reasignar.
// El cliente "Miscelánea El Sol" y "Abarrotes Don Pepe" y la venta 501 estaban
// ligados a "vendedor_1" (demo). Los asignamos al administrador del negocio
// para que no se pierdan; luego el admin puede reasignarlos a un vendedor real.
const REASIGNAR_DEMO_AL_ADMIN = true;

const sep = (t) => console.log('\n' + '='.repeat(62) + '\n' + t + '\n' + '='.repeat(62));

async function main() {
  sep(EJECUTAR ? 'MODO REAL: SE ESCRIBIRÁN LOS CAMBIOS' : 'SIMULACIÓN: no se escribe nada (usa --ejecutar)');

  // ---- Leer cuentas de Authentication ----
  const listaAuth = await auth.listUsers(1000);
  const porEmail = new Map(listaAuth.users.map(u => [(u.email || '').toLowerCase(), u]));
  console.log(`Cuentas en Authentication: ${listaAuth.users.length}`);

  // ---- Resolver los perfiles a crear ----
  const perfiles = [];      // { email, uid, rol, negocio, ... }
  const sinPerfil = [];

  for (const [email, cfg] of Object.entries(PLAN)) {
    const u = porEmail.get(email);
    if (!u) { sinPerfil.push(email + ' (no existe en Auth)'); continue; }
    perfiles.push({ email, uid: u.uid, displayName: u.displayName, ...cfg });
  }
  for (const u of listaAuth.users) {
    const em = (u.email || '').toLowerCase();
    if (!PLAN[em]) sinPerfil.push(em);
  }

  const admins = perfiles.filter(p => p.rol === 'admin');
  const vendedores = perfiles.filter(p => p.rol === 'vendedor');
  const roots = perfiles.filter(p => p.rol === 'root');

  // Mapa adminEmail -> uid del admin (para ligar vendedores a su negocio)
  const uidDeAdmin = new Map(admins.map(a => [a.email, a.uid]));

  sep('PERFILES A CREAR');
  for (const p of perfiles) {
    if (p.rol === 'admin') {
      console.log(`  ADMIN     ${p.email}`);
      console.log(`            uid (negocioId): ${p.uid}`);
      console.log(`            negocio: ${p.negocio}   nombre: ${p.nombre}`);
    } else if (p.rol === 'vendedor') {
      const nid = uidDeAdmin.get(p.adminEmail);
      console.log(`  VENDEDOR  ${p.email}`);
      console.log(`            uid: ${p.uid}   negocioId: ${nid || '???'}`);
    } else {
      console.log(`  ROOT      ${p.email}   uid: ${p.uid}`);
    }
  }
  if (sinPerfil.length) {
    sep('CUENTAS SIN PERFIL (no podrán entrar)');
    sinPerfil.forEach(e => console.log('  - ' + e));
  }

  // ---- Datos actuales ----
  const COLS = ['productos', 'clientes', 'ventas', 'nominas'];
  const datos = {};
  for (const col of COLS) {
    datos[col] = (await db.collection(col).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // ---- Escribir perfiles ----
  let escritos = 0;
  const escribir = async (ruta, datosDoc) => {
    if (!EJECUTAR) return;
    const partes = ruta.split('/');
    await db.doc(partes.join('/')).set({ ...datosDoc, migradoEl: FieldValue.serverTimestamp() }, { merge: true });
  };

  sep('PASO 1: PERFILES');
  for (const p of perfiles) {
    if (p.rol === 'root') {
      console.log(`  Root: no requiere documento de perfil (se identifica por correo).`);
      continue;
    }
    if (p.rol === 'admin') {
      const doc = {
        id: p.uid, authUid: p.uid, rol: 'admin',
        nombre: p.nombre, nombreCompleto: p.nombre,
        usuario: p.email, email: p.email,
        negocio: p.negocio, negocioId: p.uid,
        adminId: p.uid, adminAuthUid: p.uid, adminEmail: p.email,
        accesoActivo: true, diaPagoMensual: 1,
        fechaUltimoPago: new Date().toISOString().slice(0, 10),
        migrado: true
      };
      await escribir(`admins/${p.uid}`, doc);
      console.log(`  ✅ admins/${p.uid}  (${p.email} -> ${p.negocio})`);
      escritos++;
    } else {
      const nid = uidDeAdmin.get(p.adminEmail);
      if (!nid) { console.log(`  ⚠️ ${p.email}: no se encontró su administrador ${p.adminEmail}. OMITIDO.`); continue; }
      const doc = {
        id: p.uid, authUid: p.uid, rol: 'vendedor',
        nombre: p.nombre, nombreCompleto: p.nombre,
        usuario: p.email.split('@')[0], email: p.email,
        negocio: p.negocio, negocioId: nid,
        adminId: nid, adminAuthUid: nid, adminEmail: p.adminEmail,
        accesoActivo: true, migrado: true
      };
      await escribir(`vendedores/${p.uid}`, doc);                    // espejo (login por UID)
      await escribir(`negocios/${nid}/vendedores/${p.uid}`, doc);     // miembro del negocio
      console.log(`  ✅ vendedores/${p.uid} + negocios/${nid}/vendedores/${p.uid}  (${p.email})`);
      escritos += 2;
    }
  }

  // ---- Mover datos a cada negocio ----
  sep('PASO 2: DATOS -> negocios/{negocioId}/...');

  // Resolver negocioId de un documento según su adminId/adminEmail viejo
  const adminViejoAUid = (doc) => {
    // 1. Por correo del administrador (es el dato más confiable)
    const em = (doc.adminEmail || '').toLowerCase();
    if (uidDeAdmin.has(em)) return uidDeAdmin.get(em);
    // 2. Si adminId ya es un UID de un admin conocido
    const adm = admins.find(a => a.uid === String(doc.adminId));
    if (adm) return adm.uid;
    // 3. Datos de demostración (adm_1) -> al admin principal
    if (admins.length === 1 && String(doc.adminId || '') === 'adm_1') return admins[0].uid;
    return null;
  };

  let movidos = 0, sinDestino = 0;
  for (const col of COLS) {
    console.log(`\n  -- ${col} (${datos[col].length} documentos) --`);
    for (const item of datos[col]) {
      const nid = adminViejoAUid(item);
      if (!nid) {
        console.log(`     ⚠️ ${col}/${item.id}: sin negocio identificable (adminId=${item.adminId}). OMITIDO.`);
        sinDestino++;
        continue;
      }
      const patch = {};
      // Reasignar datos demo "vendedor_1" al administrador del negocio
      if (REASIGNAR_DEMO_AL_ADMIN && String(item.vendedorId || '') === 'vendedor_1') {
        patch.vendedorId = nid;
        patch.vendedorNombre = 'Asignado por migración (antes demo)';
      } else if (String(item.vendedorId || '') === 'vendedor_1') {
        patch.vendedorId = nid;
      }
      // Corregir vendedorId que sea un ID viejo "vend_..." -> UID real por correo/nombre
      if (item.vendedorEmail) {
        const u = porEmail.get(String(item.vendedorEmail).toLowerCase());
        if (u) patch.vendedorId = u.uid;
      }

      const destino = `negocios/${nid}/${col}/${item.id}`;
      if (EJECUTAR) {
        await db.doc(destino).set({ ...item, ...patch, negocioId: nid, migrado: true }, { merge: true });
      }
      const nota = Object.keys(patch).length ? ` (ajuste: ${JSON.stringify(patch)})` : '';
      console.log(`     ✅ ${destino}${nota}`);
      movidos++;
    }
  }

  sep('RESUMEN');
  console.log(`  Perfiles escritos:        ${escritos}`);
  console.log(`  Documentos de datos:      ${movidos} movidos, ${sinDestino} omitidos`);
  console.log(`  Modo:                     ${EJECUTAR ? 'REAL (aplicado)' : 'SIMULACIÓN (nada escrito)'}`);
  if (!EJECUTAR) {
    console.log('\n  Para aplicar de verdad, ejecuta:');
    console.log('    node scripts/migrar-multinegocio.mjs --ejecutar');
  } else {
    console.log('\n  ✅ Migración completada.');
    console.log('    Las colecciones antiguas (productos, clientes, ventas) NO se borraron:');
    console.log('    quedan como respaldo. Puedes eliminarlas desde la consola de Firebase.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('\n❌ ERROR:', e); process.exit(1); });
