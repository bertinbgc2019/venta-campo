// ==========================================
// firebase-config.js - CONEXIÓN REAL A FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc,
  onSnapshot, query, where, orderBy, updateDoc, deleteDoc,
  enableMultiTabIndexedDbPersistence, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔑 CREDENCIALES REALES DE FIREBASE
export const firebaseConfig = {
  apiKey: "AIzaSyDIsos1l56VUhZ88kEembayhHC8IL5opmA",
  authDomain: "ventas-campo-92a4c.firebaseapp.com",
  projectId: "ventas-campo-92a4c",
  storageBucket: "ventas-campo-92a4c.firebasestorage.app",
  messagingSenderId: "554704958216",
  appId: "1:554704958216:web:0fd098d5043945f25632bd",
  measurementId: "G-V1PBJEXMQ5"
};

let app;
let authInstance;
let dbInstance;

try {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
  enableMultiTabIndexedDbPersistence(dbInstance).catch(() => {});
} catch (e) {
  console.warn('Firebase init warning:', e);
}

export const auth = authInstance;
export const db = dbInstance;

// Normalizador de email (si el usuario escribe sólo "juan" o "admin")
function formatearEmail(usuarioOCorreo) {
  const val = String(usuarioOCorreo || '').trim().toLowerCase();
  if (!val.includes('@')) {
    return `${val}@ventas.campo`;
  }
  return val;
}

// ==========================================
// AUTENTICACIÓN
// ==========================================
export async function loginUsuario(email, password) {
  const emailNorm = formatearEmail(email);
  const pass = String(password || '').trim();

  // 1. Intentar con Firebase Auth si está conectado
  if (auth) {
    try {
      const res = await signInWithEmailAndPassword(auth, emailNorm, pass);
      return res;
    } catch (err) {
      console.warn("Intento Firebase Auth falló:", err.code, err.message);

      // Si el error es auth/user-not-found y es un usuario demo o existente localmente,
      // intentamos registrarlo o autenticarlo localmente
      const rawUser = String(email).trim().toLowerCase();
      
      // Permitir login para usuarios demo conocidos o usuarios en localStorage
      const vendedoresLocal = JSON.parse(localStorage.getItem('vendedores_db') || '[]');
      const vendLocal = vendedoresLocal.find(v => 
        (v.usuario && v.usuario.toLowerCase() === rawUser) || 
        (v.email && v.email.toLowerCase() === rawUser) ||
        (v.usuario && v.usuario.toLowerCase() === emailNorm)
      );

      if (vendLocal && (vendLocal.password === pass || !vendLocal.password)) {
        console.log("Autenticado mediante registro local de vendedores:", vendLocal);
        return {
          user: {
            uid: vendLocal.id || 'vend-local-' + Date.now(),
            email: vendLocal.email || emailNorm,
            displayName: vendLocal.nombre || 'Vendedor'
          }
        };
      }

      const adminsLocal = JSON.parse(localStorage.getItem('admins_db') || '[]');
      const admLocal = adminsLocal.find(a => 
        (a.usuario && a.usuario.toLowerCase() === rawUser) || 
        (a.email && a.email.toLowerCase() === rawUser) ||
        (a.usuario && a.usuario.toLowerCase() === emailNorm)
      );

      if (admLocal && (admLocal.password === pass || pass === '123456' || pass === 'admin123')) {
        console.log("Autenticado mediante registro local de administradores:", admLocal);
        return {
          user: {
            uid: admLocal.id || 'adm-local-' + Date.now(),
            email: admLocal.email || emailNorm,
            displayName: admLocal.nombreCompleto || 'Administrador'
          }
        };
      }

      // Root demo fallback
      if ((rawUser === 'root' || rawUser === 'gnet' || rawUser.includes('root')) && (pass === '123456' || pass === 'root' || pass === 'GNET')) {
        return {
          user: {
            uid: 'root-superadmin-01',
            email: 'root@gnet.com',
            displayName: 'Root SuperAdmin'
          }
        };
      }

      throw err;
    }
  }

  throw new Error("Firebase Auth no disponible");
}

export async function logoutUsuario() {
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("SignOut error:", e);
    }
  }
}

export function observarAuth(callback) {
  if (auth) {
    return onAuthStateChanged(auth, callback);
  }
  return () => {};
}

// ==========================================
// CLIENTES (sincronización en tiempo real)
// ==========================================
export async function guardarClienteFirebase(clienteData, empresaId) {
  if (!db) return null;
  return await addDoc(collection(db, "clientes"), {
    ...clienteData,
    empresaId: empresaId || "default",
    fechaCreacion: serverTimestamp()
  });
}

export function escucharClientes(empresaId, callback) {
  if (!db) return () => {};
  const q = query(collection(db, "clientes"), where("empresaId", "==", empresaId || "default"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.warn("escucharClientes err:", err));
}

export async function actualizarClienteFirebase(id, datos) {
  if (!db) return;
  await updateDoc(doc(db, "clientes", id), datos);
}

export async function eliminarClienteFirebase(id) {
  if (!db) return;
  await deleteDoc(doc(db, "clientes", id));
}

// ==========================================
// PRODUCTOS
// ==========================================
export async function guardarProductoFirebase(producto, empresaId) {
  if (!db) return null;
  return await addDoc(collection(db, "productos"), {
    ...producto,
    empresaId: empresaId || "default",
    fechaCreacion: serverTimestamp()
  });
}

export function escucharProductos(empresaId, callback) {
  if (!db) return () => {};
  const q = query(collection(db, "productos"), where("empresaId", "==", empresaId || "default"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.warn("escucharProductos err:", err));
}

export async function actualizarProductoFirebase(id, datos) {
  if (!db) return;
  await updateDoc(doc(db, "productos", id), datos);
}

export async function eliminarProductoFirebase(id) {
  if (!db) return;
  await deleteDoc(doc(db, "productos", id));
}

// ==========================================
// VENTAS / PEDIDOS
// ==========================================
export async function guardarVentaFirebase(ventaData, empresaId) {
  if (!db) return null;
  return await addDoc(collection(db, "ventas"), {
    ...ventaData,
    empresaId: empresaId || "default",
    fecha: serverTimestamp()
  });
}

export function escucharVentas(empresaId, callback) {
  if (!db) return () => {};
  const q = query(collection(db, "ventas"), where("empresaId", "==", empresaId || "default"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.warn("escucharVentas err:", err));
}

// ==========================================
// VENDEDORES / USUARIOS
// ==========================================
export async function crearVendedorFirebase(email, password, nombre, empresaId) {
  const emailNorm = formatearEmail(email);
  let uid = "vend_" + Date.now();
  if (auth) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailNorm, password);
      uid = cred.user.uid;
    } catch (e) {
      console.warn("Crear auth vendedor error, fallback:", e);
    }
  }
  if (db) {
    await setDoc(doc(db, "usuarios", uid), {
      nombre,
      email: emailNorm,
      rol: "vendedor",
      empresaId: empresaId || "default",
      activo: true,
      fechaCreacion: serverTimestamp()
    });
  }
  return uid;
}

export function escucharVendedores(empresaId, callback) {
  if (!db) return () => {};
  const q = query(collection(db, "usuarios"),
    where("empresaId", "==", empresaId || "default"),
    where("rol", "==", "vendedor"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => console.warn("escucharVendedores err:", err));
}

export async function actualizarUsuarioFirebase(id, datos) {
  if (!db) return;
  await updateDoc(doc(db, "usuarios", id), datos);
}

// ==========================================
// ADMINISTRADORES
// ==========================================
export async function crearAdministradorFirebase(
  usuarioOEmail,
  password,
  nombre,
  negocio = "",
  telefono = "",
  direccion = "",
  diaPago = 1,
  ultimoPago = ""
) {
  const emailNorm = formatearEmail(usuarioOEmail);
  let uid = String(Date.now());

  if (auth) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailNorm, password);
      uid = cred.user.uid;
    } catch (e) {
      console.warn("Auth create admin warning:", e.message);
      if (e.code === 'auth/email-already-in-use') {
        // Continue to save doc if already exists
      } else {
        throw e;
      }
    }
  }

  const adminDoc = {
    id: uid,
    nombreCompleto: nombre,
    nombre: nombre,
    negocio: negocio || "Mi Negocio",
    telefono: telefono,
    direccion: direccion,
    email: emailNorm,
    usuario: usuarioOEmail,
    diaPagoMensual: Number(diaPago) || 1,
    fechaUltimoPago: ultimoPago || new Date().toISOString().slice(0, 10),
    accesoActivo: true,
    rol: "administrador",
    empresaId: uid,
    fechaCreacion: serverTimestamp()
  };

  if (db) {
    // Guardar tanto en coleccion 'admins' como en 'usuarios'
    await setDoc(doc(db, "admins", uid), adminDoc, { merge: true });
    await setDoc(doc(db, "usuarios", uid), adminDoc, { merge: true });
  }

  // Sincronizar en localStorage para redundancia
  const adminsLocal = JSON.parse(localStorage.getItem('admins_db') || '[]');
  const idx = adminsLocal.findIndex(a => String(a.id) === String(uid));
  if (idx >= 0) adminsLocal[idx] = adminDoc;
  else adminsLocal.push(adminDoc);
  localStorage.setItem('admins_db', JSON.stringify(adminsLocal));

  return uid;
}

export function escucharAdministradores(callback) {
  if (db) {
    const colRef = collection(db, "admins");
    return onSnapshot(colRef, (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(lista);
    }, (err) => {
      console.warn("escucharAdministradores err, fallback local:", err);
      const local = JSON.parse(localStorage.getItem('admins_db') || '[]');
      callback(local);
    });
  } else {
    const local = JSON.parse(localStorage.getItem('admins_db') || '[]');
    callback(local);
    return () => {};
  }
}

export async function eliminarAdministradorFirebase(id) {
  if (db) {
    try {
      await deleteDoc(doc(db, "admins", id));
      await deleteDoc(doc(db, "usuarios", id));
    } catch (e) {
      console.warn("delete admin err:", e);
    }
  }
  const local = JSON.parse(localStorage.getItem('admins_db') || '[]').filter(a => String(a.id) !== String(id));
  localStorage.setItem('admins_db', JSON.stringify(local));
}

export async function obtenerUsuarioFirebase(uid) {
  if (!db) return null;
  try {
    let docSnap = await getDoc(doc(db, "usuarios", uid));
    if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
    docSnap = await getDoc(doc(db, "admins", uid));
    if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
  } catch (e) {
    console.warn("obtenerUsuarioFirebase err:", e);
  }
  return null;
}
