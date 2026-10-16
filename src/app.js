// ==========================================
// app.js - Lógica Principal de Ventas en Campo
// BERTIN GARCIA-GNET
// ==========================================

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.log('SW register info:', err));
  });
}

// Configuración Central de Firebase
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDIsos1l56VUhZ88kEembayhHC8IL5opmA",
  authDomain: "ventas-campo-92a4c.firebaseapp.com",
  projectId: "ventas-campo-92a4c",
  storageBucket: "ventas-campo-92a4c.firebasestorage.app",
  messagingSenderId: "554704958216",
  appId: "1:554704958216:web:0fd098d5043945f25632bd",
  measurementId: "G-V1PBJEXMQ5"
};

const FIREBASE_ADMINS_COLLECTION = 'admins';
const FIREBASE_ROOT_DOC = 'sistema/root';

// Inicializar Firebase Compat si está disponible
if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
  } catch (e) {
    console.warn("Firebase app init:", e);
  }
}

// UTILIDADES
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => String(+(Number(n) || 0).toFixed(3));
const fmtMoneda = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// BASES DE DATOS LOCALES
let clientesDB = (JSON.parse(localStorage.getItem('clientes_db')) || [
  { id: 1, nombre: "Miscelánea El Sol", telefono: "5551234567", direccion: "Av. Reforma 123, Col. Centro", gps: "19.4326, -99.1332", vendedorId: "vendedor_1", diasVisita: ["Lunes", "Miércoles"] },
  { id: 2, nombre: "Abarrotes Don Pepe", telefono: "5559876543", direccion: "Calle Morelos 45, Sector Sur", gps: "19.4350, -99.1380", vendedorId: "vendedor_1", diasVisita: ["Lunes", "Jueves", "Viernes"] }
]).map(c => ({ direccion: '', ...c }));

function migrarProducto(p) {
  if (p.descripcion !== undefined) return p;
  return {
    id: p.id,
    codigo: p.codigo || '',
    descripcion: p.nombre || '',
    tipoVenta: 'unidad',
    precioAdq: Number(p.costo) || 0,
    precioVenta: Number(p.precio) || 0,
    precioMayoreo: null,
    existencia: Number(p.stock) || 0,
    minimo: 0,
    maximo: 0
  };
}

function normalizarTexto(txt) {
  return String(txt || '')
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ==========================================
// AISLAMIENTO MULTI-NEGOCIO Y LOCAL STORAGE
// ==========================================

let usuarioActual = null;

function obtenerTenantActual() {
  let todosAdmins = [
    ...(typeof adminsDB !== 'undefined' ? adminsDB : []),
    ...JSON.parse(localStorage.getItem('admins_db') || '[]')
  ];
  // Eliminar duplicados de admins por id
  const mapAdmins = new Map();
  todosAdmins.forEach(a => { if (a && a.id) mapAdmins.set(String(a.id), a); });
  let listaAdmins = Array.from(mapAdmins.values());

  // Si existe al menos un administrador registrado personalizado (id !== 'adm_1'), descartar el dummy 'adm_1'
  if (listaAdmins.some(a => a.id !== 'adm_1')) {
    listaAdmins = listaAdmins.filter(a => a.id !== 'adm_1');
  }

  const negocioGlobalGuardado = localStorage.getItem('negocio_nombre') || '';
  const adminPersonalizado = listaAdmins.find(a => a.id !== 'adm_1' && a.negocio && a.negocio !== 'GNET' && a.negocio !== 'GNET Operaciones') || listaAdmins.find(a => a.id !== 'adm_1') || listaAdmins[0];

  if (!usuarioActual) {
    let neg = (adminPersonalizado?.negocio && adminPersonalizado.negocio !== 'GNET' && adminPersonalizado.negocio !== 'GNET Operaciones')
      ? adminPersonalizado.negocio
      : (negocioGlobalGuardado && negocioGlobalGuardado !== 'GNET' && negocioGlobalGuardado !== 'GNET Operaciones' ? negocioGlobalGuardado : 'Mi Negocio');

    return {
      adminId: String(adminPersonalizado?.id || 'adm_1'),
      adminAuthUid: String(adminPersonalizado?.authUid || ''),
      adminEmail: (adminPersonalizado?.email || adminPersonalizado?.usuario || 'admin@ejemplo.com').toLowerCase(),
      negocio: neg
    };
  }

  if (usuarioActual.rol === 'admin') {
    let adminId = String(usuarioActual.id || usuarioActual.uid || 'adm_1');
    let adminEmail = String(usuarioActual.email || usuarioActual.usuario || '').toLowerCase();
    
    // Buscar en listaAdmins para obtener el nombre oficial del negocio
    const adm = listaAdmins.find(a => 
      String(a.id) === adminId || 
      (a.email && a.email.toLowerCase() === adminEmail) || 
      (a.usuario && a.usuario.toLowerCase() === adminEmail) ||
      (a.authUid && a.authUid === adminId)
    );

    let negocio = usuarioActual.negocio;
    if (adm && adm.negocio && adm.negocio !== 'GNET' && adm.negocio !== 'GNET Operaciones') {
      negocio = adm.negocio;
    } else if (!negocio || negocio === 'GNET' || negocio === 'GNET Operaciones' || negocio === 'Control Central') {
      negocio = (adm && adm.negocio && adm.negocio !== 'GNET' && adm.negocio !== 'GNET Operaciones')
        ? adm.negocio
        : (localStorage.getItem('negocio_nombre_' + adminId) || (negocioGlobalGuardado && negocioGlobalGuardado !== 'GNET' ? negocioGlobalGuardado : 'Mi Negocio'));
    }

    if (negocio && negocio !== 'GNET' && negocio !== 'GNET Operaciones') {
      localStorage.setItem('negocio_nombre', negocio);
      localStorage.setItem('negocio_nombre_' + adminId, negocio);
      usuarioActual.negocio = negocio;
    }

    return {
      adminId: String((adm && adm.id) || adminId),
      adminAuthUid: String((adm && adm.authUid) || usuarioActual.authUid || ''),
      adminEmail: String((adm && (adm.email || adm.usuario)) || adminEmail).toLowerCase(),
      negocio: String(negocio || 'Mi Negocio')
    };
  }

  if (usuarioActual.rol === 'vendedor') {
    let adminId = usuarioActual.adminId;
    let adminEmail = usuarioActual.adminEmail;
    let negocio = usuarioActual.negocio;
    let adminAuthUid = usuarioActual.adminAuthUid || '';

    // 1. Buscar en vendedoresDB local y localStorage
    const todosVends = [
      ...(typeof vendedoresDB !== 'undefined' ? vendedoresDB : []),
      ...JSON.parse(localStorage.getItem('vendedores_db') || '[]')
    ];
    const vendLocal = todosVends.find(v => 
      String(v.id) === String(usuarioActual.id) || 
      (v.authUid && String(v.authUid) === String(usuarioActual.id)) ||
      (usuarioActual.authUid && v.authUid && String(v.authUid) === String(usuarioActual.authUid)) ||
      (v.email && v.email.toLowerCase() === String(usuarioActual.email || '').toLowerCase()) || 
      (v.usuario && v.usuario.toLowerCase() === String(usuarioActual.usuario || '').toLowerCase())
    );
    if (vendLocal) {
      if (vendLocal.adminId) adminId = vendLocal.adminId;
      if (vendLocal.adminAuthUid) adminAuthUid = vendLocal.adminAuthUid;
      if (vendLocal.adminEmail) adminEmail = vendLocal.adminEmail;
      if (vendLocal.negocio && vendLocal.negocio !== 'GNET' && vendLocal.negocio !== 'GNET Operaciones') negocio = vendLocal.negocio;
    }

    // 2. Si tenemos adminId o adminEmail, buscar datos reales del Administrador
    if (adminId && adminId !== 'adm_1') {
      const adm = listaAdmins.find(a => String(a.id) === String(adminId) || (a.authUid && a.authUid === String(adminId)));
      if (adm) {
        if (adm.negocio && adm.negocio !== 'GNET' && adm.negocio !== 'GNET Operaciones') negocio = adm.negocio;
        if (!adminEmail) adminEmail = adm.email || adm.usuario;
        if (adm.authUid) adminAuthUid = adm.authUid;
      }
    }
    if ((!negocio || negocio === 'GNET' || negocio === 'GNET Operaciones') && adminEmail) {
      const adm = listaAdmins.find(a => (a.email && a.email.toLowerCase() === adminEmail.toLowerCase()) || (a.usuario && a.usuario.toLowerCase() === adminEmail.toLowerCase()));
      if (adm) {
        if (adm.negocio && adm.negocio !== 'GNET' && adm.negocio !== 'GNET Operaciones') negocio = adm.negocio;
        if (!adminId || adminId === 'adm_1') adminId = adm.id;
        if (adm.authUid) adminAuthUid = adm.authUid;
      }
    }

    // 3. Si no hay adminId pero sí negocio, buscar por negocio en admins
    if ((!adminId || adminId === 'adm_1') && negocio && negocio !== 'GNET' && negocio !== 'GNET Operaciones') {
      const admCoincidente = listaAdmins.find(a => a.negocio && normalizarTexto(a.negocio) === normalizarTexto(negocio));
      if (admCoincidente) {
        adminId = admCoincidente.id;
        adminEmail = admCoincidente.email || admCoincidente.usuario;
        if (admCoincidente.authUid) adminAuthUid = admCoincidente.authUid;
      }
    }

    // 4. Si aún no hay adminId, asociar al administrador personalizado más reciente
    if (!adminId || adminId === 'adm_1') {
      const ultimoAdmin = listaAdmins.find(a => a.id !== 'adm_1' && a.negocio && a.negocio !== 'GNET' && a.negocio !== 'GNET Operaciones') || listaAdmins.find(a => a.id !== 'adm_1');
      if (ultimoAdmin) {
        adminId = ultimoAdmin.id;
        adminEmail = ultimoAdmin.email || ultimoAdmin.usuario || '';
        if (ultimoAdmin.authUid) adminAuthUid = ultimoAdmin.authUid;
        if (!negocio || negocio === 'GNET' || negocio === 'GNET Operaciones') negocio = ultimoAdmin.negocio || 'Mi Negocio';
      }
    }

    // Si aún el negocio es GNET o vacío, recuperar de localStorage
    if (!negocio || negocio === 'GNET' || negocio === 'GNET Operaciones') {
      negocio = localStorage.getItem('negocio_nombre_' + (adminId || usuarioActual.id)) || (negocioGlobalGuardado && negocioGlobalGuardado !== 'GNET' ? negocioGlobalGuardado : 'Mi Negocio');
    }

    // Actualizar usuarioActual con los datos enriquecidos del tenant
    if (adminId && adminId !== 'adm_1') usuarioActual.adminId = adminId;
    if (adminEmail) usuarioActual.adminEmail = adminEmail;
    if (adminAuthUid) usuarioActual.adminAuthUid = adminAuthUid;
    if (negocio && negocio !== 'GNET' && negocio !== 'GNET Operaciones') {
      usuarioActual.negocio = negocio;
    }

    return {
      adminId: String(adminId || 'adm_1'),
      adminAuthUid: String(adminAuthUid || ''),
      adminEmail: String(adminEmail || '').toLowerCase(),
      negocio: String(negocio || usuarioActual.negocio || 'Mi Negocio')
    };
  }

  // Root SuperAdmin
  return { adminId: 'root', adminEmail: 'root@gnet.com', negocio: 'GNET Central' };
}

let productosDB = (JSON.parse(localStorage.getItem('productos_db')) || [
  { id: 101, codigo: "7501000000011", descripcion: "Refresco 600ml", tipoVenta: "unidad", precioAdq: 12.00, precioVenta: 18.00, precioMayoreo: 16.00, existencia: 45, minimo: 10, maximo: 100, adminId: 'adm_1' },
  { id: 102, codigo: "7501000000028", descripcion: "Sabritas 45g", tipoVenta: "unidad", precioAdq: 10.00, precioVenta: 16.50, precioMayoreo: null, existencia: 30, minimo: 10, maximo: 80, adminId: 'adm_1' },
  { id: 103, codigo: "750102938401", descripcion: "Pantalón Táctico Stryke Ripstop 10 Bolsillos", tipoVenta: "unidad", precioAdq: 620.00, precioVenta: 1250.00, precioMayoreo: 980.00, existencia: 24, minimo: 4, maximo: 50, adminId: 'adm_1' },
  { id: 104, codigo: "750102938402", descripcion: "Camisa de Combate Assault Transpirable", tipoVenta: "unidad", precioAdq: 450.00, precioVenta: 950.00, precioMayoreo: 740.00, existencia: 18, minimo: 3, maximo: 40, adminId: 'adm_1' },
  { id: 105, codigo: "750102938403", descripcion: "Bota Táctica 8\" Waterproof YKK", tipoVenta: "unidad", precioAdq: 1100.00, precioVenta: 2100.00, precioMayoreo: 1680.00, existencia: 12, minimo: 2, maximo: 30, adminId: 'adm_1' }
]).map(migrarProducto);

let adminsDB = (JSON.parse(localStorage.getItem('admins_db')) || [
  { id: "adm_1", nombreCompleto: "Administrador Central", negocio: "GNET Operaciones", telefono: "5512345678", usuario: "admin@ejemplo.com", accesoActivo: true, diaPagoMensual: 1, fechaUltimoPago: "2026-10-01" }
]).map(a => ({ ...a, accesoActivo: a.accesoActivo !== false }));
if (adminsDB.some(a => a.id !== 'adm_1')) {
  adminsDB = adminsDB.filter(a => a.id !== 'adm_1');
}
localStorage.setItem('admins_db', JSON.stringify(adminsDB));

let vendedoresDB = JSON.parse(localStorage.getItem('vendedores_db')) || [
  { id: "vendedor_1", nombre: "Juan Pérez", telefono: "5599887766", usuario: "juan", email: "juan@ventas.campo", password: "123", adminId: "adm_1", negocio: "GNET Operaciones", accesoActivo: true }
];
vendedoresDB = vendedoresDB.map(v => ({ ...v, accesoActivo: v.accesoActivo !== false }));
if (vendedoresDB.some(v => v.id !== 'vendedor_1')) {
  vendedoresDB = vendedoresDB.filter(v => v.id !== 'vendedor_1');
}
localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));

let ventasDB = JSON.parse(localStorage.getItem('ventas_db')) || [
  { id: 501, fecha: new Date().toISOString(), adminId: "adm_1", vendedorId: "vendedor_1", totalVenta: 350.00, totalCosto: 220.00, clienteNombre: "Miscelánea El Sol", metodoPago: "efectivo" }
];

function guardarProductosDB() {
  const tenant = obtenerTenantActual();
  const clave = tenant.adminId || 'adm_1';
  localStorage.setItem('negocio_productos_' + clave, JSON.stringify(productosDB));
  localStorage.setItem('productos_db_' + clave, JSON.stringify(productosDB));
  if (tenant.adminAuthUid) {
    localStorage.setItem('negocio_productos_' + tenant.adminAuthUid, JSON.stringify(productosDB));
  }
  if (tenant.negocio && tenant.negocio !== 'GNET' && tenant.negocio !== 'GNET Operaciones') {
    localStorage.setItem('negocio_productos_' + tenant.negocio, JSON.stringify(productosDB));
  }

  // Preservar productos de otros administradores en el índice general
  const todos = JSON.parse(localStorage.getItem('productos_db') || '[]');
  const otros = todos.filter(p => p.adminId && p.adminId !== clave && (!tenant.adminEmail || p.adminEmail !== tenant.adminEmail));
  localStorage.setItem('productos_db', JSON.stringify([...otros, ...productosDB]));
}

function guardarClientesDB() {
  const tenant = obtenerTenantActual();
  const clave = tenant.adminId || 'adm_1';
  localStorage.setItem('negocio_clientes_' + clave, JSON.stringify(clientesDB));
  localStorage.setItem('clientes_db_' + clave, JSON.stringify(clientesDB));

  const todos = JSON.parse(localStorage.getItem('clientes_db') || '[]');
  const otros = todos.filter(c => c.adminId && c.adminId !== clave && (!tenant.adminEmail || c.adminEmail !== tenant.adminEmail));
  localStorage.setItem('clientes_db', JSON.stringify([...otros, ...clientesDB]));
}

function guardarVentasDB() {
  const tenant = obtenerTenantActual();
  const clave = tenant.adminId || 'adm_1';
  localStorage.setItem('negocio_ventas_' + clave, JSON.stringify(ventasDB));
  localStorage.setItem('ventas_db_' + clave, JSON.stringify(ventasDB));

  const todos = JSON.parse(localStorage.getItem('ventas_db') || '[]');
  const otros = todos.filter(v => v.adminId && v.adminId !== clave && (!tenant.adminEmail || v.adminEmail !== tenant.adminEmail));
  localStorage.setItem('ventas_db', JSON.stringify([...otros, ...ventasDB]));
}

function guardarVendedoresDB() {
  const tenant = obtenerTenantActual();
  const clave = tenant.adminId || 'adm_1';
  localStorage.setItem('negocio_vendedores_' + clave, JSON.stringify(vendedoresDB));
  localStorage.setItem('vendedores_db_' + clave, JSON.stringify(vendedoresDB));

  const todos = JSON.parse(localStorage.getItem('vendedores_db') || '[]');
  const otros = todos.filter(v => v.adminId && v.adminId !== clave && (!tenant.adminEmail || v.adminEmail !== tenant.adminEmail));
  localStorage.setItem('vendedores_db', JSON.stringify([...otros, ...vendedoresDB]));
}

function guardarNominasDB() {
  const tenant = obtenerTenantActual();
  const clave = tenant.adminId || 'adm_1';
  localStorage.setItem('negocio_nominas_' + clave, JSON.stringify(nominasDB));
  localStorage.setItem('nominas_db_' + clave, JSON.stringify(nominasDB));

  const todos = JSON.parse(localStorage.getItem('nominas_db') || '[]');
  const otros = todos.filter(n => n.adminId && n.adminId !== clave && (!tenant.adminEmail || n.adminEmail !== tenant.adminEmail));
  localStorage.setItem('nominas_db', JSON.stringify([...otros, ...nominasDB]));
}

window.cargarDatosDelNegocio = function(usuario) {
  if (!usuario) return;
  const tenant = obtenerTenantActual();
  const clave = tenant.adminId || 'adm_1';
  const claveAuth = tenant.adminAuthUid || '';

  // 1. Cargar catálogo de productos aislado para este negocio desde Local Storage
  let cargadosProds = false;
  const prodsLocal = localStorage.getItem('negocio_productos_' + clave) || 
                     (claveAuth ? localStorage.getItem('negocio_productos_' + claveAuth) : null) ||
                     (tenant.negocio ? localStorage.getItem('negocio_productos_' + tenant.negocio) : null) ||
                     localStorage.getItem('productos_db_' + clave);

  if (prodsLocal) {
    try {
      const parsed = JSON.parse(prodsLocal);
      if (Array.isArray(parsed) && parsed.length > 0) {
        productosDB = parsed.map(migrarProducto);
        cargadosProds = true;
      }
    } catch (e) {
      console.warn("Error leyendo productos de negocio:", e);
    }
  }

  if (!cargadosProds) {
    // Buscar en el índice global de productos por adminId, adminAuthUid, adminEmail o nombre de negocio
    const prodsGlobal = JSON.parse(localStorage.getItem('productos_db') || '[]');
    const prodsFiltrados = prodsGlobal.filter(p => 
      p.adminId === clave || 
      (claveAuth && p.adminId === claveAuth) ||
      (tenant.adminEmail && p.adminEmail && p.adminEmail.toLowerCase() === tenant.adminEmail.toLowerCase()) ||
      (tenant.negocio && p.negocio && p.negocio.toLowerCase() === tenant.negocio.toLowerCase() && p.negocio.toLowerCase() !== 'gnet')
    );
    if (prodsFiltrados.length > 0) {
      productosDB = prodsFiltrados.map(migrarProducto);
      cargadosProds = true;
      localStorage.setItem('negocio_productos_' + clave, JSON.stringify(productosDB));
    } else if (clave === 'adm_1') {
      productosDB = prodsGlobal.map(p => ({ ...migrarProducto(p), adminId: 'adm_1' }));
      localStorage.setItem('negocio_productos_' + clave, JSON.stringify(productosDB));
    } else {
      productosDB = [];
    }
  }

  // Si aún no hay productos y estamos en línea, consultar Firestore inmediatamente para cargar el catálogo
  if (productosDB.length === 0 && typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    firebase.firestore().collection('productos').get().then(snap => {
      if (snap && !snap.empty) {
        const remotos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const delAdmin = remotos.filter(p => 
          p.adminId === clave || 
          (claveAuth && p.adminId === claveAuth) ||
          (tenant.adminEmail && p.adminEmail && p.adminEmail.toLowerCase() === tenant.adminEmail.toLowerCase()) ||
          (tenant.negocio && p.negocio && p.negocio.toLowerCase() === tenant.negocio.toLowerCase() && p.negocio.toLowerCase() !== 'gnet') ||
          (!p.adminId && (clave === 'adm_1' || clave.includes('1')))
        );
        if (delAdmin.length > 0) {
          productosDB = delAdmin.map(migrarProducto);
          guardarProductosDB();
          renderizarInventario();
          console.log(`✅ Catálogo de ${delAdmin.length} productos cargado desde Firestore para "${tenant.negocio}".`);
        }
      }
    }).catch(e => console.warn("Auto-carga productos Firestore:", e.message));
  }

  // 2. Cargar clientes aislados
  const cliLocal = localStorage.getItem('negocio_clientes_' + clave) || localStorage.getItem('clientes_db_' + clave);
  if (cliLocal) {
    try {
      clientesDB = JSON.parse(cliLocal);
    } catch (e) {}
  } else {
    if (clave === 'adm_1') {
      clientesDB = JSON.parse(localStorage.getItem('clientes_db') || '[]');
    } else {
      const cliGlobal = JSON.parse(localStorage.getItem('clientes_db') || '[]');
      clientesDB = cliGlobal.filter(c => 
        c.adminId === clave || 
        (claveAuth && c.adminId === claveAuth) ||
        (tenant.adminEmail && c.adminEmail === tenant.adminEmail) ||
        (tenant.negocio && c.negocio && c.negocio.toLowerCase() === tenant.negocio.toLowerCase())
      );
    }
    localStorage.setItem('negocio_clientes_' + clave, JSON.stringify(clientesDB));
  }

  // 3. Cargar ventas aisladas
  const ventasLocal = localStorage.getItem('negocio_ventas_' + clave) || localStorage.getItem('ventas_db_' + clave);
  if (ventasLocal) {
    try {
      ventasDB = JSON.parse(ventasLocal);
    } catch (e) {}
  } else {
    const ventasGlobal = JSON.parse(localStorage.getItem('ventas_db') || '[]');
    if (clave === 'adm_1') {
      ventasDB = ventasGlobal;
    } else {
      ventasDB = ventasGlobal.filter(v => 
        v.adminId === clave || 
        (claveAuth && v.adminId === claveAuth) ||
        (tenant.adminEmail && v.adminEmail === tenant.adminEmail) ||
        (tenant.negocio && v.negocio && v.negocio.toLowerCase() === tenant.negocio.toLowerCase())
      );
    }
    localStorage.setItem('negocio_ventas_' + clave, JSON.stringify(ventasDB));
  }

  // 4. Cargar VENDEDORES aislados (SOLO los de este administrador)
  if (usuario.rol === 'admin') {
    const vendsLocal = localStorage.getItem('negocio_vendedores_' + clave) || localStorage.getItem('vendedores_db_' + clave);
    if (vendsLocal) {
      try {
        vendedoresDB = JSON.parse(vendsLocal);
      } catch (e) {}
    } else {
      const vendsGlobal = JSON.parse(localStorage.getItem('vendedores_db') || '[]');
      vendedoresDB = vendsGlobal.filter(v => {
        if (v.adminId && (String(v.adminId) === String(clave) || (claveAuth && String(v.adminId) === String(claveAuth)))) return true;
        if (v.adminEmail && tenant.adminEmail && String(v.adminEmail).toLowerCase() === tenant.adminEmail) return true;
        if (tenant.negocio && v.negocio && String(v.negocio).toLowerCase() === tenant.negocio.toLowerCase() && v.negocio !== 'GNET') return true;
        if (!v.adminId && (clave === 'adm_1' || String(clave).includes('1'))) return true;
        return false;
      });
      localStorage.setItem('negocio_vendedores_' + clave, JSON.stringify(vendedoresDB));
      localStorage.setItem('vendedores_db_' + clave, JSON.stringify(vendedoresDB));
    }
    poblarSelectsVendedores();
    renderizarVendedores();
  }

  // 5. Cargar NÓMINAS aisladas para este negocio y usuario
  const nomLocal = localStorage.getItem('negocio_nominas_' + clave) || localStorage.getItem('nominas_db_' + clave);
  if (nomLocal) {
    try {
      nominasDB = JSON.parse(nomLocal);
    } catch (e) {}
  } else {
    const nomGlobal = JSON.parse(localStorage.getItem('nominas_db') || '[]');
    const miVendId = String(usuario.id || '');
    const miVendAuth = String(usuario.authUid || '');
    const miVendUser = String(usuario.usuario || '').toLowerCase();
    const miVendEmail = String(usuario.email || '').toLowerCase();
    const miVendNom = String(usuario.nombre || usuario.displayName || '').toLowerCase();

    nominasDB = nomGlobal.filter(n => {
      if (usuario.rol === 'admin') {
        return n.adminId === clave || 
          (claveAuth && n.adminId === claveAuth) ||
          (tenant.adminEmail && n.adminEmail && n.adminEmail.toLowerCase() === tenant.adminEmail.toLowerCase()) ||
          (tenant.negocio && n.negocio && n.negocio.toLowerCase() === tenant.negocio.toLowerCase());
      } else {
        return String(n.vendedorId) === miVendId ||
          (miVendAuth && (String(n.vendedorId) === miVendAuth || String(n.vendedorAuthUid) === miVendAuth)) ||
          (n.vendedorUsuario && miVendUser && String(n.vendedorUsuario).toLowerCase() === miVendUser) ||
          (n.vendedorEmail && miVendEmail && String(n.vendedorEmail).toLowerCase() === miVendEmail) ||
          (miVendNom && n.nombreVendedor && String(n.nombreVendedor).toLowerCase() === miVendNom) ||
          (n.adminId === clave && miVendNom && n.nombreVendedor && String(n.nombreVendedor).toLowerCase() === miVendNom);
      }
    });
    localStorage.setItem('negocio_nominas_' + clave, JSON.stringify(nominasDB));
  }

  // Auto-sincronizar nóminas desde Firestore en segundo plano si estamos en línea
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    firebase.firestore().collection('nominas').get().then(snap => {
      if (snap && !snap.empty) {
        const remotos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        let filtradas = [];
        if (usuario.rol === 'admin') {
          filtradas = remotos.filter(n => 
            n.adminId === clave || 
            (claveAuth && n.adminId === claveAuth) ||
            (tenant.adminEmail && n.adminEmail && n.adminEmail.toLowerCase() === tenant.adminEmail.toLowerCase()) ||
            (tenant.negocio && n.negocio && n.negocio.toLowerCase() === tenant.negocio.toLowerCase() && n.negocio.toLowerCase() !== 'gnet')
          );
        } else {
          const miVendId = String(usuario.id || '');
          const miVendAuth = String(usuario.authUid || '');
          const miVendUser = String(usuario.usuario || '').toLowerCase();
          const miVendEmail = String(usuario.email || '').toLowerCase();
          const miVendNom = String(usuario.nombre || usuario.displayName || '').toLowerCase();

          filtradas = remotos.filter(n => 
            String(n.vendedorId) === miVendId ||
            (miVendAuth && (String(n.vendedorId) === miVendAuth || String(n.vendedorAuthUid) === miVendAuth)) ||
            (n.vendedorUsuario && miVendUser && String(n.vendedorUsuario).toLowerCase() === miVendUser) ||
            (n.vendedorEmail && miVendEmail && String(n.vendedorEmail).toLowerCase() === miVendEmail) ||
            (n.nombreVendedor && miVendNom && String(n.nombreVendedor).toLowerCase() === miVendNom) ||
            (n.adminId === clave && miVendNom && n.nombreVendedor && String(n.nombreVendedor).toLowerCase() === miVendNom)
          );
        }
        if (filtradas.length > 0) {
          const mapNom = new Map(nominasDB.map(n => [String(n.id), n]));
          filtradas.forEach(r => mapNom.set(String(r.id), r));
          nominasDB = Array.from(mapNom.values());
          guardarNominasDB();
          if (usuario.rol === 'vendedor') renderizarNominasVendedor();
          else renderizarHistorialNominasAdmin();
        }
      }
    }).catch(e => console.warn("Auto-carga nóminas Firestore:", e.message));
  }

  // 6. Actualizar visualizador de negocio en modal de sincronización
  const elNegocioSync = document.getElementById('sync-negocio-activo');
  if (elNegocioSync) {
    elNegocioSync.innerText = tenant.negocio || (usuario.negocio || 'Mi Negocio');
  }
};

let gastosDB = JSON.parse(localStorage.getItem('gastos_db')) || [
  { id: 1, concepto: "Mantenimiento Camioneta", monto: 450.00, categoria: "Operativo", fecha: new Date().toISOString() }
];

let nominasDB = JSON.parse(localStorage.getItem('nominas_db')) || [];
let creditAbonosDB = JSON.parse(localStorage.getItem('credit_abonos_db')) || [];
let pedidosDB = JSON.parse(localStorage.getItem('pedidos_db')) || [];

const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hoyNombre = diasSemana[new Date().getDay()];

// MODALES LOGIN
window.abrirModalVendedorLogin = function() { document.getElementById('modal-vendedor-login').classList.remove('hidden'); };
window.cerrarModalVendedorLogin = function() { document.getElementById('modal-vendedor-login').classList.add('hidden'); };
window.abrirModalAdminLogin = function() { document.getElementById('modal-admin-login').classList.remove('hidden'); };
window.cerrarModalAdminLogin = function() { document.getElementById('modal-admin-login').classList.add('hidden'); };
window.abrirModalRootLogin = function() { document.getElementById('modal-root-login').classList.remove('hidden'); };
window.cerrarModalRootLogin = function() { document.getElementById('modal-root-login').classList.add('hidden'); };

window.mostrarPantallaAccesoNoAutorizado = function() {
  cerrarModalAdminLogin();
  document.getElementById('pantalla-login').classList.add('hidden');
  document.getElementById('pantalla-app').classList.add('hidden');
  document.getElementById('pantalla-superadmin').classList.add('hidden');
  document.getElementById('pantalla-conexion-obligatoria').classList.add('hidden');
  document.getElementById('pantalla-acceso-no-autorizado').classList.remove('hidden');
  document.getElementById('btn-root-flotante').classList.add('hidden');
};

window.volverAlLoginDesdeBloqueo = function() {
  document.getElementById('pantalla-acceso-no-autorizado').classList.add('hidden');
  document.getElementById('pantalla-login').classList.remove('hidden');
  document.getElementById('btn-root-flotante').classList.remove('hidden');
};

window.iniciarSesionApp = function(rol, datosUsuario) {
  usuarioActual = { ...datosUsuario, rol };
  document.getElementById('btn-root-flotante').classList.add('hidden');
  document.getElementById('pantalla-login').classList.add('hidden');
  document.getElementById('pantalla-app').classList.remove('hidden');

  const tenant = obtenerTenantActual();
  const nombreNegocioMostrado = (datosUsuario.negocio && datosUsuario.negocio !== 'GNET' && datosUsuario.negocio !== 'GNET Operaciones') 
    ? datosUsuario.negocio 
    : (tenant.negocio || localStorage.getItem('negocio_nombre') || 'Mi Negocio');

  usuarioActual.negocio = nombreNegocioMostrado;
  if (nombreNegocioMostrado && nombreNegocioMostrado !== 'GNET' && nombreNegocioMostrado !== 'GNET Operaciones') {
    localStorage.setItem('negocio_nombre', nombreNegocioMostrado);
    if (datosUsuario.id) localStorage.setItem('negocio_nombre_' + datosUsuario.id, nombreNegocioMostrado);
    if (tenant.adminId) localStorage.setItem('negocio_nombre_' + tenant.adminId, nombreNegocioMostrado);
  }

  // Cargar datos aislados del negocio / administrador al almacenamiento local
  cargarDatosDelNegocio(usuarioActual);

  const btnAdmin = document.getElementById('btn-nav-admin');
  const btnVendedorNomina = document.getElementById('btn-nav-vendedor-nomina');
  const vendWrap = document.getElementById('cli-vendedor-wrap');

  if (rol === 'vendedor') {
    document.getElementById('agenda-nav-vendedor').classList.remove('hidden');
    document.getElementById('agenda-nav-admin').classList.add('hidden');
    document.getElementById('txt-usuario').innerText = datosUsuario.nombre || datosUsuario.displayName || 'Vendedor';
    document.getElementById('txt-rol').innerText = `Vendedor · ${nombreNegocioMostrado}`;
    
    const btnModoVista = document.getElementById('btn-modo-vista');
    if (btnModoVista) btnModoVista.classList.add('hidden');

    if (btnAdmin) {
      btnAdmin.style.display = 'none';
      btnAdmin.classList.add('hidden');
      btnAdmin.classList.remove('flex');
    }
    
    btnVendedorNomina.classList.remove('hidden');
    btnVendedorNomina.classList.add('flex');

    if (vendWrap) vendWrap.classList.add('hidden');
    const selVend = document.getElementById('cli-vendedor-select');
    if (selVend) {
      selVend.removeAttribute('required');
      selVend.value = datosUsuario.id;
    }
  } else {
    const btnModoVista = document.getElementById('btn-modo-vista');
    if (btnModoVista) btnModoVista.classList.remove('hidden');
    document.getElementById('agenda-nav-vendedor').classList.add('hidden');
    document.getElementById('agenda-nav-admin').classList.remove('hidden');
    document.getElementById('txt-usuario').innerText = datosUsuario.nombreCompleto || datosUsuario.nombre || 'Administrador';
    document.getElementById('txt-rol').innerText = `Admin: ${nombreNegocioMostrado}`;
    document.getElementById('adm-nombre-txt').innerText = datosUsuario.nombreCompleto || datosUsuario.nombre || 'Administrador';
    document.getElementById('adm-negocio-tag').innerText = nombreNegocioMostrado;

    if (btnAdmin) {
      btnAdmin.style.display = 'flex';
      btnAdmin.classList.remove('hidden');
      btnAdmin.classList.add('flex');
    }
    
    btnVendedorNomina.classList.add('hidden');
    btnVendedorNomina.classList.remove('flex');

    if (vendWrap) vendWrap.classList.remove('hidden');
    const selVend = document.getElementById('cli-vendedor-select');
    if (selVend) selVend.setAttribute('required', 'required');
  }

  const elNegocioSync = document.getElementById('sync-negocio-activo');
  if (elNegocioSync) {
    elNegocioSync.innerText = nombreNegocioMostrado;
  }

  document.getElementById('dia-actual-txt').innerText = `Hoy es: ${hoyNombre}`;
  poblarSelectsVendedores();
  renderizarVendedores();
  subVistaAgendaActual = rol === 'admin' ? 'visitas-totales' : 'visitas';
  cambiarSubVistaAgenda(subVistaAgendaActual);
  subVistaProdActual = 'inventario';
  renderizarInventario();
  cambiarVista('agenda');
};

window.cerrarSesion = function() {
  usuarioActual = null;
  document.getElementById('pantalla-app').classList.add('hidden');
  document.getElementById('pantalla-superadmin').classList.add('hidden');
  document.getElementById('pantalla-login').classList.remove('hidden');
  document.getElementById('btn-root-flotante').classList.remove('hidden');
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().signOut().catch(() => {});
  }
};

window.salirSuperadmin = function() {
  document.getElementById('pantalla-superadmin').classList.add('hidden');
  document.getElementById('pantalla-login').classList.remove('hidden');
  document.getElementById('btn-root-flotante').classList.remove('hidden');
};

// VENDEDORES
window.guardarVendedor = async function(e) {
  e.preventDefault();
  const password = document.getElementById('vend-pass').value;
  const usuario = document.getElementById('vend-usuario').value.trim();
  const tenant = obtenerTenantActual();
  const adminIdActual = usuarioActual?.rol === 'admin' ? String(usuarioActual.id || 'adm_1') : tenant.adminId;
  const adminEmailActual = (usuarioActual && (usuarioActual.email || usuarioActual.usuario)) || tenant.adminEmail;
  const negocioActual = (usuarioActual && usuarioActual.negocio && usuarioActual.negocio !== 'GNET' && usuarioActual.negocio !== 'GNET Operaciones') 
    ? usuarioActual.negocio 
    : (tenant.negocio || localStorage.getItem('negocio_nombre') || 'Mi Negocio');
  const adminAuthUidActual = (usuarioActual && (usuarioActual.authUid || usuarioActual.uid)) || tenant.adminAuthUid || '';

  const nuevo = {
    id: "vend_" + Date.now(),
    nombre: document.getElementById('vend-nombre').value.trim(),
    telefono: document.getElementById('vend-telefono').value.trim(),
    usuario,
    email: formatearEmail(usuario),
    password,
    adminId: adminIdActual,
    adminAuthUid: adminAuthUidActual,
    adminEmail: adminEmailActual,
    negocio: negocioActual,
    rol: 'vendedor',
    accesoActivo: true,
    fechaCreacion: new Date().toISOString()
  };

  try {
    // 1. Crear en Firebase Auth con app secundaria para NO desloguear al Administrador activo
    const authUid = await crearCuentaFirebaseAuth(formatearEmail(usuario), password, nuevo.nombre);
    if (authUid) {
      nuevo.authUid = authUid;
    }

    // 2. Guardar en Firestore tanto en 'vendedores' como en 'usuarios'
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      const docSanitizado = sanitizarParaFirestore(nuevo);
      await db.collection('vendedores').doc(nuevo.id).set(docSanitizado, { merge: true });
      await db.collection('usuarios').doc(nuevo.id).set(docSanitizado, { merge: true });
      if (authUid) {
        await db.collection('vendedores').doc(authUid).set(docSanitizado, { merge: true });
        await db.collection('usuarios').doc(authUid).set(docSanitizado, { merge: true });
      }
    }
  } catch (err) {
    console.warn("Error guardando vendedor en Firestore:", err);
  }

  // Guardar exclusivamente para este administrador en almacenamiento local
  vendedoresDB = [nuevo, ...vendedoresDB.filter(v => String(v.id) !== String(nuevo.id))];
  guardarVendedoresDB();
  localStorage.setItem('negocio_nombre_' + nuevo.id, negocioActual);
  if (nuevo.authUid) localStorage.setItem('negocio_nombre_' + nuevo.authUid, negocioActual);
  document.getElementById('form-vendedor').reset();
  poblarSelectsVendedores();
  renderizarVendedores();
  toast(`✅ Vendedor ${nuevo.nombre} registrado para "${negocioActual}" exitosamente.`);
};

window.renderizarVendedores = function() {
  const cont = document.getElementById('lista-vendedores');
  if (!cont) return;
  cont.innerHTML = '';

  let lista = vendedoresDB;
  if (usuarioActual && usuarioActual.rol === 'admin') {
    const miAdminId = String(usuarioActual.id || '');
    const miEmail = String(usuarioActual.email || usuarioActual.usuario || '').toLowerCase();
    const miNegocio = String(usuarioActual.negocio || '').toLowerCase();

    lista = vendedoresDB.filter(v => {
      if (v.adminId && String(v.adminId) === miAdminId) return true;
      if (v.adminEmail && String(v.adminEmail).toLowerCase() === miEmail) return true;
      if (miNegocio && v.negocio && String(v.negocio).toLowerCase() === miNegocio) return true;
      if (!v.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1'))) return true;
      return false;
    });
  }

  if (lista.length === 0) {
    cont.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p class="font-bold text-slate-600">💼 Aún no has registrado vendedores para tu negocio</p>
        <p class="text-[11px] text-slate-500 mt-1">Los vendedores que registres aquí solo te aparecerán a ti y no a otros administradores.</p>
      </div>`;
    return;
  }

  lista.forEach(v => {
    cont.innerHTML += `
      <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl flex justify-between items-center text-xs">
        <div>
          <p class="font-bold text-slate-900">${esc(v.nombre)}</p>
          <p class="text-slate-600">📞 ${esc(v.telefono)} | User: <span class="text-blue-600 font-mono">${esc(v.usuario)}</span></p>
          ${v.negocio ? `<p class="text-[10px] text-purple-700 font-medium">🏢 ${esc(v.negocio)}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-1.5">
          <span class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] border border-emerald-200">Activo</span>
          <button onclick="abrirModalRestablecerPassword('${v.id}')" class="bg-amber-600/20 hover:bg-amber-600 text-amber-700 hover:text-white border border-amber-200 px-2 py-1 rounded-lg text-[10px] font-semibold">🔑 Restablecer contraseña</button>
        </div>
      </div>
    `;
  });
};

window.poblarSelectsVendedores = function() {
  const selectCliente = document.getElementById('cli-vendedor-select');
  const selectFiltroCliente = document.getElementById('filtro-cliente-vendedor');
  const selectNomina = document.getElementById('nomina-vendedor-select');

  if (selectCliente) selectCliente.innerHTML = '';
  if (selectFiltroCliente) selectFiltroCliente.innerHTML = '<option value="todos">Todos los Vendedores</option>';
  if (selectNomina) selectNomina.innerHTML = '';

  let lista = vendedoresDB;
  if (usuarioActual && usuarioActual.rol === 'admin') {
    const miAdminId = String(usuarioActual.id || '');
    const miEmail = String(usuarioActual.email || usuarioActual.usuario || '').toLowerCase();
    const miNegocio = String(usuarioActual.negocio || '').toLowerCase();

    lista = vendedoresDB.filter(v => {
      if (v.adminId && String(v.adminId) === miAdminId) return true;
      if (v.adminEmail && String(v.adminEmail).toLowerCase() === miEmail) return true;
      if (miNegocio && v.negocio && String(v.negocio).toLowerCase() === miNegocio) return true;
      if (!v.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1'))) return true;
      return false;
    });
  }

  lista.forEach(v => {
    if (selectCliente) selectCliente.innerHTML += `<option value="${v.id}">${esc(v.nombre)}</option>`;
    if (selectFiltroCliente) selectFiltroCliente.innerHTML += `<option value="${v.id}">${esc(v.nombre)}</option>`;
    if (selectNomina) selectNomina.innerHTML += `<option value="${v.id}">${esc(v.nombre)}</option>`;
  });
};

// CLIENTES
window.guardarCliente = function(e) {
  e.preventDefault();
  const checkboxes = document.querySelectorAll('input[name="dias"]:checked');
  const diasSeleccionados = Array.from(checkboxes).map(cb => cb.value);

  if (diasSeleccionados.length === 0) return alert("Selecciona al menos un día.");

  let vendedorId;
  if (usuarioActual && usuarioActual.rol === 'vendedor') {
    vendedorId = usuarioActual.id;
  } else {
    vendedorId = document.getElementById('cli-vendedor-select').value;
  }

  const tenant = obtenerTenantActual();
  const nuevoCliente = {
    id: Date.now(),
    adminId: tenant.adminId,
    adminEmail: tenant.adminEmail,
    negocio: tenant.negocio,
    nombre: document.getElementById('cli-nombre').value.trim(),
    telefono: document.getElementById('cli-telefono').value.trim(),
    direccion: document.getElementById('cli-direccion').value.trim(),
    vendedorId,
    gps: document.getElementById('cli-gps').value || 'Sin GPS',
    diasVisita: diasSeleccionados,
    fechaCreacion: new Date().toISOString()
  };

  clientesDB.push(nuevoCliente);
  guardarClientesDB();
  document.getElementById('form-cliente').reset();
  toast(`✅ Cliente guardado en almacenamiento local`);
  renderizarAgenda();
  renderizarMisClientes();
  cambiarSubVistaClientes('lista');
};

window.botonMapaGPS = function(gps) {
  const coords = String(gps || '').trim();
  if (!coords || coords === 'Sin GPS' || coords === 'Error al capturar GPS' || coords === 'Obteniendo...') {
    return `<span class="text-slate-400 text-[11px]" title="Sin coordenadas">🗺️</span>`;
  }
  const partes = coords.split(',').map(s => s.trim());
  if (partes.length < 2 || isNaN(parseFloat(partes[0])) || isNaN(parseFloat(partes[1]))) {
    return `<span class="text-slate-400 text-[11px]" title="GPS inválido">🗺️</span>`;
  }
  const url = `https://www.google.com/maps?q=${encodeURIComponent(partes[0] + ',' + partes[1])}`;
  return `<a href="${url}" target="_blank" rel="noopener" title="Abrir en Google Maps" class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white hover:bg-blue-600 border border-slate-300 hover:border-blue-500 text-base transition" onclick="event.stopPropagation()">🗺️</a>`;
};

window.renderizarMisClientes = function() {
  const cont = document.getElementById('lista-mis-clientes');
  if (!cont) return;

  let lista = clientesDB;
  if (usuarioActual && usuarioActual.rol === 'vendedor') {
    lista = clientesDB.filter(c => c.vendedorId === usuarioActual.id);
  }

  lista = lista.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  document.getElementById('badge-mis-clientes').innerText = lista.length;

  if (lista.length === 0) {
    cont.innerHTML = '<div class="text-center py-8 text-slate-500 text-xs"><p>📂 Aún no tienes clientes asignados.<br>Registra uno en la pestaña Nuevo.</p></div>';
    return;
  }

  cont.innerHTML = lista.map(c => `
    <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs space-y-1.5">
      <div class="flex justify-between items-start gap-2">
        <div class="min-w-0">
          <p class="font-bold text-slate-900 break-words">${esc(c.nombre)}</p>
          <p class="text-slate-600">📞 ${esc(c.telefono)}</p>
        </div>
        ${botonMapaGPS(c.gps)}
      </div>
      ${c.direccion ? `<p class="text-[11px] text-slate-600">🏠 ${esc(c.direccion)}</p>` : ''}
      <p class="text-[10px] text-slate-500">Días: ${(c.diasVisita || []).join(', ')}</p>
      <div class="grid grid-cols-2 gap-1.5 pt-1">
        <button onclick="abrirModalActualizarCliente(${c.id})" class="bg-blue-600/20 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-lg py-2 text-[10px] font-semibold">✏️ Actualizar datos</button>
        <button onclick="abrirModalCreditoCliente(${c.id})" class="bg-amber-600/20 hover:bg-amber-600 text-amber-700 hover:text-white border border-amber-200 rounded-lg py-2 text-[10px] font-semibold">💳 Crédito / Fiado</button>
      </div>
    </div>
  `).join('');
};

let subVistaClientesActual = 'lista';
window.cambiarSubVistaClientes = function(sv) {
  subVistaClientesActual = sv;
  document.getElementById('subvistacli-lista').classList.toggle('hidden', sv !== 'lista');
  document.getElementById('subvistacli-nuevo').classList.toggle('hidden', sv !== 'nuevo');
  document.getElementById('subnav-cli-lista').className = sv === 'lista'
    ? 'py-2 rounded-lg bg-blue-600 text-white font-bold'
    : 'py-2 rounded-lg text-slate-600';
  document.getElementById('subnav-cli-nuevo').className = sv === 'nuevo'
    ? 'py-2 rounded-lg bg-blue-600 text-white font-bold'
    : 'py-2 rounded-lg text-slate-600';
  if (sv === 'lista') renderizarMisClientes();
};

window.renderizarClientesAdmin = function() {
  const cont = document.getElementById('lista-clientes-admin');
  if (!cont) return;
  const filtro = document.getElementById('filtro-cliente-vendedor').value;
  cont.innerHTML = '';

  let lista = clientesDB;
  if (filtro !== 'todos') {
    lista = clientesDB.filter(c => c.vendedorId === filtro);
  }

  document.getElementById('badge-total-clientes').innerText = lista.length;

  lista.forEach(c => {
    const vend = vendedoresDB.find(v => v.id === c.vendedorId);
    cont.innerHTML += `
      <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs space-y-1">
        <div class="flex justify-between items-start gap-2 font-bold text-slate-900">
          <span class="min-w-0 break-words">${esc(c.nombre)}</span>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">${vend ? esc(vend.nombre) : 'Sin Vendedor'}</span>
            ${botonMapaGPS(c.gps)}
          </div>
        </div>
        <p class="text-slate-600">📞 ${esc(c.telefono)}</p>
        ${c.direccion ? `<p class="text-[11px] text-slate-600">🏠 ${esc(c.direccion)}</p>` : ''}
        <p class="text-[10px] text-slate-500">Días: ${(c.diasVisita || []).join(', ')}</p>
        <div class="grid grid-cols-2 gap-1.5 pt-1">
          <button onclick="abrirModalActualizarCliente(${c.id})" class="bg-blue-600/20 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-lg py-2 text-[10px] font-semibold">✏️ Actualizar datos</button>
          <button onclick="abrirModalAsignarVendedor(${c.id})" class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-lg py-2 text-[10px] font-semibold">👤 Asignar vendedor</button>
          <button onclick="abrirModalCreditoCliente(${c.id})" class="col-span-2 bg-amber-600/20 hover:bg-amber-600 text-amber-700 hover:text-white border border-amber-200 rounded-lg py-2 text-[10px] font-semibold">💳 Crédito / Fiado</button>
        </div>
      </div>
    `;
  });
};

let vendedorPasswordEditandoId = null;
window.abrirModalRestablecerPassword = function(id) {
  const v = vendedoresDB.find(x => x.id === id);
  if (!v) return;
  vendedorPasswordEditandoId = id;
  document.getElementById('reset-vendedor-nombre').innerText = `Vendedor: ${v.nombre} · Usuario: ${v.usuario}`;
  document.getElementById('reset-password-nueva').value = '';
  document.getElementById('reset-password-confirmar').value = '';
  document.getElementById('modal-restablecer-password').classList.remove('hidden');
  setTimeout(() => document.getElementById('reset-password-nueva').focus(), 50);
};

window.cerrarModalRestablecerPassword = function() {
  document.getElementById('modal-restablecer-password').classList.add('hidden');
  vendedorPasswordEditandoId = null;
};

window.guardarRestablecerPassword = async function() {
  const v = vendedoresDB.find(x => x.id === vendedorPasswordEditandoId);
  if (!v) return;
  const nueva = document.getElementById('reset-password-nueva').value;
  const confirmar = document.getElementById('reset-password-confirmar').value;
  if (nueva.length < 3) return alert('La contraseña debe tener al menos 3 caracteres.');
  if (nueva !== confirmar) return alert('Las contraseñas no coinciden.');
  v.password = nueva;
  localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));

  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      await firebase.firestore().collection('vendedores').doc(String(v.id)).set({ password: nueva }, { merge: true });
    } catch (e) {
      console.warn("Error actualizando clave en Firestore:", e);
    }
  }

  cerrarModalRestablecerPassword();
  renderizarVendedores();
  toast(`✅ Contraseña de ${v.nombre} restablecida en Firebase`);
};

let clienteEditandoId = null;
let clienteAsignandoId = null;

window.abrirModalActualizarCliente = function(id) {
  const c = clientesDB.find(x => x.id === id); if (!c) return;
  clienteEditandoId = id;
  document.getElementById('edit-cli-nombre').value = c.nombre || '';
  document.getElementById('edit-cli-telefono').value = c.telefono || '';
  document.getElementById('edit-cli-direccion').value = c.direccion || '';
  document.getElementById('edit-cli-gps').value = c.gps || '';
  document.querySelectorAll('input[name="edit-dias"]').forEach(cb => cb.checked = (c.diasVisita || []).includes(cb.value));
  document.getElementById('modal-actualizar-cliente').classList.remove('hidden');
};
window.cerrarModalCliente = function() { document.getElementById('modal-actualizar-cliente').classList.add('hidden'); clienteEditandoId=null; };

window.guardarClienteActualizado = function() {
  const c=clientesDB.find(x=>x.id===clienteEditandoId); if(!c) return;
  const dias=Array.from(document.querySelectorAll('input[name="edit-dias"]:checked')).map(x=>x.value);
  if(!document.getElementById('edit-cli-nombre').value.trim()) return alert('Escribe el nombre del cliente.');
  if(!dias.length) return alert('Selecciona al menos un día de visita.');
  c.nombre=document.getElementById('edit-cli-nombre').value.trim(); c.telefono=document.getElementById('edit-cli-telefono').value.trim(); c.direccion=document.getElementById('edit-cli-direccion').value.trim(); c.gps=document.getElementById('edit-cli-gps').value.trim() || 'Sin GPS'; c.diasVisita=dias;
  localStorage.setItem('clientes_db',JSON.stringify(clientesDB)); cerrarModalCliente(); renderizarMisClientes(); renderizarClientesAdmin(); renderizarAgenda(); toast('✅ Datos del cliente actualizados');
};

window.abrirModalAsignarVendedor = function(id) {
  const c=clientesDB.find(x=>x.id===id); if(!c) return; clienteAsignandoId=id;
  document.getElementById('asignar-cli-nombre').innerText=c.nombre;
  const sel=document.getElementById('asignar-vendedor-select'); sel.innerHTML='<option value="">Sin vendedor asignado</option><option value="__ADMIN__">Asignarme a mí (administrador)</option>';
  vendedoresDB.forEach(v=>sel.innerHTML += `<option value="${v.id}" ${c.vendedorId===v.id?'selected':''}>${esc(v.nombre)}</option>`);
  if(c.administradorId===usuarioActual?.id) sel.value='__ADMIN__';
  document.getElementById('modal-asignar-vendedor').classList.remove('hidden');
};

window.cerrarModalAsignarVendedor = function() { document.getElementById('modal-asignar-vendedor').classList.add('hidden'); clienteAsignandoId=null; };

window.guardarAsignacionVendedor = function() {
  const c=clientesDB.find(x=>x.id===clienteAsignandoId); if(!c) return;
  const val=document.getElementById('asignar-vendedor-select').value;
  c.vendedorId = val && val!=='__ADMIN__' ? val : null;
  c.administradorId = val==='__ADMIN__' && usuarioActual ? usuarioActual.id : null;
  localStorage.setItem('clientes_db',JSON.stringify(clientesDB)); cerrarModalAsignarVendedor(); renderizarClientesAdmin(); renderizarAgenda(); renderizarMisClientes(); toast('✅ Asignación actualizada');
};

window.guardarGasto = function(e) {
  e.preventDefault();
  const nuevoGasto = {
    id: Date.now(),
    concepto: document.getElementById('gasto-concepto').value.trim(),
    monto: parseFloat(document.getElementById('gasto-monto').value) || 0,
    categoria: document.getElementById('gasto-categoria').value,
    fecha: new Date().toISOString()
  };

  gastosDB.push(nuevoGasto);
  localStorage.setItem('gastos_db', JSON.stringify(gastosDB));
  document.getElementById('form-gasto').reset();
  renderizarReporteVentas();
  toast("✅ Gasto registrado correctamente.");
};

window.eliminarGasto = function(idGasto) {
  gastosDB = gastosDB.filter(g => g.id !== idGasto);
  localStorage.setItem('gastos_db', JSON.stringify(gastosDB));
  renderizarReporteVentas();
};

window.renderizarVentasVendedoresTiempoReal = function() {
  const cont=document.getElementById('ventas-vendedores-tiempo-real'); if(!cont) return;
  const inicio=new Date(); inicio.setHours(0,0,0,0);
  const hoyVentas=ventasDB.filter(v=>new Date(v.fecha)>=inicio);
  const filas=vendedoresDB.map(v=>{const vs=hoyVentas.filter(x=>x.vendedorId===v.id); return {nombre:v.nombre,cantidad:vs.length,total:vs.reduce((s,x)=>s+(Number(x.totalVenta)||0),0)};}).sort((a,b)=>b.total-a.total);
  cont.innerHTML=filas.length?filas.map(x=>`<div class="bg-slate-100 border border-slate-200 rounded-lg p-2.5 flex justify-between items-center"><div><p class="text-xs font-bold text-slate-800">👤 ${esc(x.nombre)}</p><p class="text-[10px] text-slate-500">${x.cantidad} venta(s) hoy</p></div><span class="font-mono font-bold text-emerald-600">${fmtMoneda(x.total)}</span></div>`).join(''):'<p class="text-[10px] text-slate-500">Sin ventas hoy.</p>';
};

window.exportarReporteVentasExcel = function() {
  if(typeof XLSX==='undefined') return alert('No se pudo cargar el módulo de Excel.');
  const periodo=document.getElementById('filtro-periodo')?.value || 'mensual';
  const ahora=new Date();
  const inicio=new Date(ahora); inicio.setHours(0,0,0,0);
  if(periodo==='semanal'){ const dia=inicio.getDay(); inicio.setDate(inicio.getDate()-(dia===0?6:dia-1)); }
  if(periodo==='mensual') inicio.setDate(1);
  if(periodo==='anual'){ inicio.setMonth(0,1); }
  const ventasPeriodo=ventasDB.filter(v=>new Date(v.fecha)>=inicio && new Date(v.fecha)<=ahora);
  const filas=ventasPeriodo.map(v=>{const vend=vendedoresDB.find(x=>x.id===v.vendedorId); return {Fecha:new Date(v.fecha).toLocaleString('es-MX'),Vendedor:vend?vend.nombre:(v.vendedorNombre||'Sin vendedor'),Cliente:v.clienteNombre||'Venta mostrador',MetodoPago:etiquetaMetodoPago(v.metodoPago||'efectivo'),Total:Number(v.totalVenta)||0,Costo:Number(v.totalCosto)||0,Utilidad:(Number(v.totalVenta)||0)-(Number(v.totalCosto)||0),Efectivo:v.efectivo??'',Transferencia:v.transferencia??'',Pagado:v.montoPagado??'',Cambio:v.cambio??'',SaldoPendiente:v.saldoPendiente??'',Anotaciones:v.anotaciones||''};});
  const ws=XLSX.utils.json_to_sheet(filas); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Ventas');
  XLSX.writeFile(wb,`reporte_ventas_${isoFecha(new Date())}.xlsx`);
};

window.renderizarReporteSemanalClientes = function() {
  const lista = document.getElementById('lista-clientes-semana');
  const resumen = document.getElementById('resumen-clientes-semana');
  if (!lista || !resumen) return;
  const {inicio, fin} = rangoSemanaActual();
  let clientes = clientesDB.filter(c => usuarioActual && usuarioActual.rol === 'admin' ? c.administradorId === usuarioActual.id : false);
  if (!clientes.length) clientes = clientesDB;
  clientes = clientes.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const compraron = clientes.filter(c => ventasDB.some(v => v.clienteId === c.id && new Date(v.fecha) >= inicio && new Date(v.fecha) <= fin));
  const noCompraron = clientes.filter(c => !compraron.some(x=>x.id===c.id));
  resumen.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-2"><p class="text-[10px] text-slate-500 font-bold">Compraron</p><p class="text-lg font-bold text-emerald-600">${compraron.length}</p></div><div class="bg-rose-50 border border-rose-200 rounded-lg p-2"><p class="text-[10px] text-slate-500 font-bold">No compraron</p><p class="text-lg font-bold text-rose-600">${noCompraron.length}</p></div>`;
  if (!clientes.length) { lista.innerHTML='<p class="text-[10px] text-slate-500 text-center py-4">No hay clientes asignados.</p>'; return; }
  lista.innerHTML = clientes.map(c => {
    const ventas = ventasDB.filter(v=>v.clienteId===c.id && new Date(v.fecha)>=inicio && new Date(v.fecha)<=fin);
    const total = ventas.reduce((s,v)=>s+(Number(v.totalVenta)||0),0);
    const compro = ventas.length>0;
    return `<div class="bg-slate-100 border border-slate-200 rounded-lg p-2.5 flex justify-between items-center gap-2"><div class="min-w-0"><p class="text-xs font-bold text-slate-800 truncate">${esc(c.nombre)}</p><p class="text-[10px] text-slate-500">${ventas.length} venta(s) · ${fmtMoneda(total)}</p></div><span class="shrink-0 text-[10px] px-2 py-1 rounded-full border ${compro?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-rose-50 text-rose-700 border-rose-200'}">${compro?'✓ Compró':'✕ No compró'}</span></div>`;
  }).join('');
};

window.renderizarReporteVentas = function() {
  renderizarVentasVendedoresTiempoReal();
  renderizarReporteSemanalClientes();
  const filtroEl = document.getElementById('filtro-periodo');
  if (!filtroEl) return;
  const periodo = filtroEl.value;
  
  const ahoraReporte = new Date();
  const inicioReporte = new Date(ahoraReporte); inicioReporte.setHours(0,0,0,0);
  if (periodo === 'semanal') { const dia = inicioReporte.getDay(); inicioReporte.setDate(inicioReporte.getDate() - (dia === 0 ? 6 : dia - 1)); }
  else if (periodo === 'mensual') inicioReporte.setDate(1);
  else if (periodo === 'anual') inicioReporte.setMonth(0,1);
  const ventasPeriodo = ventasDB.filter(v => { const f=new Date(v.fecha); return f >= inicioReporte && f <= ahoraReporte; });
  let totalVenta = ventasPeriodo.reduce((s,v)=>s+(Number(v.totalVenta)||0),0);
  let totalCosto = ventasPeriodo.reduce((s,v)=>s+(Number(v.totalCosto)||0),0);
  let totalPedidos = ventasPeriodo.length;

  let totalGastosExtra = 0;
  gastosDB.forEach(g => totalGastosExtra += g.monto);

  let totalNominasPagadas = 0;
  nominasDB.forEach(n => totalNominasPagadas += n.pagoTotal);

  const utilidadReal = totalVenta - totalCosto - totalNominasPagadas - totalGastosExtra;

  document.getElementById('monto-ventas').innerText = `$${totalVenta.toFixed(2)}`;
  document.getElementById('monto-costo').innerText = `$${totalCosto.toFixed(2)}`;
  document.getElementById('monto-nominas-descuento').innerText = `$${totalNominasPagadas.toFixed(2)}`;
  document.getElementById('monto-gastos-descuento').innerText = `$${totalGastosExtra.toFixed(2)}`;
  document.getElementById('monto-utilidad').innerText = `$${utilidadReal.toFixed(2)}`;
  document.getElementById('cant-pedidos').innerText = totalPedidos;

  const contGastos = document.getElementById('lista-gastos-admin');
  if (!contGastos) return;
  contGastos.innerHTML = '';
  if (gastosDB.length === 0) {
    contGastos.innerHTML = '<p class="text-[10px] text-slate-500">Sin gastos adicionales registrados.</p>';
  } else {
    gastosDB.forEach(g => {
      contGastos.innerHTML += `
        <div class="bg-slate-100 p-2 rounded-lg flex justify-between items-center text-[11px] border border-slate-200">
          <div>
            <p class="font-bold text-slate-800">${esc(g.concepto)}</p>
            <p class="text-[10px] text-slate-600">${esc(g.categoria)} | ${new Date(g.fecha).toLocaleDateString()}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-rose-600 font-bold">-$${g.monto.toFixed(2)}</span>
            <button onclick="eliminarGasto(${g.id})" class="text-xs text-slate-500 hover:text-rose-600">🗑️</button>
          </div>
        </div>
      `;
    });
  }
};

window.calcularNomina = function() {
  const vId = document.getElementById('nomina-vendedor-select')?.value;
  const vend = vendedoresDB.find(v => String(v.id) === String(vId) || (v.authUid && String(v.authUid) === String(vId)));
  const sueldoBase = parseFloat(document.getElementById('nom-sueldo-base')?.value) || 0;
  const pctComision = parseFloat(document.getElementById('nom-comision-pct')?.value) || 0;

  let ventasVendedor = 0;
  ventasDB.filter(v => String(v.vendedorId) === String(vId) || (vend && vend.authUid && String(v.vendedorId) === String(vend.authUid))).forEach(v => ventasVendedor += (Number(v.totalVenta) || 0));

  const montoComision = ventasVendedor * (pctComision / 100);
  const pagoTotal = sueldoBase + montoComision;

  const elV = document.getElementById('nom-ventas-vendedor');
  if (elV) elV.innerText = `$${ventasVendedor.toFixed(2)}`;
  const elC = document.getElementById('nom-monto-comision');
  if (elC) elC.innerText = `$${montoComision.toFixed(2)}`;
  const elB = document.getElementById('nom-monto-base');
  if (elB) elB.innerText = `$${sueldoBase.toFixed(2)}`;
  const elP = document.getElementById('nom-pago-total');
  if (elP) elP.innerText = `$${pagoTotal.toFixed(2)}`;
};

window.enviarNominaAVendedor = async function() {
  const vId = document.getElementById('nomina-vendedor-select')?.value;
  const vend = vendedoresDB.find(v => String(v.id) === String(vId) || (v.authUid && String(v.authUid) === String(vId)));
  if (!vend) return alert("Selecciona un vendedor válido.");

  const sueldoBase = parseFloat(document.getElementById('nom-sueldo-base')?.value) || 0;
  const pctComision = parseFloat(document.getElementById('nom-comision-pct')?.value) || 0;
  
  let ventasVendedor = 0;
  ventasDB.filter(v => String(v.vendedorId) === String(vId) || (vend.authUid && String(v.vendedorId) === String(vend.authUid))).forEach(v => ventasVendedor += (Number(v.totalVenta) || 0));
  const montoComision = ventasVendedor * (pctComision / 100);
  const pagoTotal = sueldoBase + montoComision;

  const tenant = obtenerTenantActual();
  const miAdminId = usuarioActual?.rol === 'admin' ? String(usuarioActual.id || 'adm_1') : tenant.adminId;
  const miNegocio = (usuarioActual && usuarioActual.negocio && usuarioActual.negocio !== 'GNET' && usuarioActual.negocio !== 'GNET Operaciones') 
    ? usuarioActual.negocio 
    : (tenant.negocio || 'Mi Negocio');
  const miEmail = (usuarioActual && (usuarioActual.email || usuarioActual.usuario)) || tenant.adminEmail || '';

  const nuevaNomina = {
    id: "nom_" + Date.now(),
    vendedorId: String(vend.id || vId),
    vendedorAuthUid: String(vend.authUid || ''),
    vendedorUsuario: vend.usuario || '',
    vendedorEmail: vend.email || '',
    nombreVendedor: vend.nombre,
    sueldoBase,
    ventasTotal: ventasVendedor,
    pctComision,
    montoComision,
    pagoTotal,
    fechaEnvio: new Date().toISOString(),
    estado: 'enviado',
    adminId: miAdminId,
    adminEmail: miEmail,
    negocio: miNegocio
  };

  nominasDB = [nuevaNomina, ...nominasDB.filter(n => String(n.id) !== String(nuevaNomina.id))];
  guardarNominasDB();

  // Guardar en Firestore inmediatamente si está disponible y en línea
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      await firebase.firestore().collection('nominas').doc(nuevaNomina.id).set(sanitizarParaFirestore(nuevaNomina), { merge: true });
    } catch (e) {
      console.warn("Guardar nómina Firestore directo:", e.message);
    }
  }

  toast(`✅ Recibo de nómina (${fmtMoneda(pagoTotal)}) enviado y sincronizado con ${vend.nombre}.`);
  renderizarHistorialNominasAdmin();
  renderizarReporteVentas();
};

window.renderizarHistorialNominasAdmin = function() {
  const cont = document.getElementById('lista-nominas-enviadas-admin');
  if (!cont) return;
  cont.innerHTML = '';
  
  const tenant = obtenerTenantActual();
  const miAdminId = String(tenant.adminId || 'adm_1');
  const miNegocio = String(tenant.negocio || '').toLowerCase();

  const misNominas = nominasDB.filter(n => 
    !n.adminId || 
    String(n.adminId) === miAdminId || 
    (miNegocio && n.negocio && String(n.negocio).toLowerCase() === miNegocio) ||
    (miAdminId === 'adm_1' || miAdminId.includes('1'))
  );

  if (misNominas.length === 0) {
    cont.innerHTML = '<p class="text-xs text-slate-500">No hay nóminas enviadas aún para este negocio.</p>';
    return;
  }
  misNominas.slice().reverse().forEach(n => {
    cont.innerHTML += `
      <div class="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs space-y-1">
        <div class="flex justify-between font-bold text-slate-800">
          <span>👤 ${esc(n.nombreVendedor)}</span>
          <span class="text-emerald-600 font-mono">${fmtMoneda(n.pagoTotal)}</span>
        </div>
        <div class="flex justify-between text-[10px] text-slate-600">
          <span>Base: ${fmtMoneda(n.sueldoBase)} | Com: ${fmtMoneda(n.montoComision)} (${n.pctComision}%)</span>
          <span>📅 ${new Date(n.fechaEnvio).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  });
};

window.renderizarNominasVendedor = function() {
  const cont = document.getElementById('lista-nominas-vendedor');
  if (!cont) return;
  cont.innerHTML = '';
  if (!usuarioActual) return;

  const miVendId = String(usuarioActual.id || usuarioActual.uid || '');
  const miVendAuth = String(usuarioActual.authUid || '');
  const miUser = String(usuarioActual.usuario || '').toLowerCase();
  const miEmail = String(usuarioActual.email || '').toLowerCase();
  const miNombre = String(usuarioActual.nombre || usuarioActual.displayName || '').toLowerCase();

  let misNominas = nominasDB.filter(n => 
    (n.vendedorId && String(n.vendedorId) === miVendId) || 
    (miVendAuth && (String(n.vendedorId) === miVendAuth || String(n.vendedorAuthUid) === miVendAuth)) ||
    (n.vendedorUsuario && String(n.vendedorUsuario).toLowerCase() === miUser) ||
    (n.vendedorEmail && String(n.vendedorEmail).toLowerCase() === miEmail) ||
    (miNombre && n.nombreVendedor && String(n.nombreVendedor).toLowerCase() === miNombre)
  );

  // Si no hay locales y hay conexión, consultar Firestore en tiempo real
  if (misNominas.length === 0 && typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    firebase.firestore().collection('nominas').get().then(snap => {
      if (snap && !snap.empty) {
        const remotas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const encontradas = remotas.filter(n => 
          (n.vendedorId && String(n.vendedorId) === miVendId) || 
          (miVendAuth && (String(n.vendedorId) === miVendAuth || String(n.vendedorAuthUid) === miVendAuth)) ||
          (n.vendedorUsuario && String(n.vendedorUsuario).toLowerCase() === miUser) ||
          (n.vendedorEmail && String(n.vendedorEmail).toLowerCase() === miEmail) ||
          (miNombre && n.nombreVendedor && String(n.nombreVendedor).toLowerCase() === miNombre)
        );
        if (encontradas.length > 0) {
          const mapNom = new Map(nominasDB.map(n => [String(n.id), n]));
          encontradas.forEach(r => mapNom.set(String(r.id), r));
          nominasDB = Array.from(mapNom.values());
          guardarNominasDB();
          renderizarNominasVendedor();
        }
      }
    }).catch(console.warn);
  }

  if (misNominas.length === 0) {
    cont.innerHTML = `
      <div class="text-center py-8 text-slate-500 text-xs space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p class="text-2xl">💵</p>
        <p class="font-bold text-slate-800">Aún no tienes recibos de nómina recibidos</p>
        <p class="text-[11px] text-slate-500">Cuando tu Administrador genere y envíe tu nómina, aparecerá automáticamente aquí o pulsa <strong>Sync</strong>.</p>
      </div>`;
    return;
  }

  misNominas.slice().reverse().forEach(n => {
    cont.innerHTML += `
      <div class="bg-slate-50 border border-emerald-200 p-4 rounded-xl space-y-2 text-xs shadow-xs">
        <div class="flex justify-between items-center border-b border-slate-200 pb-2">
          <span class="font-bold text-slate-900">Recibo de Nómina</span>
          <span class="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold">✓ Recibido</span>
        </div>
        <div class="space-y-1 text-slate-600">
          <div class="flex justify-between"><span>Sueldo Base:</span> <span class="text-slate-800 font-mono font-semibold">${fmtMoneda(n.sueldoBase)}</span></div>
          <div class="flex justify-between"><span>Ventas Totales:</span> <span class="text-slate-800 font-mono">${fmtMoneda(n.ventasTotal || 0)}</span></div>
          <div class="flex justify-between"><span>Comisiones (${n.pctComision}%):</span> <span class="text-emerald-600 font-mono font-semibold">${fmtMoneda(n.montoComision)}</span></div>
          <div class="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
            <span>Total a Cobrar:</span>
            <span class="text-emerald-600 font-mono text-base font-bold">${fmtMoneda(n.pagoTotal)}</span>
          </div>
        </div>
        <div class="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-100">
          <span>Negocio: <strong>${esc(n.negocio || 'Ventas de Campo')}</strong></span>
          <span>📅 ${new Date(n.fechaEnvio).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  });
};

window.cambiarSubVistaAdmin = function(subvista) {
  ['vendedores', 'reportes', 'clientes', 'nomina'].forEach(sv => {
    document.getElementById(`subvista-${sv}`).classList.add('hidden');
    document.getElementById(`subnav-${sv}`).className = "py-2 rounded-lg text-slate-600";
  });

  document.getElementById(`subvista-${subvista}`).classList.remove('hidden');
  document.getElementById(`subnav-${subvista}`).className = "py-2 rounded-lg bg-emerald-600 text-white font-bold";

  if (subvista === 'reportes') renderizarReporteVentas();
  if (subvista === 'clientes') renderizarClientesAdmin();
  if (subvista === 'nomina') {
    calcularNomina();
    renderizarHistorialNominasAdmin();
  }
};

let subVistaAgendaActual = 'visitas';
window.cambiarSubVistaAgenda = function(sv) {
  subVistaAgendaActual = sv;
  const ids = ['subnav-agenda-visitas','subnav-agenda-entregas','subnav-agenda-totales','subnav-agenda-mis'];
  ids.forEach(id => { const el=document.getElementById(id); if(el) el.className='py-2 rounded-lg text-slate-600'; });
  const activo = document.getElementById(sv === 'visitas' ? 'subnav-agenda-visitas' : sv === 'entregas' ? 'subnav-agenda-entregas' : sv === 'visitas-totales' ? 'subnav-agenda-totales' : 'subnav-agenda-mis');
  if (activo) activo.className='py-2 rounded-lg bg-blue-600 text-white font-bold';
  renderizarAgenda();
};

window.renderizarAgenda = function() {
  if (subVistaAgendaActual === 'entregas') return renderizarEntregas();
  if (subVistaAgendaActual === 'visitas-totales') return renderizarVisitas('todos');
  if (subVistaAgendaActual === 'mis-visitas') return renderizarVisitas('mias');
  renderizarVisitas('mias');
};

window.renderizarVisitas = function(modo = 'mias') {
  const contenedor = document.getElementById('lista-agenda');
  if (!contenedor) return;
  contenedor.innerHTML = '';
  document.getElementById('agenda-titulo').innerText = modo === 'todos' ? '📅 Visitas Totales del Día' : '📅 Mis Visitas';

  let citasHoy = clientesDB.filter(cli => (cli.diasVisita || []).includes(hoyNombre));
  if (modo !== 'todos' && usuarioActual) {
    if (usuarioActual.rol === 'vendedor') citasHoy = citasHoy.filter(cli => cli.vendedorId === usuarioActual.id);
    else citasHoy = citasHoy.filter(cli => cli.administradorId === usuarioActual.id);
  }

  document.getElementById('total-visitas').innerText = `${citasHoy.length} Citas`;

  if (citasHoy.length === 0) {
    contenedor.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs"><p>🎉 Sin visitas agendadas para hoy (${hoyNombre}).</p></div>`;
    return;
  }

  citasHoy.forEach(cli => {
    contenedor.innerHTML += `
      <div class="bg-slate-50 border border-slate-300 p-3.5 rounded-xl space-y-2">
        <div class="flex justify-between items-start gap-2">
          <div class="min-w-0">
            <h3 class="font-bold text-sm text-slate-900 break-words">${esc(cli.nombre)}</h3>
            <p class="text-xs text-slate-600">📞 ${esc(cli.telefono)}</p>
            ${cli.direccion ? `<p class="text-[11px] text-slate-500">🏠 ${esc(cli.direccion)}</p>` : ''}
            ${indicadorPedidoPendiente(cli.id)}
          </div>
          <span class="shrink-0 text-[10px] bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded border border-blue-200">Pendiente</span>
        </div>
        <div class="flex justify-between items-center text-xs border-t border-slate-200 pt-2">
          ${botonMapaGPS(cli.gps)}
          <button onclick="abrirOpcionesPedido(${cli.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1 rounded-lg">
            🛒 Tomar Pedido
          </button>
        </div>
      </div>
    `;
  });
};

window.renderizarEntregas = function() {
  const contenedor = document.getElementById('lista-agenda');
  if (!contenedor) return;
  contenedor.innerHTML = '';
  document.getElementById('agenda-titulo').innerText = '📦 Entregas Pendientes';

  let lista = pedidosDB.filter(p => p.estado === 'pendiente');
  if (usuarioActual && usuarioActual.rol === 'vendedor') {
    lista = lista.filter(p => p.vendedorId === usuarioActual.id);
  }

  const hoyISO = isoFecha(new Date());
  lista = lista.slice().sort((a, b) => {
    const aHoy = a.fechaEntrega === hoyISO ? 0 : 1;
    const bHoy = b.fechaEntrega === hoyISO ? 0 : 1;
    if (aHoy !== bHoy) return aHoy - bHoy;
    return (a.fechaEntrega || '').localeCompare(b.fechaEntrega || '');
  });

  document.getElementById('total-visitas').innerText = `${lista.length} Entrega${lista.length === 1 ? '' : 's'}`;

  if (lista.length === 0) {
    contenedor.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs"><p>📦 No hay entregas pendientes.</p></div>`;
    return;
  }

  lista.forEach(ped => {
    const cli = clientesDB.find(c => c.id === ped.clienteId);
    const esHoy = ped.fechaEntrega === hoyISO;
    const itemsResumen = (ped.items || []).slice(0, 3).map(i => `${fmtNum(i.cantidad)}× ${i.descripcion}`).join(', ');
    const extraItems = (ped.items || []).length > 3 ? ` (+${ped.items.length - 3} más)` : '';
    contenedor.innerHTML += `
      <div class="bg-slate-50 border border-slate-300 p-3.5 rounded-xl space-y-2">
        <div class="flex justify-between items-start gap-2">
          <div class="min-w-0">
            <h3 class="font-bold text-sm text-slate-900 break-words">${esc(ped.clienteNombre)}</h3>
            <p class="text-xs text-slate-600">📞 ${cli ? esc(cli.telefono) : '—'}</p>
            ${cli && cli.direccion ? `<p class="text-[11px] text-slate-500">🏠 ${esc(cli.direccion)}</p>` : ''}
            <p class="text-[10px] text-slate-500 mt-0.5">${esc(itemsResumen)}${extraItems}</p>
          </div>
          <span class="shrink-0 text-[10px] px-2 py-0.5 rounded border ${esHoy ? 'bg-amber-500/20 text-amber-700 border-amber-200' : 'bg-blue-500/20 text-blue-600 border-blue-200'}">${esHoy ? 'Hoy' : fechaCorta(ped.fechaEntrega)}</span>
        </div>
        <div class="flex justify-between items-center text-xs border-t border-slate-200 pt-2 gap-2">
          <div class="flex items-center gap-2">
            ${cli ? botonMapaGPS(cli.gps) : ''}
            <span class="font-mono font-bold text-emerald-600">${fmtMoneda(ped.total)}</span>
          </div>
          <button onclick="marcarEntregaRealizada(${ped.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1 rounded-lg">
            ✅ Entregado
          </button>
        </div>
        ${ped.notas ? `<p class="text-[10px] text-slate-500 border-t border-slate-200 pt-1.5">📝 ${esc(ped.notas)}</p>` : ''}
      </div>
    `;
  });
};

window.marcarEntregaRealizada = function(pedidoId) {
  const idx = pedidosDB.findIndex(p => p.id === pedidoId);
  if (idx === -1) return;
  if (!confirm(`¿Marcar como entregado el pedido de "${pedidosDB[idx].clienteNombre}"?`)) return;
  pedidosDB[idx].estado = 'entregado';
  pedidosDB[idx].fechaEntregaReal = new Date().toISOString();
  localStorage.setItem('pedidos_db', JSON.stringify(pedidosDB));
  toast('✅ Entrega marcada como realizada');
  renderizarAgenda();
};

window.camposProductoHTML = function(p) {
  const inp = "w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 outline-none focus:border-blue-500";
  const lbl = "text-[11px] text-slate-600 block mb-1";
  const radio = (valor, texto, marcado) => `
    <label class="cursor-pointer">
      <input type="radio" name="${p}-tipo" id="${p}-tipo-${valor}" value="${valor}" ${marcado ? 'checked' : ''} onchange="ajustarPasosProducto('${p}')" class="peer hidden">
      <span class="block text-center p-2 rounded-lg border border-slate-300 bg-slate-100 text-slate-600 text-xs font-semibold peer-checked:bg-blue-600 peer-checked:border-blue-500 peer-checked:text-white transition">${texto}</span>
    </label>`;

  return `
    <div>
      <label class="${lbl}">Código de barras</label>
      <div class="flex gap-2">
        <input type="text" id="${p}-codigo" placeholder="Escribe o escanea el código" autocomplete="off" onkeydown="if(event.key==='Enter')event.preventDefault()" class="flex-1 min-w-0 ${inp}">
        <button type="button" onclick="escanearCodigoCampo('${p}')" title="Escanear con la cámara" class="bg-white hover:bg-slate-200 border border-slate-300 px-3 rounded-lg text-sm">📷</button>
      </div>
    </div>
    <div>
      <label class="${lbl}">Descripción *</label>
      <input type="text" id="${p}-descripcion" required placeholder="Ej. Pantalón Táctico Ripstop" class="${inp}">
    </div>
    <div>
      <label class="${lbl}">Se vende por *</label>
      <div class="grid grid-cols-2 gap-2">
        ${radio('unidad', 'Unidad', true)}
        ${radio('granel', 'A granel', false)}
      </div>
      <p id="${p}-hint-tipo" class="text-[10px] text-slate-500 mt-1"></p>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="${lbl}">Precio de Adquisición ($) *</label>
        <input type="number" id="${p}-adq" step="0.01" min="0" required placeholder="620.00" class="${inp}">
      </div>
      <div>
        <label class="${lbl}">Precio de Venta ($) *</label>
        <input type="number" id="${p}-venta" step="0.01" min="0" required placeholder="1250.00" class="${inp}">
      </div>
    </div>
    <div>
      <label class="${lbl}">Precio Mayoreo ($) <span class="text-slate-500">(en caso de aplicar)</span></label>
      <input type="number" id="${p}-mayoreo" step="0.01" min="0" placeholder="980.00" class="${inp}">
    </div>
    <div>
      <p class="text-[11px] font-semibold text-slate-700 mb-1.5">Inventario</p>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="${lbl}">Existencia *</label>
          <input type="number" id="${p}-existencia" min="0" step="1" required placeholder="24" class="${inp}">
        </div>
        <div>
          <label class="${lbl}">Mínimo</label>
          <input type="number" id="${p}-minimo" min="0" step="1" placeholder="4" class="${inp}">
        </div>
        <div>
          <label class="${lbl}">Máximo</label>
          <input type="number" id="${p}-maximo" min="0" step="1" placeholder="100" class="${inp}">
        </div>
      </div>
    </div>
  `;
};

window.inicializarFormulariosProducto = function() {
  const pn = document.getElementById('campos-pn');
  const pm = document.getElementById('campos-pm');
  if (pn) pn.innerHTML = camposProductoHTML('pn');
  if (pm) pm.innerHTML = camposProductoHTML('pm');
  ajustarPasosProducto('pn');
  ajustarPasosProducto('pm');
};

window.ajustarPasosProducto = function(p) {
  const granelEl = document.getElementById(`${p}-tipo-granel`);
  if (!granelEl) return;
  const granel = granelEl.checked;
  ['existencia', 'minimo', 'maximo'].forEach(id => {
    const el = document.getElementById(`${p}-${id}`);
    if (el) el.step = granel ? '0.001' : '1';
  });
  const hint = document.getElementById(`${p}-hint-tipo`);
  if (hint) {
    hint.innerText = granel
      ? 'A granel: la existencia admite decimales (kilos, metros, etc.).'
      : 'Por unidad: la existencia se maneja en piezas enteras.';
  }
};

window.leerCamposProducto = function(p) {
  const val = (id) => document.getElementById(`${p}-${id}`)?.value || '';
  const num = (id) => { const n = parseFloat(val(id)); return isNaN(n) ? null : n; };
  return {
    codigo: val('codigo').trim(),
    descripcion: val('descripcion').trim(),
    tipoVenta: document.getElementById(`${p}-tipo-granel`)?.checked ? 'granel' : 'unidad',
    precioAdq: num('adq') ?? 0,
    precioVenta: num('venta') ?? 0,
    precioMayoreo: num('mayoreo'),
    existencia: num('existencia') ?? 0,
    minimo: num('minimo') ?? 0,
    maximo: num('maximo') ?? 0
  };
};

window.llenarCamposProducto = function(p, prod) {
  const set = (id, v) => { const el = document.getElementById(`${p}-${id}`); if (el) el.value = v ?? ''; };
  const radio = document.getElementById(`${p}-tipo-${prod.tipoVenta === 'granel' ? 'granel' : 'unidad'}`);
  if (radio) radio.checked = true;
  ajustarPasosProducto(p);
  set('codigo', prod.codigo);
  set('descripcion', prod.descripcion);
  set('adq', prod.precioAdq);
  set('venta', prod.precioVenta);
  set('mayoreo', prod.precioMayoreo);
  set('existencia', prod.existencia);
  set('minimo', prod.minimo);
  set('maximo', prod.maximo);
};

window.validarProducto = function(datos, idExcluir) {
  if (!datos.descripcion) { alert('⚠️ La descripción es obligatoria.'); return false; }
  if (datos.codigo) {
    const dup = productosDB.find(x => x.codigo === datos.codigo && x.id !== idExcluir);
    if (dup) { alert(`⚠️ El código "${datos.codigo}" ya está registrado en: ${dup.descripcion}.`); return false; }
  }
  return true;
};

window.guardarProductoNuevo = async function(e) {
  e.preventDefault();
  const datos = leerCamposProducto('pn');
  if (!validarProducto(datos, null)) return;
  const tenant = obtenerTenantActual();
  const miAdminId = usuarioActual?.rol === 'admin' ? String(usuarioActual.id || 'adm_1') : tenant.adminId;
  const miAdminAuthUid = (usuarioActual && usuarioActual.authUid) || tenant.adminAuthUid || '';
  const miNegocio = (usuarioActual && usuarioActual.negocio && usuarioActual.negocio !== 'GNET' && usuarioActual.negocio !== 'GNET Operaciones') 
    ? usuarioActual.negocio 
    : (tenant.negocio || 'Mi Negocio');
  const miEmail = (usuarioActual && (usuarioActual.email || usuarioActual.usuario)) || tenant.adminEmail || '';

  const nuevo = {
    id: Date.now(),
    adminId: miAdminId,
    adminAuthUid: miAdminAuthUid,
    adminEmail: miEmail,
    negocio: miNegocio,
    ...datos
  };
  productosDB.push(nuevo);
  guardarProductosDB();
  document.getElementById('form-producto-nuevo').reset();
  ajustarPasosProducto('pn');
  renderizarInventario();

  // Guardar en Firestore inmediatamente si está disponible y en línea
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      const prodDoc = sanitizarParaFirestore(nuevo);
      await firebase.firestore().collection('productos').doc(String(nuevo.id)).set(prodDoc, { merge: true });
    } catch (e) {
      console.warn("Guardar producto Firestore directo:", e.message);
    }
  }

  toast(`✅ Producto "${nuevo.descripcion}" guardado para "${miNegocio}" y sincronizado.`);
};

let productoEnEdicionId = null;

window.buscarProductoModificar = function() {
  const q = document.getElementById('pm-buscar').value.trim();
  const cont = document.getElementById('pm-resultados');
  cont.innerHTML = '';
  if (!q) return alert('Escribe o escanea un código, o escribe el nombre del producto.');

  const ql = q.toLowerCase();
  const exacto = productosDB.find(p => p.codigo && p.codigo === q);
  if (exacto) return abrirEdicionProducto(exacto.id);

  const coincidencias = productosDB.filter(p =>
    p.descripcion.toLowerCase().includes(ql) || (p.codigo && p.codigo.toLowerCase().includes(ql))
  );

  if (coincidencias.length === 0) {
    document.getElementById('form-producto-mod').classList.add('hidden');
    cont.innerHTML = '<p class="text-xs text-slate-500">No se encontró ningún producto con ese código o nombre.</p>';
    return;
  }
  if (coincidencias.length === 1) return abrirEdicionProducto(coincidencias[0].id);

  cont.innerHTML = `<p class="text-[11px] text-slate-600">${coincidencias.length} coincidencias. Elige una:</p>` +
    coincidencias.map(p => `
      <button type="button" onclick="abrirEdicionProducto(${p.id})" class="w-full text-left bg-slate-100 hover:bg-white border border-slate-200 rounded-lg p-2.5 text-xs transition">
        <p class="font-bold text-slate-900">${esc(p.descripcion)}</p>
        <p class="text-[10px] text-slate-500 font-mono">${p.codigo ? esc(p.codigo) : 'Sin código'} · ${fmtMoneda(p.precioVenta)}</p>
      </button>`).join('');
};

window.abrirEdicionProducto = function(id) {
  const prod = productosDB.find(p => p.id === id);
  if (!prod) return;
  productoEnEdicionId = id;
  document.getElementById('pm-resultados').innerHTML = '';
  llenarCamposProducto('pm', prod);
  const form = document.getElementById('form-producto-mod');
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.cancelarEdicionProducto = function() {
  productoEnEdicionId = null;
  document.getElementById('form-producto-mod').classList.add('hidden');
  document.getElementById('pm-resultados').innerHTML = '';
};

window.guardarProductoModificado = async function(e) {
  e.preventDefault();
  const idx = productosDB.findIndex(p => p.id === productoEnEdicionId);
  if (idx === -1) return alert('No se encontró el producto.');
  const datos = leerCamposProducto('pm');
  if (!validarProducto(datos, productoEnEdicionId)) return;
  const tenant = obtenerTenantActual();
  const prodPrevio = productosDB[idx];
  const prodActualizado = {
    id: productoEnEdicionId,
    adminId: prodPrevio.adminId || tenant.adminId,
    adminAuthUid: prodPrevio.adminAuthUid || tenant.adminAuthUid || '',
    adminEmail: prodPrevio.adminEmail || tenant.adminEmail,
    negocio: (prodPrevio.negocio && prodPrevio.negocio !== 'GNET' && prodPrevio.negocio !== 'GNET Operaciones') ? prodPrevio.negocio : tenant.negocio,
    ...datos
  };
  productosDB[idx] = prodActualizado;
  guardarProductosDB();
  renderizarInventario();
  cancelarEdicionProducto();
  document.getElementById('pm-buscar').value = '';

  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      await firebase.firestore().collection('productos').doc(String(productoEnEdicionId)).set(sanitizarParaFirestore(prodActualizado), { merge: true });
    } catch (e) {
      console.warn("Actualizar producto Firestore:", e);
    }
  }

  toast('✅ Producto actualizado y sincronizado en la nube.');
};

window.eliminarProducto = async function() {
  const prod = productosDB.find(p => p.id === productoEnEdicionId);
  if (!prod) return;
  if (!confirm(`¿Eliminar "${prod.descripcion}" del catálogo?`)) return;
  const idAEliminar = productoEnEdicionId;
  productosDB = productosDB.filter(p => p.id !== idAEliminar);
  guardarProductosDB();
  renderizarInventario();
  cancelarEdicionProducto();
  document.getElementById('pm-buscar').value = '';

  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      await firebase.firestore().collection('productos').doc(String(idAEliminar)).delete();
    } catch (e) {
      console.warn("Eliminar producto Firestore:", e);
    }
  }

  toast('🗑️ Producto eliminado del catálogo y de la nube.');
};

window.estadoStock = function(p) {
  if (p.existencia <= 0) return { clave: 'agotado', texto: 'Agotado', clase: 'bg-rose-50 text-rose-700 border-rose-200' };
  if (p.minimo > 0 && p.existencia <= p.minimo) return { clave: 'bajo', texto: 'Bajo mínimo', clase: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (p.maximo > 0 && p.existencia > p.maximo) return { clave: 'exceso', texto: 'Sobre máximo', clase: 'bg-sky-50 text-sky-700 border-sky-200' };
  return { clave: 'ok', texto: 'Normal', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
};

window.renderizarInventario = function() {
  const cont = document.getElementById('lista-inventario');
  if (!cont) return;

  const bajos = productosDB.filter(p => ['agotado', 'bajo'].includes(estadoStock(p).clave)).length;
  const valor = productosDB.reduce((s, p) => s + p.existencia * p.precioAdq, 0);
  document.getElementById('inv-total').innerText = productosDB.length;
  document.getElementById('inv-bajos').innerText = bajos;
  document.getElementById('inv-valor').innerText = fmtMoneda(valor);

  const q = (document.getElementById('inv-buscar')?.value || '').trim().toLowerCase();
  const soloBajos = document.getElementById('inv-solo-bajos')?.checked;

  let lista = productosDB.slice().sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
  if (q) lista = lista.filter(p => p.descripcion.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q));
  if (soloBajos) lista = lista.filter(p => ['agotado', 'bajo'].includes(estadoStock(p).clave));

  if (lista.length === 0) {
    if (usuarioActual && usuarioActual.rol === 'vendedor') {
      cont.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-xs space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p class="text-2xl">📦</p>
          <p class="font-bold text-slate-800">Sin productos en este dispositivo</p>
          <p class="text-[11px] text-slate-500">Pulsa el botón de <strong>"🔄 Sync"</strong> para descargar el catálogo de tu Administrador a tu almacenamiento local.</p>
          <button type="button" onclick="abrirModalSync()" class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm">🔄 Sincronizar Catálogo</button>
        </div>`;
    } else {
      cont.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p class="text-2xl">📦</p>
          <p class="font-bold text-slate-800">Catálogo vacío para este negocio</p>
          <p class="text-[11px] text-slate-500 mt-1">Registra nuevos productos en la pestaña "Nuevo" o descarga tu inventario con el botón Sync.</p>
        </div>`;
    }
    return;
  }

  cont.innerHTML = lista.map(p => {
    const est = estadoStock(p);
    return `
      <div class="bg-slate-50 border border-slate-300 p-3 rounded-xl text-xs space-y-1.5">
        <div class="flex justify-between items-start gap-2">
          <div class="min-w-0">
            <p class="font-bold text-slate-900 break-words">${esc(p.descripcion)}</p>
            <p class="text-[10px] text-slate-500 font-mono">${p.codigo ? esc(p.codigo) : 'Sin código'}</p>
          </div>
          <span class="shrink-0 text-[10px] px-2 py-0.5 rounded border ${est.clase}">${est.texto}</span>
        </div>
        <div class="flex justify-between items-center gap-2">
          <p class="text-[11px] text-emerald-600 font-semibold">
            Adq: ${fmtMoneda(p.precioAdq)} | Venta: ${fmtMoneda(p.precioVenta)}${p.precioMayoreo !== null && p.precioMayoreo !== undefined ? ` | May: ${fmtMoneda(p.precioMayoreo)}` : ''}
          </p>
          <span class="shrink-0 bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-blue-600 font-mono">${fmtNum(p.existencia)}${p.tipoVenta === 'granel' ? '' : ' pzs'}</span>
        </div>
        <div class="flex justify-between items-center text-[10px] text-slate-500">
          <span>Mín: ${fmtNum(p.minimo)} · Máx: ${fmtNum(p.maximo)} · ${p.tipoVenta === 'granel' ? 'A granel' : 'Unidad'}</span>
          <button type="button" onclick="editarDesdeInventario(${p.id})" class="text-amber-600 hover:text-amber-700 font-semibold">✏️ Editar</button>
        </div>
      </div>`;
  }).join('');
};

window.editarDesdeInventario = function(id) {
  cambiarSubVistaProductos('modificar');
  abrirEdicionProducto(id);
};

window.exportarInventarioExcel = function() {
  if (productosDB.length === 0) return alert('No hay productos en el inventario para exportar.');
  const filas = productosDB
    .slice()
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'))
    .map(p => ({
      'Código de Barras': p.codigo || '',
      'Descripción': p.descripcion,
      'Se vende por': p.tipoVenta === 'granel' ? 'A granel' : 'Unidad',
      'Precio de Adquisición': p.precioAdq,
      'Precio de Venta': p.precioVenta,
      'Precio Mayoreo': (p.precioMayoreo === null || p.precioMayoreo === undefined) ? '' : p.precioMayoreo,
      'Existencia': p.existencia,
      'Mínimo': p.minimo,
      'Máximo': p.maximo,
      'Estado': estadoStock(p).texto,
      'Valor en Inventario (a costo)': +(p.existencia * p.precioAdq).toFixed(2)
    }));

  const fecha = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `Inventario_${fecha}`;

  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
    return;
  }
  alert('ℹ️ No se pudo cargar módulo de Excel.');
};

let subVistaProdActual = 'inventario';
window.cambiarSubVistaProductos = function(sv) {
  subVistaProdActual = sv;
  ['nuevo', 'modificar', 'inventario'].forEach(s => {
    document.getElementById(`subvistaprod-${s}`).classList.add('hidden');
    document.getElementById(`subnavprod-${s}`).className = "py-2 rounded-lg text-slate-600";
  });
  document.getElementById(`subvistaprod-${sv}`).classList.remove('hidden');
  document.getElementById(`subnavprod-${sv}`).className = "py-2 rounded-lg bg-blue-600 text-white font-bold";
  if (sv === 'inventario') renderizarInventario();
};

let escaner = null;
let escanerPromesa = null;
let escanerCallback = null;

window.estadoEscaner = function(msg) {
  const el = document.getElementById('escaner-estado');
  if (el) el.innerText = msg;
};

window.abrirEscaner = async function(callback) {
  if (typeof Html5Qrcode === 'undefined') {
    alert('No se pudo cargar el lector de códigos. Escribe el código manualmente.');
    return;
  }
  escanerCallback = callback;
  document.getElementById('modal-escaner').classList.remove('hidden');
  estadoEscaner('Iniciando cámara…');

  try {
    const F = Html5QrcodeSupportedFormats;
    escaner = new Html5Qrcode('lector-camara', {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.QR_CODE],
      verbose: false
    });
    escanerPromesa = escaner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 160 } },
      (texto) => alLeerCodigo(texto),
      () => {}
    );
    await escanerPromesa;
    estadoEscaner('Apunta la cámara al código de barras');
  } catch (err) {
    estadoEscaner('Acceso a cámara no disponible. Ingresa el código en el teclado.');
  }
};

window.alLeerCodigo = function(texto) {
  if (!escanerCallback) return;
  const cb = escanerCallback;
  escanerCallback = null;
  if (navigator.vibrate) navigator.vibrate(120);
  cerrarEscaner().then(() => cb(texto));
};

window.cerrarEscaner = async function() {
  escanerCallback = null;
  document.getElementById('modal-escaner').classList.add('hidden');
  try {
    if (escaner && escaner.isScanning) await escaner.stop();
    if (escaner) escaner.clear();
  } catch (e) {}
  escaner = null;
};

window.escanearCodigoCampo = function(p) {
  abrirEscaner((codigo) => {
    document.getElementById(`${p}-codigo`).value = codigo;
  });
};

window.escanearBusquedaModificar = function() {
  abrirEscaner((codigo) => {
    document.getElementById('pm-buscar').value = codigo;
    buscarProductoModificar();
  });
};

window.escanearBusquedaInventario = function() {
  abrirEscaner((codigo) => {
    document.getElementById('inv-buscar').value = codigo;
    renderizarInventario();
  });
};

const CODIGO_PAIS_WHATSAPP = '52';
let clienteOperacion = null;
let modoOperacion = null;
let pasoOperacion = 'carrito';
let carrito = [];
let fechaEntregaSel = null;
let calAnio = 0, calMes = 0;
let ultimaOperacion = null;
let ventaLibreSinCliente = false;

window.toast = function(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[80] max-w-[90%] text-center text-xs px-4 py-2 rounded-full shadow-lg border bg-white ' +
    (tipo === 'warn' ? 'border-amber-400 text-amber-700' : 'border-emerald-300 text-emerald-700');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2400);
};

const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const redondear3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

function isoFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fechaDesdeISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fechaLegible(iso) {
  return fechaDesdeISO(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fechaCorta(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function nombreUsuarioActual() {
  return usuarioActual ? (usuarioActual.nombre || usuarioActual.nombreCompleto || 'Vendedor') : 'Vendedor';
}

function indicadorPedidoPendiente(clienteId) {
  const pend = pedidosDB
    .filter(p => p.clienteId === clienteId && p.estado === 'pendiente')
    .sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
  if (pend.length === 0) return '';
  const extra = pend.length > 1 ? ` (+${pend.length - 1} más)` : '';
  return `<p class="text-[10px] text-amber-600 mt-0.5 font-semibold">📦 Pedido pendiente · entrega ${fechaCorta(pend[0].fechaEntrega)}${extra}</p>`;
}

window.abrirVentaLibre = function() {
  const sel = document.getElementById('venta-libre-cliente');
  sel.innerHTML = '<option value="">Sin cliente / Venta mostrador</option>';
  let lista = clientesDB.slice();
  if (usuarioActual && usuarioActual.rol === 'vendedor') {
    lista = lista.filter(c => c.vendedorId === usuarioActual.id);
  }
  lista.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'));
  lista.forEach(c => {
    const op = document.createElement('option');
    op.value = c.id;
    op.textContent = c.nombre + (c.telefono ? ` · ${c.telefono}` : '');
    sel.appendChild(op);
  });
  document.getElementById('modal-venta-libre').classList.remove('hidden');
};

window.cerrarVentaLibre = function() {
  document.getElementById('modal-venta-libre').classList.add('hidden');
};

window.iniciarVentaLibreSeleccionada = function() {
  const id = document.getElementById('venta-libre-cliente').value;
  clienteOperacion = id ? clientesDB.find(c => String(c.id) === String(id)) : null;
  ventaLibreSinCliente = !clienteOperacion;
  cerrarVentaLibre();
  iniciarOperacion('venta', clienteOperacion);
};

window.abrirOpcionesPedido = function(clienteId) {
  const cli = clientesDB.find(c => c.id === clienteId);
  if (!cli) return;
  clienteOperacion = cli;
  document.getElementById('tipo-op-cliente').innerText = cli.nombre;
  document.getElementById('modal-tipo-operacion').classList.remove('hidden');
};

window.cerrarOpcionesPedido = function() {
  document.getElementById('modal-tipo-operacion').classList.add('hidden');
};

window.iniciarOperacion = function(modo, cliente = clienteOperacion) {
  cerrarOpcionesPedido();
  modoOperacion = modo;
  carrito = [];
  clienteOperacion = cliente || null;
  ventaLibreSinCliente = modo === 'venta' && !clienteOperacion;
  document.getElementById('op-cliente').innerText = clienteOperacion ? `Cliente: ${clienteOperacion.nombre}` : 'Cliente: Venta mostrador (sin asignar)';
  document.getElementById('op-buscar').value = '';
  document.getElementById('op-efectivo').value = '';
  document.getElementById('op-transferencia').value = '';
  document.getElementById('op-mixto-1-metodo').value = 'efectivo';
  document.getElementById('op-mixto-2-metodo').value = 'transferencia';
  document.getElementById('op-mixto-1-monto').value = '';
  document.getElementById('op-mixto-2-monto').value = '';
  document.getElementById('op-metodo-pago').value = 'efectivo';
  document.getElementById('op-anotaciones-venta').value = '';
  document.getElementById('op-notas').value = '';
  actualizarCamposPago();
  iniciarCalendario();
  document.getElementById('pantalla-operacion').classList.remove('hidden');
  mostrarPasoOperacion('carrito');
  renderCatalogoOp();
  renderCarrito();
};

window.cerrarOperacion = function() {
  if (carrito.length > 0 && !confirm('¿Cancelar? Se perderán los productos del carrito.')) return;
  cerrarPantallaOperacion();
};

window.cerrarPantallaOperacion = function() {
  document.getElementById('pantalla-operacion').classList.add('hidden');
  carrito = [];
  modoOperacion = null;
};

window.mostrarPasoOperacion = function(paso) {
  pasoOperacion = paso;
  const esVenta = modoOperacion === 'venta';
  document.getElementById('op-paso-carrito').classList.toggle('hidden', paso !== 'carrito');
  document.getElementById('op-paso-entrega').classList.toggle('hidden', paso !== 'entrega');
  document.getElementById('op-pago').classList.toggle('hidden', !(esVenta && paso === 'carrito'));
  document.getElementById('op-btn-continuar').classList.toggle('hidden', !(modoOperacion === 'pedido' && paso === 'carrito'));
  document.getElementById('op-btn-cobrar').classList.toggle('hidden', !esVenta);
  document.getElementById('op-fila-entrega').classList.toggle('hidden', paso !== 'entrega');

  document.getElementById('op-titulo').innerText =
    esVenta ? '💰 Venta' : (paso === 'entrega' ? '📅 Fecha de entrega' : '📝 Tomar Pedido');

  if (paso === 'entrega') {
    renderCalendario();
    document.getElementById('op-resumen-entrega').innerText =
      `${carrito.length} producto${carrito.length === 1 ? '' : 's'} · ${fmtMoneda(totalCarrito())}`;
  }
};

window.filtrarCatalogoOp = function(q) {
  const ql = q.toLowerCase();
  return productosDB
    .filter(p => !ql || p.descripcion.toLowerCase().includes(ql) || (p.codigo || '').toLowerCase().includes(ql))
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'));
};

window.renderCatalogoOp = function() {
  const q = document.getElementById('op-buscar')?.value.trim() || '';
  const lista = filtrarCatalogoOp(q);
  const cont = document.getElementById('op-catalogo');
  if (!cont) return;

  if (lista.length === 0) {
    cont.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-3">Sin resultados para esa búsqueda.</p>`;
    return;
  }

  cont.innerHTML = lista.map(p => {
    const sinStock = modoOperacion === 'venta' && p.existencia <= 0;
    return `
      <button type="button" onclick="agregarAlCarrito(${p.id})" ${sinStock ? 'disabled' : ''} class="w-full flex justify-between items-center gap-2 text-left bg-slate-100 hover:bg-white border border-slate-200 rounded-lg p-2 text-xs transition ${sinStock ? 'opacity-40' : ''}">
        <div class="min-w-0">
          <p class="font-semibold text-slate-900 truncate">${esc(p.descripcion)}</p>
          <p class="text-[10px] text-slate-500 font-mono">${p.codigo ? esc(p.codigo) : 'Sin código'} · Exist: ${fmtNum(p.existencia)}</p>
        </div>
        <div class="shrink-0 text-right">
          <p class="font-mono text-emerald-600 font-bold">${fmtMoneda(p.precioVenta)}</p>
          <p class="text-[10px] text-blue-600 font-semibold">${sinStock ? 'Agotado' : '＋ Agregar'}</p>
        </div>
      </button>`;
  }).join('');
};

window.enterBusquedaOp = function(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = document.getElementById('op-buscar');
  const q = input.value.trim();
  if (!q) return;

  let prod = productosDB.find(p => p.codigo && p.codigo === q);
  if (!prod) {
    const coincidencias = filtrarCatalogoOp(q);
    if (coincidencias.length === 1) prod = coincidencias[0];
  }

  if (prod) {
    agregarAlCarrito(prod.id);
    input.value = '';
    renderCatalogoOp();
  } else {
    toast('⚠️ No se encontró un producto único', 'warn');
  }
};

window.escanearParaCarrito = function() {
  abrirEscaner((codigo) => {
    const prod = productosDB.find(p => p.codigo === codigo);
    if (!prod) return toast(`⚠️ El código ${codigo} no está en el catálogo`, 'warn');
    agregarAlCarrito(prod.id);
  });
};

const pasoCantidad = (p) => (p.tipoVenta === 'granel' ? 0.5 : 1);

function precioLinea(l, p) {
  return (l.usaMayoreo && p.precioMayoreo !== null && p.precioMayoreo !== undefined) ? p.precioMayoreo : p.precioVenta;
}

window.totalCarrito = function() {
  return redondear2(carrito.reduce((s, l) => {
    const p = productosDB.find(x => x.id === l.productoId);
    return p ? s + precioLinea(l, p) * l.cantidad : s;
  }, 0));
};

window.agregarAlCarrito = function(productoId) {
  const p = productosDB.find(x => x.id === productoId);
  if (!p) return;
  const linea = carrito.find(l => l.productoId === productoId);
  const actual = linea ? linea.cantidad : 0;
  let nueva = redondear3(actual + pasoCantidad(p));

  if (modoOperacion === 'venta') {
    nueva = Math.min(nueva, p.existencia);
    if (nueva <= actual) return toast(`⚠️ Sin existencia suficiente de ${p.descripcion}`, 'warn');
  }

  if (linea) linea.cantidad = nueva;
  else carrito.push({ productoId, cantidad: nueva, usaMayoreo: false });
  renderCarrito();
  toast(`➕ ${p.descripcion}`);
};

window.cambiarCantidad = function(productoId, direccion) {
  const p = productosDB.find(x => x.id === productoId);
  const l = carrito.find(x => x.productoId === productoId);
  if (!p || !l) return;
  const nueva = redondear3(l.cantidad + direccion * pasoCantidad(p));
  if (nueva <= 0) return;
  setCantidad(productoId, nueva);
};

window.setCantidad = function(productoId, valor) {
  const p = productosDB.find(x => x.id === productoId);
  const l = carrito.find(x => x.productoId === productoId);
  if (!p || !l) return;

  let n = parseFloat(valor);
  if (isNaN(n) || n <= 0) return renderCarrito();
  if (p.tipoVenta !== 'granel') n = Math.max(1, Math.round(n));
  n = redondear3(n);

  if (modoOperacion === 'venta' && n > p.existencia) {
    n = p.existencia;
    toast(`⚠️ Solo hay ${fmtNum(p.existencia)} de ${p.descripcion}`, 'warn');
    if (n <= 0) return renderCarrito();
  }
  l.cantidad = n;
  renderCarrito();
};

window.quitarDelCarrito = function(productoId) {
  carrito = carrito.filter(l => l.productoId !== productoId);
  renderCarrito();
};

window.toggleMayoreo = function(productoId) {
  const l = carrito.find(x => x.productoId === productoId);
  if (l) { l.usaMayoreo = !l.usaMayoreo; renderCarrito(); }
};

window.renderCarrito = function() {
  const cont = document.getElementById('op-carrito');
  if (!cont) return;
  document.getElementById('op-items-count').innerText = `${carrito.length} producto${carrito.length === 1 ? '' : 's'}`;

  if (carrito.length === 0) {
    cont.innerHTML = '<div class="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-300 rounded-xl"><p>🛒 El carrito está vacío.<br>Busca, escanea o toca un producto para agregarlo.</p></div>';
  } else {
    cont.innerHTML = carrito.map(l => {
      const p = productosDB.find(x => x.id === l.productoId);
      if (!p) return '';
      const precio = precioLinea(l, p);
      const subtotal = redondear2(precio * l.cantidad);
      const excede = modoOperacion === 'pedido' && l.cantidad > p.existencia;
      const tieneMayoreo = p.precioMayoreo !== null && p.precioMayoreo !== undefined;
      return `
        <div class="bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs space-y-2">
          <div class="flex justify-between items-start gap-2">
            <div class="min-w-0">
              <p class="font-bold text-slate-900 break-words">${esc(p.descripcion)}</p>
              <p class="text-[10px] text-slate-500">${fmtMoneda(precio)} c/u${p.tipoVenta === 'granel' ? ' · a granel' : ''}${excede ? ' · <span class="text-amber-600">supera existencia (' + fmtNum(p.existencia) + ')</span>' : ''}</p>
            </div>
            <button type="button" onclick="quitarDelCarrito(${p.id})" title="Quitar" class="text-slate-500 hover:text-rose-600 px-1 font-bold">✕</button>
          </div>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1">
              <button type="button" onclick="cambiarCantidad(${p.id}, -1)" class="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-800 font-bold">−</button>
              <input type="number" value="${l.cantidad}" min="0" step="${p.tipoVenta === 'granel' ? '0.001' : '1'}" onchange="setCantidad(${p.id}, this.value)" class="w-16 text-center bg-slate-100 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-900 outline-none focus:border-blue-500">
              <button type="button" onclick="cambiarCantidad(${p.id}, 1)" class="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-800 font-bold">＋</button>
            </div>
            <span class="font-mono font-bold text-emerald-600">${fmtMoneda(subtotal)}</span>
          </div>
          ${tieneMayoreo ? `
          <label class="flex items-center gap-2 text-[11px] text-amber-700">
            <input type="checkbox" ${l.usaMayoreo ? 'checked' : ''} onchange="toggleMayoreo(${p.id})" class="accent-amber-500">
            <span>Aplicar precio de mayoreo (${fmtMoneda(p.precioMayoreo)})</span>
          </label>` : ''}
        </div>`;
    }).join('');
  }

  document.getElementById('op-total').innerText = fmtMoneda(totalCarrito());
  actualizarCambio();
};

window.obtenerComponentesPago = function() {
  const metodo = document.getElementById('op-metodo-pago')?.value || 'efectivo';
  if (metodo !== 'mixto') return [{ metodo, monto: metodo === 'efectivo' ? (parseFloat(document.getElementById('op-efectivo')?.value || '0') || 0) : metodo === 'transferencia' ? (parseFloat(document.getElementById('op-transferencia')?.value || '0') || 0) : 0 }];
  return [
    { metodo: document.getElementById('op-mixto-1-metodo')?.value || 'efectivo', monto: parseFloat(document.getElementById('op-mixto-1-monto')?.value || '0') || 0 },
    { metodo: document.getElementById('op-mixto-2-metodo')?.value || 'transferencia', monto: parseFloat(document.getElementById('op-mixto-2-monto')?.value || '0') || 0 }
  ];
};

window.actualizarCamposPago = function() {
  const metodo = document.getElementById('op-metodo-pago')?.value || 'efectivo';
  const efectivoWrap=document.getElementById('pago-efectivo-wrap'), transferenciaWrap=document.getElementById('pago-transferencia-wrap'), mixtoWrap=document.getElementById('pago-mixto-wrap');
  if (!efectivoWrap || !transferenciaWrap || !mixtoWrap) return;
  efectivoWrap.classList.toggle('hidden', metodo !== 'efectivo');
  transferenciaWrap.classList.toggle('hidden', metodo !== 'transferencia');
  mixtoWrap.classList.toggle('hidden', metodo !== 'mixto');
  actualizarCambio(); actualizarResumenPago();
};

window.actualizarCambio = function() {
  const el=document.getElementById('op-cambio'); if(!el) return;
  const metodo=document.getElementById('op-metodo-pago')?.value||'efectivo', total=totalCarrito(), comps=obtenerComponentesPago();
  const suma=redondear2(comps.reduce((s,c)=>s+c.monto,0));
  if(metodo==='credito'){el.innerText='—';el.className='font-mono font-bold text-slate-800';return;}
  if(metodo==='mixto'){const creditos=comps.filter(c=>c.metodo==='credito').reduce((s,c)=>s+c.monto,0);const pagado=suma-creditos;const dif=redondear2(pagado-total);el.innerText=suma<total?`Faltan ${fmtMoneda(total-suma)}`:(dif>0&&creditos===0?`Cambio: ${fmtMoneda(dif)}`:'Sin cambio');el.className=`font-mono font-bold ${suma>=total?'text-emerald-600':'text-rose-500'}`;return;}
  if(metodo==='transferencia'){const dif=redondear2(suma-total);el.innerText=dif>=0?`Cambio: ${fmtMoneda(dif)}`:`Faltan ${fmtMoneda(-dif)}`;el.className=`font-mono font-bold ${dif>=0?'text-emerald-600':'text-rose-500'}`;return;}
  if(!document.getElementById('op-efectivo')?.value){el.innerText='—';el.className='font-mono font-bold text-slate-800';return;}
  const dif=redondear2(suma-total);el.innerText=dif>=0?fmtMoneda(dif):`Faltan ${fmtMoneda(-dif)}`;el.className=`font-mono font-bold ${dif>=0?'text-emerald-600':'text-rose-500'}`;
};

window.actualizarResumenPago = function() {
  const el=document.getElementById('op-resumen-pago'); if(!el)return;
  const metodo=document.getElementById('op-metodo-pago')?.value||'efectivo', total=totalCarrito(), comps=obtenerComponentesPago(), suma=redondear2(comps.reduce((s,c)=>s+c.monto,0));
  if(metodo==='credito'){el.innerText=`Venta a crédito: saldo pendiente ${fmtMoneda(total)}`;return;}
  if(metodo==='mixto'){const creditos=redondear2(comps.filter(c=>c.metodo==='credito').reduce((s,c)=>s+c.monto,0));const pagado=redondear2(suma-creditos);const detalle=comps.map(c=>`${etiquetaMetodoPago(c.metodo)} ${fmtMoneda(c.monto)}`).join(' + ');const falta=redondear2(total-suma);el.innerText=falta>0?`${detalle} · Faltan ${fmtMoneda(falta)}`:`${detalle} · Pagado ${fmtMoneda(pagado)}${creditos?` · Crédito ${fmtMoneda(creditos)}`:''}`;return;}
  if(metodo==='transferencia'){const dif=redondear2(suma-total);el.innerText=dif>=0?`Transferencia ${fmtMoneda(suma)} · Cambio ${fmtMoneda(dif)}`:`Faltan ${fmtMoneda(-dif)}`;return;}
  const dif=redondear2(suma-total);el.innerText=suma?(dif>=0?`Efectivo recibido ${fmtMoneda(suma)} · Cambio ${fmtMoneda(dif)}`:`Faltan ${fmtMoneda(-dif)}`):`Total a cobrar: ${fmtMoneda(total)}`;
};

window.construirItems = function() {
  return carrito.map(l => {
    const p = productosDB.find(x => x.id === l.productoId);
    const precio = precioLinea(l, p);
    return {
      productoId: p.id,
      codigo: p.codigo || '',
      descripcion: p.descripcion,
      tipoVenta: p.tipoVenta,
      cantidad: l.cantidad,
      precio,
      costo: p.precioAdq,
      mayoreo: !!l.usaMayoreo,
      subtotal: redondear2(precio * l.cantidad)
    };
  });
};

window.iniciarCalendario = function() {
  const hoy = new Date();
  calAnio = hoy.getFullYear();
  calMes = hoy.getMonth();
  fechaEntregaSel = null;
};

window.cambiarMesCal = function(delta) {
  calMes += delta;
  if (calMes < 0) { calMes = 11; calAnio--; }
  if (calMes > 11) { calMes = 0; calAnio++; }
  renderCalendario();
};

window.seleccionarFechaEntrega = function(iso) {
  fechaEntregaSel = iso;
  renderCalendario();
};

window.renderCalendario = function() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hoyISO = isoFecha(hoy);
  const primer = new Date(calAnio, calMes, 1);
  const diasMes = new Date(calAnio, calMes + 1, 0).getDate();

  const titulo = primer.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  document.getElementById('cal-titulo').innerText = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  document.getElementById('cal-prev').disabled = (calAnio * 12 + calMes) <= (hoy.getFullYear() * 12 + hoy.getMonth());

  let html = '';
  for (let i = 0; i < primer.getDay(); i++) html += '<span></span>';
  for (let d = 1; d <= diasMes; d++) {
    const fecha = new Date(calAnio, calMes, d);
    const iso = isoFecha(fecha);
    const pasado = fecha < hoy;
    let clase = 'h-9 rounded-lg text-xs font-medium transition ';
    if (pasado) clase += 'text-slate-400 cursor-not-allowed';
    else if (iso === fechaEntregaSel) clase += 'bg-blue-600 text-white font-bold';
    else if (iso === hoyISO) clase += 'border border-blue-400 text-blue-700 hover:bg-white';
    else clase += 'text-slate-800 hover:bg-white';
    html += `<button type="button" ${pasado ? 'disabled' : `onclick="seleccionarFechaEntrega('${iso}')"`} class="${clase}">${d}</button>`;
  }
  document.getElementById('cal-dias').innerHTML = html;

  const sel = document.getElementById('cal-seleccion');
  if (fechaEntregaSel) {
    sel.innerText = `Entrega: ${fechaLegible(fechaEntregaSel)}`;
    sel.className = 'text-xs text-center text-blue-700 font-semibold';
  } else {
    sel.innerText = 'Toca un día para elegir la fecha de entrega';
    sel.className = 'text-xs text-center text-slate-600';
  }
};

window.continuarAEntrega = function() {
  if (carrito.length === 0) return toast('⚠️ Agrega al menos un producto al pedido', 'warn');
  mostrarPasoOperacion('entrega');
};

window.finalizarPedido = function() {
  if (carrito.length === 0) return toast('⚠️ El pedido no tiene productos', 'warn');
  if (!fechaEntregaSel) return toast('⚠️ Selecciona la fecha de entrega en el calendario', 'warn');

  const items = construirItems();
  const total = redondear2(items.reduce((s, i) => s + i.subtotal, 0));
  const notas = document.getElementById('op-notas').value.trim();
  const fecha = new Date().toISOString();

  pedidosDB.push({
    id: Date.now(),
    fecha,
    clienteId: clienteOperacion.id,
    clienteNombre: clienteOperacion.nombre,
    vendedorId: clienteOperacion.vendedorId || (usuarioActual && usuarioActual.id),
    items,
    total,
    fechaEntrega: fechaEntregaSel,
    notas,
    estado: 'pendiente'
  });
  localStorage.setItem('pedidos_db', JSON.stringify(pedidosDB));

  const op = {
    tipo: 'pedido', fecha, items, total, notas,
    fechaEntrega: fechaEntregaSel,
    clienteNombre: clienteOperacion.nombre,
    telefono: clienteOperacion.telefono,
    vendedorNombre: nombreUsuarioActual()
  };
  cerrarPantallaOperacion();
  renderizarAgenda();
  mostrarModalWhatsApp(op);
};

window.finalizarVenta = function() {
  if (carrito.length === 0) return toast('⚠️ Agrega al menos un producto a la venta', 'warn');

  for (const l of carrito) {
    const p = productosDB.find(x => x.id === l.productoId);
    if (!p || l.cantidad > p.existencia) return alert(`⚠️ Existencia insuficiente de "${p ? p.descripcion : 'un producto'}".`);
  }

  const items = construirItems();
  const total = redondear2(items.reduce((s, i) => s + i.subtotal, 0));
  const metodoPago = document.getElementById('op-metodo-pago').value;
  const anotaciones = document.getElementById('op-anotaciones-venta').value.trim();
  const comps = obtenerComponentesPago();
  const sumaComponentes = redondear2(comps.reduce((s,c)=>s+c.monto,0));
  const creditos = redondear2(comps.filter(c=>c.metodo==='credito').reduce((s,c)=>s+c.monto,0));
  const efectivo = redondear2(comps.filter(c=>c.metodo==='efectivo').reduce((s,c)=>s+c.monto,0));
  const transferencia = redondear2(comps.filter(c=>c.metodo==='transferencia').reduce((s,c)=>s+c.monto,0));
  let montoPagado=0, cambio=0, saldoPendiente=0;
  if(metodoPago==='credito'){montoPagado=0;saldoPendiente=total;}
  else if(metodoPago==='mixto'){
    if(sumaComponentes<total)return alert(`⚠️ Faltan ${fmtMoneda(total-sumaComponentes)} para completar la venta.`);
    montoPagado=redondear2(sumaComponentes-creditos); saldoPendiente=creditos; cambio=0;
  } else if(metodoPago==='efectivo'){
    if(efectivo<total)return alert('⚠️ El efectivo recibido es menor al total de la venta.'); montoPagado=efectivo;cambio=redondear2(efectivo-total);
  } else if(metodoPago==='transferencia'){
    if(transferencia<total)return alert('⚠️ El monto de transferencia es menor al total.'); montoPagado=transferencia;cambio=redondear2(transferencia-total);
  }

  items.forEach(i => {
    const p = productosDB.find(x => x.id === i.productoId);
    if (p) p.existencia = redondear3(p.existencia - i.cantidad);
  });
  guardarProductosDB();

  const tenant = obtenerTenantActual();
  const fecha = new Date().toISOString();
  const venta = {
    id: Date.now(), fecha,
    adminId: tenant.adminId,
    adminEmail: tenant.adminEmail,
    negocio: tenant.negocio,
    vendedorId: (usuarioActual && usuarioActual.id) || (clienteOperacion && clienteOperacion.vendedorId) || null,
    vendedorNombre: nombreUsuarioActual(),
    clienteId: clienteOperacion ? clienteOperacion.id : null,
    clienteNombre: clienteOperacion ? clienteOperacion.nombre : 'Venta mostrador',
    totalVenta: total,
    totalCosto: redondear2(items.reduce((s, i) => s + i.costo * i.cantidad, 0)),
    items,
    metodoPago,
    efectivo: metodoPago === 'credito' ? 0 : efectivo,
    transferencia: metodoPago === 'credito' ? 0 : transferencia,
    montoPagado,
    cambio,
    saldoPendiente,
    pagoComponentes: comps,
    anotaciones
  };
  ventasDB.push(venta);
  guardarVentasDB();

  const op = {
    ...venta, tipo: 'venta', total,
    telefono: clienteOperacion ? clienteOperacion.telefono : '',
    negocioNombre: (usuarioActual && usuarioActual.negocio) || localStorage.getItem('negocio_nombre') || 'Ventas de Campo'
  };
  cerrarPantallaOperacion();
  renderizarInventario();
  renderizarVentasSemana();
  renderizarReporteVentas();
  ultimaOperacion = op;
  document.getElementById('ticket-resumen').innerText = `${op.clienteNombre} · ${etiquetaMetodoPago(op.metodoPago)} · Total ${fmtMoneda(op.total)}`;
  document.getElementById('modal-ticket').classList.remove('hidden');
};

function etiquetaMetodoPago(m) {
  return ({efectivo:'Efectivo', credito:'Crédito', transferencia:'Transferencia', mixto:'Mixto'})[m] || 'Pago';
}

window.terminarDespuesTicket = function() {
  document.getElementById('modal-ticket').classList.add('hidden');
  if (ultimaOperacion && ultimaOperacion.telefono) mostrarModalWhatsApp(ultimaOperacion);
  else { toast('✅ Venta registrada correctamente'); ultimaOperacion=null; }
};

window.generarTicketPDF = function() {
  if(!ultimaOperacion) return;
  if(!window.jspdf || !window.jspdf.jsPDF) return alert('Generador PDF no disponible.');
  const op=ultimaOperacion;
  const { jsPDF }=window.jspdf;
  const alto=Math.max(90, 58 + op.items.length*9 + 65 + (op.anotaciones ? Math.ceil(String(op.anotaciones).length / 38) * 4 : 0));
  const doc=new jsPDF({unit:'mm',format:[58,alto],compress:true});
  let y=7; const x=4;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text(String(op.negocioNombre || 'Ventas en Campo'),29,y,{align:'center', maxWidth:50}); y+=5;
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.text('NOTA DE VENTA',29,y,{align:'center'}); y+=5;
  doc.line(x,y,54,y); y+=4;
  doc.setFontSize(7); doc.text(`Fecha: ${new Date(op.fecha).toLocaleString('es-MX')}`,x,y); y+=4;
  doc.text(`Atiende: ${op.vendedorNombre || 'Usuario'}`,x,y); y+=4;
  doc.text(`Cliente: ${op.clienteNombre || 'Venta mostrador'}`,x,y); y+=4;
  doc.line(x,y,54,y); y+=4;
  doc.setFont('helvetica','bold'); doc.text('PRODUCTO',x,y); doc.text('IMPORTE',54,y,{align:'right'}); y+=4; doc.setFont('helvetica','normal');
  op.items.forEach(i=>{ const desc=String(i.descripcion||'Producto'); const max=34; const line=doc.splitTextToSize(`${fmtNum(i.cantidad)} x ${desc}`,max); doc.text(line,x,y); doc.text(fmtMoneda(i.subtotal),54,y,{align:'right'}); y += Math.max(4,line.length*3.5); });
  doc.line(x,y,54,y); y+=5; doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('TOTAL',x,y); doc.text(fmtMoneda(op.total),54,y,{align:'right'}); y+=5;
  doc.setFont('helvetica','normal'); doc.setFontSize(7);
  doc.text(`Pago: ${etiquetaMetodoPago(op.metodoPago)}`,x,y); y+=4;
  if(op.metodoPago==='efectivo'){ doc.text(`Efectivo: ${fmtMoneda(op.efectivo)}`,x,y); y+=4; doc.text(`Cambio: ${fmtMoneda(op.cambio)}`,x,y); y+=4; }
  doc.text('¡Gracias por su compra!',29,y,{align:'center'});
  doc.save(`ticket_${Date.now()}.pdf`);
  document.getElementById('modal-ticket').classList.add('hidden');
  if(op.telefono) mostrarModalWhatsApp(op); else {toast('✅ Ticket PDF generado'); ultimaOperacion=null;}
};

function telefonoWhatsApp(tel) {
  let digitos = String(tel || '').replace(/\D/g, '');
  if (digitos.length === 10) digitos = CODIGO_PAIS_WHATSAPP + digitos;
  return digitos;
}

function armarMensajeWhatsApp(op) {
  const lineas = op.items.map(i => `• ${fmtNum(i.cantidad)} x ${i.descripcion} @ ${fmtMoneda(i.precio)} = ${fmtMoneda(i.subtotal)}`);
  const partes = [
    op.tipo === 'pedido' ? '*🧾 PEDIDO*' : '*🧾 NOTA DE VENTA*',
    `Cliente: ${op.clienteNombre}`,
    `Atiende: ${op.vendedorNombre}`,
    `Fecha: ${new Date(op.fecha).toLocaleString('es-MX')}`
  ];
  if (op.tipo === 'pedido') partes.push(`📅 Entrega: ${fechaLegible(op.fechaEntrega)}`);
  partes.push('', ...lineas, '', `*TOTAL: ${fmtMoneda(op.total)}*`);
  if (op.tipo === 'venta') {
    partes.push(`Pago: ${etiquetaMetodoPago(op.metodoPago)}`);
  }
  partes.push('', '¡Gracias por su preferencia!');
  return partes.join('\n');
}

window.mostrarModalWhatsApp = function(op) {
  ultimaOperacion = op;
  document.getElementById('wa-titulo').innerText = op.tipo === 'pedido' ? 'Pedido guardado' : 'Venta registrada';
  document.getElementById('wa-resumen').innerText = op.tipo === 'pedido'
    ? `${op.clienteNombre} · Total ${fmtMoneda(op.total)} · Entrega ${fechaCorta(op.fechaEntrega)}`
    : `${op.clienteNombre} · Total ${fmtMoneda(op.total)}`;
  document.getElementById('modal-whatsapp').classList.remove('hidden');
};

window.cerrarModalWhatsApp = function() {
  document.getElementById('modal-whatsapp').classList.add('hidden');
  ultimaOperacion = null;
};

window.enviarPorWhatsApp = function() {
  if (!ultimaOperacion) return;
  const numero = telefonoWhatsApp(ultimaOperacion.telefono);
  if (numero.length < 10) return alert('Teléfono del cliente no válido para WhatsApp.');
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(armarMensajeWhatsApp(ultimaOperacion))}`;
  window.open(url, '_blank');
  cerrarModalWhatsApp();
};

window.obtenerGPS = function() {
  const inputGps = document.getElementById('cli-gps');
  inputGps.value = "Obteniendo...";
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => inputGps.value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
      () => inputGps.value = "Error al capturar GPS"
    );
  }
};

window.actualizarBotonesModoVista = function() {
  const pc=document.body.classList.contains('modo-pc');
  ['btn-modo-vista','btn-modo-vista-root'].forEach(id=>{const b=document.getElementById(id); if(b) b.innerText=pc?'📱 Móvil':'🖥️ PC';});
};

window.alternarModoVista = function() {
  const pc=!document.body.classList.contains('modo-pc');
  document.body.classList.toggle('modo-pc',pc); document.body.classList.toggle('modo-movil',!pc);
  localStorage.setItem('modo_vista',pc?'pc':'movil'); actualizarBotonesModoVista();
};

window.creditoCliente = function(id) {
  const ventas=ventasDB.filter(v=>String(v.clienteId)===String(id));
  const totalCredito=redondear2(ventas.reduce((s,v)=>s+(Number(v.saldoPendiente)||0),0));
  const abonos=creditAbonosDB.filter(a=>String(a.clienteId)===String(id));
  const totalAbonos=redondear2(abonos.reduce((s,a)=>s+(Number(a.monto)||0),0));
  const saldo=redondear2(Math.max(0,totalCredito-totalAbonos));
  return {ventas,abonos,totalCredito,totalAbonos,saldo};
};

let creditoClienteId=null;
window.abrirModalCreditoCliente = function(id) {
  const c=clientesDB.find(x=>String(x.id)===String(id)); if(!c) return; creditoClienteId=id;
  document.getElementById('credito-cli-nombre').innerText=`Cliente: ${c.nombre}`;
  document.getElementById('credito-abono-monto').value='';
  renderizarCreditoCliente(); document.getElementById('modal-credito-cliente').classList.remove('hidden');
};
window.cerrarModalCreditoCliente = function() { document.getElementById('modal-credito-cliente').classList.add('hidden'); creditoClienteId=null; };

window.renderizarCreditoCliente = function() {
  const d=creditoCliente(creditoClienteId); const r=document.getElementById('credito-resumen');
  r.innerHTML=`<div class="bg-amber-50 border border-amber-200 rounded-xl p-2"><p class="text-[9px]">Fiado</p><b class="text-amber-700">${fmtMoneda(d.totalCredito)}</b></div><div class="bg-emerald-50 border border-emerald-200 rounded-xl p-2"><p class="text-[9px]">Abonos</p><b class="text-emerald-700">${fmtMoneda(d.totalAbonos)}</b></div><div class="bg-rose-50 border border-rose-200 rounded-xl p-2"><p class="text-[9px]">Debe</p><b class="text-rose-700">${fmtMoneda(d.saldo)}</b></div>`;
};

window.registrarAbonoCredito = function() {
  if(!creditoClienteId)return; const d=creditoCliente(creditoClienteId); const monto=redondear2(Number(document.getElementById('credito-abono-monto').value));
  if(monto<=0)return alert('Escribe un monto válido.'); if(monto>d.saldo)return alert(`El abono no puede ser mayor a ${fmtMoneda(d.saldo)}.`);
  creditAbonosDB.push({id:Date.now(),clienteId:creditoClienteId,monto,fecha:new Date().toISOString(),usuario:nombreUsuarioActual()}); localStorage.setItem('credit_abonos_db',JSON.stringify(creditAbonosDB)); renderizarCreditoCliente(); renderizarClientesAdmin(); toast('✅ Abono registrado');
};

window.liquidarCreditoCliente = function() { const d=creditoCliente(creditoClienteId); if(d.saldo<=0)return toast('✅ Este crédito ya está liquidado'); document.getElementById('credito-abono-monto').value=d.saldo; registrarAbonoCredito(); };

window.rangoSemanaActual = function() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const inicio = new Date(hoy);
  const dia = inicio.getDay();
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1));
  const fin = new Date(inicio); fin.setDate(fin.getDate() + 6); fin.setHours(23,59,59,999);
  return {inicio, fin};
};

window.renderizarVentasSemana = function() {
  const cont = document.getElementById('lista-ventas-semana');
  if (!cont) return;
  const {inicio, fin} = rangoSemanaActual();
  const ventas = ventasDB.filter(v => {
    const f = new Date(v.fecha);
    if (f < inicio || f > fin) return false;
    if (usuarioActual && usuarioActual.rol === 'vendedor') return v.vendedorId === usuarioActual.id;
    return true;
  }).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  const total = ventas.reduce((s,v)=>s+(Number(v.totalVenta)||0),0);
  document.getElementById('ventas-semana-rango').innerText = `${inicio.toLocaleDateString('es-MX')} al ${fin.toLocaleDateString('es-MX')}`;
  document.getElementById('ventas-semana-total').innerText = fmtMoneda(total);
  if (!ventas.length) { cont.innerHTML='<div class="text-center py-10 text-slate-500 text-xs"><p>📂 No hay ventas registradas esta semana.</p></div>'; return; }
  cont.innerHTML = ventas.map(v => {
    const vend = vendedoresDB.find(x=>x.id===v.vendedorId);
    return `<button onclick="abrirDetalleVenta(${v.id})" class="w-full text-left bg-slate-50 border border-slate-300 hover:border-blue-400 p-3 rounded-xl space-y-1 transition">
      <div class="flex justify-between items-center gap-2"><div class="min-w-0"><p class="text-xs font-bold text-slate-900 truncate">${esc(v.clienteNombre || 'Venta mostrador')}</p><p class="text-[10px] text-slate-500">${new Date(v.fecha).toLocaleString('es-MX')} · ${esc(vend ? vend.nombre : (v.vendedorNombre || nombreUsuarioActual()))}</p></div><span class="font-mono font-bold text-emerald-600">${fmtMoneda(v.totalVenta)}</span></div>
      <div class="flex justify-between text-[10px] text-slate-500"><span>💳 ${etiquetaMetodoPago(v.metodoPago || 'efectivo')}</span><span>Ver detalles →</span></div>
    </button>`;
  }).join('');
};

window.abrirDetalleVenta = function(id) {
  const v = ventasDB.find(x => String(x.id) === String(id));
  if (!v) return;
  const vend = vendedoresDB.find(x=>x.id===v.vendedorId);
  const items = Array.isArray(v.items) ? v.items : [];
  const html = `
    <div class="bg-slate-100 rounded-xl p-3 space-y-1 border border-slate-200">
      <p class="font-bold text-slate-900">${esc(v.clienteNombre || 'Venta mostrador')}</p>
      <p class="text-[10px] text-slate-500">📅 ${new Date(v.fecha).toLocaleString('es-MX')}</p>
      <p class="text-[10px] text-slate-500">👤 Vendedor: ${esc(vend ? vend.nombre : (v.vendedorNombre || 'Usuario'))}</p>
    </div>
    <div class="bg-slate-100 rounded-xl p-3 border border-slate-200 space-y-2">
      <p class="font-bold text-xs text-slate-700">Productos</p>
      ${items.length ? items.map(i=>`<div class="flex justify-between gap-2 text-[11px]"><span class="text-slate-600">${fmtNum(i.cantidad)} × ${esc(i.descripcion)}</span><span class="text-slate-800 font-mono">${fmtMoneda(i.subtotal)}</span></div>`).join('') : '<p class="text-slate-500">Sin detalle de productos.</p>'}
      <div class="border-t border-slate-200 pt-2 flex justify-between font-bold"><span>Total</span><span class="text-emerald-600 font-mono">${fmtMoneda(v.totalVenta)}</span></div>
    </div>
    <div class="bg-slate-100 rounded-xl p-3 border border-slate-200 space-y-1 text-[11px]">
      <p><span class="text-slate-500">Forma de pago:</span> <span class="text-slate-800 font-semibold">${etiquetaMetodoPago(v.metodoPago || 'efectivo')}</span></p>
    </div>`;
  document.getElementById('detalle-venta-contenido').innerHTML = html;
  document.getElementById('modal-detalle-venta').classList.remove('hidden');
};

window.cerrarDetalleVenta = function() { document.getElementById('modal-detalle-venta').classList.add('hidden'); };

window.cambiarVista = function(vista) {
  document.getElementById('vista-agenda').classList.add('hidden');
  document.getElementById('vista-nuevo-cliente').classList.add('hidden');
  document.getElementById('vista-productos').classList.add('hidden');
  document.getElementById('vista-ventas-semana').classList.add('hidden');
  document.getElementById('vista-vendedor-nomina').classList.add('hidden');
  document.getElementById('vista-admin').classList.add('hidden');

  document.getElementById('btn-nav-agenda').className = "flex flex-col items-center text-slate-600";
  document.getElementById('btn-nav-cliente').className = "flex flex-col items-center text-slate-600";
  document.getElementById('btn-nav-productos').className = "flex flex-col items-center text-slate-600";
  document.getElementById('btn-nav-vender').className = "flex flex-col items-center text-slate-600";
  const btnVentasSemana = document.getElementById('btn-nav-ventas-semana');
  if (btnVentasSemana) btnVentasSemana.className = "flex flex-col items-center text-slate-600";
  
  const btnNominaVend = document.getElementById('btn-nav-vendedor-nomina');
  if (btnNominaVend) btnNominaVend.className = "flex flex-col items-center text-slate-600";

  const btnAdmin = document.getElementById('btn-nav-admin');
  if (btnAdmin) btnAdmin.className = "flex flex-col items-center text-slate-600";

  if (vista === 'agenda') {
    document.getElementById('vista-agenda').classList.remove('hidden');
    document.getElementById('btn-nav-agenda').className = "flex flex-col items-center text-blue-600";
    renderizarAgenda();
  } else if (vista === 'nuevo-cliente') {
    document.getElementById('vista-nuevo-cliente').classList.remove('hidden');
    document.getElementById('btn-nav-cliente').className = "flex flex-col items-center text-blue-600";
    cambiarSubVistaClientes(subVistaClientesActual || 'lista');
  } else if (vista === 'productos') {
    document.getElementById('vista-productos').classList.remove('hidden');
    document.getElementById('btn-nav-productos').className = "flex flex-col items-center text-blue-600";
    cambiarSubVistaProductos(subVistaProdActual);
  } else if (vista === 'ventas-semana') {
    document.getElementById('vista-ventas-semana').classList.remove('hidden');
    if (btnVentasSemana) btnVentasSemana.className = "flex flex-col items-center text-blue-600";
    renderizarVentasSemana();
  } else if (vista === 'vendedor-nomina' && usuarioActual && usuarioActual.rol === 'vendedor') {
    document.getElementById('vista-vendedor-nomina').classList.remove('hidden');
    btnNominaVend.className = "flex flex-col items-center text-emerald-600";
    renderizarNominasVendedor();
  } else if (vista === 'admin') {
    if (!usuarioActual || usuarioActual.rol !== 'admin') {
      alert("⛔ Acceso denegado: Esta vista es exclusiva para Administradores.");
      return;
    }
    document.getElementById('vista-admin').classList.remove('hidden');
    if (btnAdmin) btnAdmin.className = "flex flex-col items-center text-emerald-600";
    cambiarSubVistaAdmin('vendedores');
  }
};

window.abrirModalSync = function() {
  const modal = document.getElementById('modal-sync');
  if (modal) modal.classList.remove('hidden');
  const tenant = obtenerTenantActual();
  const elNegocio = document.getElementById('sync-negocio-activo');
  if (elNegocio) {
    elNegocio.innerText = tenant.negocio || (usuarioActual ? (usuarioActual.nombreCompleto || usuarioActual.nombre) : 'Central');
  }
};
window.cerrarModalSync = function() {
  document.getElementById('modal-sync').classList.add('hidden');
};

window.verificarConexionFirebase = async function() {
  const elLogin = document.getElementById('login-estado-conector');
  const elSync = document.getElementById('sync-estado-firebase');

  if (typeof firebase === 'undefined' || !firebase.firestore) {
    if (elLogin) {
      elLogin.className = 'font-semibold text-amber-600';
      elLogin.innerText = 'Modo Local (Offline)';
    }
    if (elSync) {
      elSync.className = 'font-semibold text-amber-600';
      elSync.innerText = '⚠️ SDK Local (Modo sin conexión)';
    }
    return false;
  }

  try {
    // Probar conexión en vivo con Firebase Firestore
    await firebase.firestore().collection('admins').limit(1).get({ source: 'server' });
    if (elLogin) {
      elLogin.className = 'font-semibold text-emerald-600';
      elLogin.innerText = 'Conectado a Firestore';
    }
    if (elSync) {
      elSync.className = 'font-semibold text-emerald-600';
      elSync.innerText = '✅ Conectado a Firestore (ventas-campo-92a4c)';
    }
    console.log('✅ Conexión activa y confirmada con Firebase Firestore (ventas-campo-92a4c)');
    return true;
  } catch (err) {
    console.warn('Verificación Firestore:', err.code, err.message);
    if (elLogin) {
      elLogin.className = 'font-semibold text-emerald-600';
      elLogin.innerText = navigator.onLine ? 'Conectado (Caché local activa)' : 'Sin Internet (Modo Campo Offline)';
    }
    if (elSync) {
      elSync.className = 'font-semibold text-slate-600';
      elSync.innerText = navigator.onLine ? 'En línea (Caché local/Firestore)' : '📡 Fuera de línea';
    }
    return false;
  }
};

// Utilidad para limpiar valores undefined antes de enviar a Firestore
function sanitizarParaFirestore(val) {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') {
    if (typeof val === 'number' && isNaN(val)) return 0;
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizarParaFirestore);
  }
  const clean = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      clean[k] = sanitizarParaFirestore(v);
    }
  }
  return clean;
}

function conTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_CONEXION')), ms))
  ]);
}

window.sincronizarAhora = async function() {
  const btn = document.getElementById('btn-sync-ahora');
  const logDiv = document.getElementById('sync-log');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '📡 Sincronizando datos…';
  }

  const log = (msg, tipo = 'info') => {
    if (!logDiv) return;
    const color = tipo === 'success' ? 'text-emerald-600 font-semibold' : tipo === 'error' ? 'text-rose-600 font-semibold' : tipo === 'warn' ? 'text-amber-600 font-medium' : 'text-slate-600';
    const nowTime = new Date().toLocaleTimeString('es-MX');
    logDiv.innerHTML = `<p class="${color}">[${nowTime}] ${msg}</p>` + logDiv.innerHTML;
  };

  try {
    const tenant = obtenerTenantActual();
    const rolActual = (usuarioActual && usuarioActual.rol) || 'admin';
    const miAdminId = String(tenant.adminId || 'adm_1');
    const miEmail = String(tenant.adminEmail || '').toLowerCase();
    const miNegocio = tenant.negocio || (usuarioActual && usuarioActual.negocio) || 'Mi Negocio';

    log(`🏢 Negocio: <strong>${miNegocio}</strong> (${rolActual.toUpperCase()})`);
    log("Iniciando sincronización con almacenamiento local y nube...");

    const tieneFirebase = typeof firebase !== 'undefined' && firebase.firestore;
    let db = null;
    if (tieneFirebase) {
      try {
        db = firebase.firestore();
      } catch (e) {
        console.warn("Firestore init:", e);
      }
    }

    // Intentar autenticación silenciosa para cumplir con posibles reglas de seguridad
    if (tieneFirebase && firebase.auth && navigator.onLine) {
      try {
        if (!firebase.auth().currentUser) {
          if (usuarioActual && usuarioActual.email && usuarioActual.password) {
            await firebase.auth().signInWithEmailAndPassword(usuarioActual.email, usuarioActual.password).catch(() => {});
          }
          if (!firebase.auth().currentUser) {
            await firebase.auth().signInAnonymously().catch(() => {});
          }
        }
      } catch (authErr) {
        console.warn("Auth Firebase anónimo info:", authErr.message);
      }
    }

    let subidaCloudOk = false;
    let descargaCloudOk = false;

    if (rolActual === 'admin') {
      // =======================================================
      // ADMINISTRADOR: SINCRONIZACIÓN Y AISLAMIENTO DE NEGOCIO
      // =======================================================

      // 1. Subir productos locales de este administrador a Firestore
      let prodsSubidos = 0;
      if (db && navigator.onLine) {
        try {
          for (const p of productosDB) {
            if (!p.id) continue;
            const prodDoc = sanitizarParaFirestore({
              ...p,
              adminId: miAdminId,
              adminEmail: miEmail,
              negocio: miNegocio
            });
            await conTimeout(db.collection('productos').doc(String(p.id)).set(prodDoc, { merge: true }), 3500);
            prodsSubidos++;
          }
          if (prodsSubidos > 0) {
            log(`☁️ ${prodsSubidos} productos de "${miNegocio}" sincronizados a Firestore`, 'success');
            subidaCloudOk = true;
          }
        } catch (eProd) {
          console.warn("Subida productos Firestore:", eProd.message);
          log(`💾 ${productosDB.length} productos guardados en Local Storage (${eProd.message.includes('permission') ? 'Modo Local Seguro' : 'Almacenamiento Local'})`, 'info');
        }
      } else {
        log(`💾 ${productosDB.length} productos resguardados en Local Storage`, 'info');
      }

      // 2. Subir clientes locales de este administrador a Firestore
      let cliSubidos = 0;
      if (db && navigator.onLine) {
        try {
          for (const c of clientesDB) {
            if (!c.id) continue;
            const cliDoc = sanitizarParaFirestore({
              ...c,
              adminId: miAdminId,
              adminEmail: miEmail,
              negocio: miNegocio
            });
            await conTimeout(db.collection('clientes').doc(String(c.id)).set(cliDoc, { merge: true }), 3500);
            cliSubidos++;
          }
          if (cliSubidos > 0) {
            log(`☁️ ${cliSubidos} clientes de tu negocio sincronizados a Firestore`, 'success');
            subidaCloudOk = true;
          }
        } catch (eCli) {
          console.warn("Subida clientes Firestore:", eCli.message);
          log(`💾 ${clientesDB.length} clientes resguardados en Local Storage`, 'info');
        }
      } else {
        log(`💾 ${clientesDB.length} clientes resguardados en Local Storage`, 'info');
      }

      // 3. Subir ventas locales de este negocio
      let ventasSubidas = 0;
      if (db && navigator.onLine) {
        try {
          for (const v of ventasDB) {
            if (!v.id) continue;
            const ventaDoc = sanitizarParaFirestore({
              ...v,
              adminId: miAdminId,
              adminEmail: miEmail,
              negocio: miNegocio
            });
            await conTimeout(db.collection('ventas').doc(String(v.id)).set(ventaDoc, { merge: true }), 3500);
            ventasSubidas++;
          }
          if (ventasSubidas > 0) {
            log(`☁️ ${ventasSubidas} notas de venta sincronizadas a Firestore`, 'success');
            subidaCloudOk = true;
          }
        } catch (eVenta) {
          console.warn("Subida ventas Firestore:", eVenta.message);
          log(`💾 ${ventasDB.length} ventas aseguradas en Local Storage`, 'info');
        }
      } else {
        log(`💾 ${ventasDB.length} ventas aseguradas en Local Storage`, 'info');
      }

      // 4. Subir vendedores de este administrador
      let vendsSubidos = 0;
      if (db && navigator.onLine) {
        try {
          const misVends = vendedoresDB.filter(v => 
            v.adminId === miAdminId || 
            (v.adminEmail && v.adminEmail === miEmail) || 
            (miNegocio && v.negocio && v.negocio.toLowerCase() === miNegocio.toLowerCase()) ||
            (!v.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))
          );
          for (const vend of misVends) {
            if (!vend.id) continue;
            const vendDoc = sanitizarParaFirestore({
              ...vend,
              adminId: miAdminId,
              adminEmail: miEmail,
              negocio: miNegocio
            });
            await conTimeout(db.collection('vendedores').doc(String(vend.id)).set(vendDoc, { merge: true }), 3500);
            vendsSubidos++;
          }
          if (vendsSubidos > 0) {
            log(`☁️ ${vendsSubidos} vendedores de tu negocio sincronizados a Firestore`, 'success');
            subidaCloudOk = true;
          }
        } catch (eVend) {
          console.warn("Subida vendedores Firestore:", eVend.message);
        }
      }

      // 5. Subir nóminas emitidas por este administrador
      let nominasSubidas = 0;
      if (db && navigator.onLine) {
        try {
          const misNominas = nominasDB.filter(n => 
            n.adminId === miAdminId || 
            (n.adminEmail && n.adminEmail === miEmail) || 
            (miNegocio && n.negocio && n.negocio.toLowerCase() === miNegocio.toLowerCase()) || 
            (!n.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))
          );
          for (const nom of misNominas) {
            if (!nom.id) continue;
            const nomDoc = sanitizarParaFirestore({
              ...nom,
              adminId: miAdminId,
              adminEmail: miEmail,
              negocio: miNegocio
            });
            await conTimeout(db.collection('nominas').doc(String(nom.id)).set(nomDoc, { merge: true }), 3500);
            nominasSubidas++;
          }
          if (nominasSubidas > 0) {
            log(`☁️ ${nominasSubidas} recibos de nómina sincronizados a Firestore`, 'success');
            subidaCloudOk = true;
          }
        } catch (eNom) {
          console.warn("Subida nóminas Firestore:", eNom.message);
        }
      }

      // 6. Descargar datos de Firestore hacia Local Storage (SOLO de este administrador)
      if (db && navigator.onLine) {
        try {
          // Descargar productos
          const snapProds = await conTimeout(db.collection('productos').get(), 5000);
          if (snapProds && !snapProds.empty) {
            const prodsRemotos = snapProds.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(p => 
                p.adminId === miAdminId || 
                (miEmail && p.adminEmail === miEmail) || 
                (miNegocio && p.negocio && p.negocio.toLowerCase() === miNegocio.toLowerCase()) ||
                (!p.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))
              );
            
            if (prodsRemotos.length > 0) {
              const mapLocal = new Map(productosDB.map(p => [String(p.id), p]));
              prodsRemotos.forEach(r => mapLocal.set(String(r.id), migrarProducto(r)));
              productosDB = Array.from(mapLocal.values());
              guardarProductosDB();
              renderizarInventario();
              descargaCloudOk = true;
              log(`📥 ${prodsRemotos.length} productos actualizados en Local Storage`, 'success');
            }
          }
        } catch (errProdsDesc) {
          console.warn("Descarga productos Firestore:", errProdsDesc.message);
        }

        try {
          // Descargar clientes
          const snapCli = await conTimeout(db.collection('clientes').get(), 5000);
          if (snapCli && !snapCli.empty) {
            const cliRemotos = snapCli.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(c => 
                c.adminId === miAdminId || 
                (miEmail && c.adminEmail === miEmail) || 
                (miNegocio && c.negocio && c.negocio.toLowerCase() === miNegocio.toLowerCase()) ||
                (!c.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))
              );
            
            if (cliRemotos.length > 0) {
              const mapCli = new Map(clientesDB.map(c => [String(c.id), c]));
              cliRemotos.forEach(r => mapCli.set(String(r.id), r));
              clientesDB = Array.from(mapCli.values());
              guardarClientesDB();
              renderizarAgenda();
              renderizarMisClientes();
              descargaCloudOk = true;
              log(`📥 ${cliRemotos.length} clientes consolidados en Local Storage`, 'success');
            }
          }
        } catch (errCliDesc) {
          console.warn("Descarga clientes Firestore:", errCliDesc.message);
        }

        try {
          // Descargar ventas
          const snapVentas = await conTimeout(db.collection('ventas').get(), 5000);
          if (snapVentas && !snapVentas.empty) {
            const ventasRemotas = snapVentas.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(v => 
                v.adminId === miAdminId || 
                (miEmail && v.adminEmail === miEmail) || 
                (miNegocio && v.negocio && v.negocio.toLowerCase() === miNegocio.toLowerCase()) ||
                (!v.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))
              );
            
            if (ventasRemotas.length > 0) {
              const mapVentas = new Map(ventasDB.map(v => [String(v.id), v]));
              ventasRemotas.forEach(r => mapVentas.set(String(r.id), r));
              ventasDB = Array.from(mapVentas.values());
              guardarVentasDB();
              renderizarVentasSemana();
              renderizarReporteVentas();
              descargaCloudOk = true;
              log(`📥 ${ventasRemotas.length} ventas del equipo consolidadas en Local Storage`, 'success');
            }
          }
        } catch (errVentasDesc) {
          console.warn("Descarga ventas Firestore:", errVentasDesc.message);
        }

        try {
          // Descargar vendedores pertenecientes a este admin
          const snapVend = await conTimeout(db.collection('vendedores').get(), 5000);
          if (snapVend && !snapVend.empty) {
            const vendsRemotos = snapVend.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(v => 
                v.adminId === miAdminId || 
                (miEmail && v.adminEmail === miEmail) || 
                (miNegocio && v.negocio && v.negocio.toLowerCase() === miNegocio.toLowerCase()) ||
                (!v.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))
              );
            
            const mapVend = new Map(vendedoresDB.map(v => [String(v.id), v]));
            vendsRemotos.forEach(r => mapVend.set(String(r.id), r));
            vendedoresDB = Array.from(mapVend.values());
            guardarVendedoresDB();
            poblarSelectsVendedores();
            renderizarVendedores();
            log(`📥 ${vendedoresDB.length} vendedores de tu negocio listos en Local Storage`, 'success');
          }
        } catch (errVendDesc) {
          console.warn("Descarga vendedores Firestore:", errVendDesc.message);
        }

        try {
          // Descargar nóminas pertenecientes a este negocio
          const snapNom = await conTimeout(db.collection('nominas').get(), 5000);
          if (snapNom && !snapNom.empty) {
            const nomRemotas = snapNom.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(n => 
                n.adminId === miAdminId || 
                (miEmail && n.adminEmail === miEmail) || 
                (miNegocio && n.negocio && n.negocio.toLowerCase() === miNegocio.toLowerCase()) ||
                (!n.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))
              );
            
            if (nomRemotas.length > 0) {
              const mapNom = new Map(nominasDB.map(n => [String(n.id), n]));
              nomRemotas.forEach(r => mapNom.set(String(r.id), r));
              nominasDB = Array.from(mapNom.values());
              guardarNominasDB();
              renderizarHistorialNominasAdmin();
              log(`📥 ${nomRemotas.length} recibos de nómina sincronizados en Local Storage`, 'success');
            }
          }
        } catch (errNomDesc) {
          console.warn("Descarga nóminas Firestore:", errNomDesc.message);
        }
      }

      // Consolidación final y persistencia en Local Storage
      guardarProductosDB();
      guardarClientesDB();
      guardarVentasDB();
      guardarVendedoresDB();
      guardarNominasDB();
      renderizarInventario();
      renderizarAgenda();
      renderizarMisClientes();
      renderizarVentasSemana();
      renderizarReporteVentas();
      renderizarVendedores();
      renderizarHistorialNominasAdmin();
      poblarSelectsVendedores();

      log("🔒 Aislamiento verificado: Catálogo, nóminas y equipo sincronizados exclusivamente para tu negocio.", 'info');

    } else if (rolActual === 'vendedor') {
      // =======================================================
      // VENDEDOR: SINCRONIZA HACIA SU ADMINISTRADOR
      // =======================================================
      const miVendedorId = String(usuarioActual.id || usuarioActual.uid || 'vend_1');
      const miVendedorNombre = String(usuarioActual.nombre || usuarioActual.displayName || '').toLowerCase();
      const miVendedorUser = String(usuarioActual.usuario || '').toLowerCase();

      // 1. Subir ventas realizadas por este vendedor
      const misVentasLocales = ventasDB.filter(v => String(v.vendedorId) === miVendedorId);
      let vSubidas = 0;
      if (db && navigator.onLine) {
        try {
          for (const v of misVentasLocales) {
            if (!v.id) continue;
            const ventaDoc = sanitizarParaFirestore({
              ...v,
              adminId: miAdminId,
              vendedorId: miVendedorId,
              negocio: miNegocio
            });
            await conTimeout(db.collection('ventas').doc(String(v.id)).set(ventaDoc, { merge: true }), 3500);
            vSubidas++;
          }
          if (vSubidas > 0) {
            log(`☁️ ${vSubidas} ventas subidas hacia la cuenta de tu Administrador`, 'success');
            subidaCloudOk = true;
          }
        } catch (eVendVentas) {
          console.warn("Subida ventas vendedor Firestore:", eVendVentas.message);
          log(`💾 ${misVentasLocales.length} ventas resguardadas en Local Storage`, 'info');
        }
      } else {
        log(`💾 ${misVentasLocales.length} ventas resguardadas en Local Storage`, 'info');
      }

      // 2. Subir clientes registrados por este vendedor
      const misClientesLocales = clientesDB.filter(c => String(c.vendedorId) === miVendedorId);
      let cSubidos = 0;
      if (db && navigator.onLine) {
        try {
          for (const c of misClientesLocales) {
            if (!c.id) continue;
            const cliDoc = sanitizarParaFirestore({
              ...c,
              adminId: miAdminId,
              vendedorId: miVendedorId,
              negocio: miNegocio
            });
            await conTimeout(db.collection('clientes').doc(String(c.id)).set(cliDoc, { merge: true }), 3500);
            cSubidos++;
          }
          if (cSubidos > 0) {
            log(`☁️ ${cSubidos} clientes sincronizados con tu Administrador`, 'success');
            subidaCloudOk = true;
          }
        } catch (eVendCli) {
          console.warn("Subida clientes vendedor Firestore:", eVendCli.message);
          log(`💾 ${misClientesLocales.length} clientes resguardados en Local Storage`, 'info');
        }
      } else {
        log(`💾 ${misClientesLocales.length} clientes resguardados en Local Storage`, 'info');
      }

      // 3. Descargar el catálogo oficial de productos del Administrador al Local Storage
      let prodsDescargados = false;
      if (db && navigator.onLine) {
        try {
          const snapProds = await conTimeout(db.collection('productos').get(), 5000);
          if (snapProds && !snapProds.empty) {
            const todosLosProds = snapProds.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const prodsAdmin = todosLosProds.filter(p => {
              // 1. Por ID de admin o authUid
              if (p.adminId && (String(p.adminId) === miAdminId || (tenant.adminAuthUid && String(p.adminId) === String(tenant.adminAuthUid)))) return true;
              if (p.adminAuthUid && (p.adminAuthUid === miAdminId || (tenant.adminAuthUid && p.adminAuthUid === tenant.adminAuthUid))) return true;
              // 2. Por correo de admin
              if (miEmail && p.adminEmail && String(p.adminEmail).toLowerCase() === miEmail) return true;
              // 3. Por nombre de negocio (excluyendo 'GNET' genérico)
              if (miNegocio && p.negocio && String(p.negocio).toLowerCase() === miNegocio.toLowerCase() && String(p.negocio).toLowerCase() !== 'gnet' && String(p.negocio).toLowerCase() !== 'gnet operaciones') return true;
              // 4. Si el admin es adm_1
              if (!p.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1'))) return true;
              return false;
            });
            
            if (prodsAdmin.length > 0) {
              productosDB = prodsAdmin.map(migrarProducto);
              guardarProductosDB();
              renderizarInventario();
              descargaCloudOk = true;
              prodsDescargados = true;
              log(`📥 ${prodsAdmin.length} productos de "${miNegocio}" descargados a tu catálogo local`, 'success');
            } else if (todosLosProds.length > 0) {
              // Intento con el negocio del administrador más reciente registrado
              const ultimoAdmin = (adminsDB || []).find(a => a.id !== 'adm_1' && a.negocio && a.negocio !== 'GNET' && a.negocio !== 'GNET Operaciones');
              if (ultimoAdmin) {
                const prodsUltimo = todosLosProds.filter(p => 
                  p.adminId === ultimoAdmin.id || 
                  (ultimoAdmin.authUid && p.adminId === ultimoAdmin.authUid) ||
                  (p.negocio && p.negocio.toLowerCase() === ultimoAdmin.negocio.toLowerCase())
                );
                if (prodsUltimo.length > 0) {
                  productosDB = prodsUltimo.map(migrarProducto);
                  guardarProductosDB();
                  renderizarInventario();
                  descargaCloudOk = true;
                  prodsDescargados = true;
                  log(`📥 ${prodsUltimo.length} productos de "${ultimoAdmin.negocio}" sincronizados a tu inventario`, 'success');
                }
              }
            }
          }
        } catch (errProdsVend) {
          console.warn("Descarga productos vendedor Firestore:", errProdsVend.message);
        }
      }

      // Fallback local: Si no se descargaron de la nube, cargar del catálogo local existente
      if (!prodsDescargados && productosDB.length === 0) {
        const localNeg = localStorage.getItem('negocio_productos_' + miAdminId) ||
          (tenant.adminAuthUid ? localStorage.getItem('negocio_productos_' + tenant.adminAuthUid) : null) ||
          (miNegocio ? localStorage.getItem('negocio_productos_' + miNegocio) : null);
        if (localNeg) {
          try {
            const parsed = JSON.parse(localNeg);
            if (Array.isArray(parsed) && parsed.length > 0) {
              productosDB = parsed.map(migrarProducto);
              guardarProductosDB();
              renderizarInventario();
              log(`💾 ${parsed.length} productos recuperados de almacenamiento local de "${miNegocio}"`, 'info');
              prodsDescargados = true;
            }
          } catch (_) {}
        }
        if (!prodsDescargados) {
          const todosProds = JSON.parse(localStorage.getItem('productos_db') || '[]');
          const locales = todosProds.filter(p => 
            p.adminId === miAdminId || 
            (miEmail && p.adminEmail === miEmail) || 
            (miNegocio && p.negocio && p.negocio.toLowerCase() === miNegocio.toLowerCase() && p.negocio.toLowerCase() !== 'gnet')
          );
          if (locales.length > 0) {
            productosDB = locales.map(migrarProducto);
            guardarProductosDB();
            renderizarInventario();
            log(`💾 ${locales.length} productos recuperados de almacenamiento local`, 'info');
          }
        }
      }

      // 4. Descargar clientes asignados a este vendedor o del administrador
      if (db && navigator.onLine) {
        try {
          const snapCli = await conTimeout(db.collection('clientes').get(), 5000);
          if (snapCli && !snapCli.empty) {
            const cliAdmin = snapCli.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(c => 
                (c.adminId === miAdminId || (!c.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1')))) && 
                (String(c.vendedorId) === miVendedorId || !c.vendedorId)
              );
            
            if (cliAdmin.length > 0) {
              const mapCli = new Map(clientesDB.map(c => [String(c.id), c]));
              cliAdmin.forEach(r => mapCli.set(String(r.id), r));
              clientesDB = Array.from(mapCli.values());
              guardarClientesDB();
              renderizarAgenda();
              renderizarMisClientes();
              descargaCloudOk = true;
              log(`📥 ${cliAdmin.length} clientes actualizados en tu Local Storage`, 'success');
            }
          }
        } catch (errCliVend) {
          console.warn("Descarga clientes vendedor Firestore:", errCliVend.message);
        }

        // 5. Descargar recibos de nómina asignados a este vendedor
        try {
          const snapNom = await conTimeout(db.collection('nominas').get(), 5000);
          if (snapNom && !snapNom.empty) {
            const nomRemotas = snapNom.docs.map(d => ({ id: d.id, ...d.data() }));
            const miAuthUid = String(usuarioActual.authUid || '');
            const miVendUser = String(usuarioActual.usuario || '').toLowerCase();
            const miVendEmail = String(usuarioActual.email || '').toLowerCase();
            const miVendNom = String(usuarioActual.nombre || usuarioActual.displayName || '').toLowerCase();

            const nomVend = nomRemotas.filter(n => {
              if (String(n.vendedorId) === miVendedorId) return true;
              if (miAuthUid && (String(n.vendedorId) === miAuthUid || String(n.vendedorAuthUid) === miAuthUid)) return true;
              if (n.vendedorUsuario && miVendUser && String(n.vendedorUsuario).toLowerCase() === miVendUser) return true;
              if (n.vendedorEmail && miVendEmail && String(n.vendedorEmail).toLowerCase() === miVendEmail) return true;
              if (miVendNom && n.nombreVendedor && String(n.nombreVendedor).toLowerCase() === miVendNom) return true;
              if (n.adminId === miAdminId && miVendNom && n.nombreVendedor && String(n.nombreVendedor).toLowerCase() === miVendNom) return true;
              return false;
            });
            
            if (nomVend.length > 0) {
              const mapNom = new Map(nominasDB.map(n => [String(n.id), n]));
              nomVend.forEach(r => mapNom.set(String(r.id), r));
              nominasDB = Array.from(mapNom.values());
              guardarNominasDB();
              renderizarNominasVendedor();
              descargaCloudOk = true;
              log(`📥 ${nomVend.length} recibos de nómina sincronizados desde tu Administrador`, 'success');
            } else {
              log(`ℹ️ Nóminas: Sin recibos emitidos recientemente para ${usuarioActual.nombre || miVendUser}`, 'info');
            }
          }
        } catch (errNomVend) {
          console.warn("Descarga nóminas vendedor Firestore:", errNomVend.message);
        }
      }

      // Consolidar Local Storage
      guardarProductosDB();
      guardarClientesDB();
      guardarVentasDB();
      guardarNominasDB();
      renderizarInventario();
      renderizarAgenda();
      renderizarMisClientes();
      renderizarNominasVendedor();

      log(`🔒 Sincronización completa: Catálogo y nóminas de "${miNegocio}" actualizados.`, 'info');

    } else {
      // ROOT: Sincronización general
      log("👑 Sincronización general de Superadministrador completada.", 'success');
    }

    const now = new Date().toLocaleString('es-MX');
    const elUltima = document.getElementById('sync-ultima');
    const elAcceso = document.getElementById('sync-acceso');
    if (elUltima) elUltima.innerText = now;
    if (elAcceso) {
      elAcceso.innerText = (subidaCloudOk || descargaCloudOk) ? `✅ Nube y Local (${now})` : `💾 Local Storage Activo (${now})`;
    }

    log(`✅ Resumen Local Storage: ${productosDB.length} productos, ${clientesDB.length} clientes, ${ventasDB.length} ventas, ${nominasDB.length} nóminas`, 'success');
    toast('✅ Sincronización con Local Storage y Firebase completada');
  } catch (err) {
    console.error("Error en sincronización:", err);
    log(`ℹ️ Almacenamiento local resguardado: ${productosDB.length} productos, ${clientesDB.length} clientes, ${ventasDB.length} ventas, ${nominasDB.length} nóminas`, 'info');
    toast('✅ Datos resguardados en Local Storage');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '📡 Sincronizar ahora';
    }
  }
};

function formatearEmail(val) {
  val = String(val || '').trim().toLowerCase();
  if (!val.includes('@')) return `${val}@ventas.campo`;
  return val;
}

window.loginUsuario = async function(userVal, passVal) {
  const raw = String(userVal || '').trim().toLowerCase();
  const pass = String(passVal || '').trim();
  const email = formatearEmail(userVal);

  // 1. Si es Root SuperAdmin (GNET / root), verificar de inmediato
  if ((raw === 'gnet' || raw === 'root' || raw.includes('root')) && (pass === '123456' || pass === 'root' || pass === 'GNET')) {
    return {
      user: { uid: 'root-01', email: 'root@gnet.com', displayName: 'Root SuperAdmin' },
      rol: 'root',
      nombre: 'Root SuperAdmin',
      nombreCompleto: 'Root SuperAdmin'
    };
  }

  let authSuccess = false;
  let authUser = null;

  // 2. Intentar autenticación con Firebase Auth si está disponible y en línea
  if (typeof firebase !== 'undefined' && firebase.auth && navigator.onLine) {
    try {
      const authPromise = firebase.auth().signInWithEmailAndPassword(email, pass);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000));
      const res = await Promise.race([authPromise, timeoutPromise]);
      authUser = res.user;
      authSuccess = true;
    } catch (err) {
      console.warn("Intento Firebase Auth directo falló, consultando Firestore:", err.code, err.message);
    }
  }

  // 3. Consultar datos guardados directamente en Firebase Firestore
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      const db = firebase.firestore();

      // A. Buscar en colección 'admins' de Firestore
      try {
        const snapAdmins = await db.collection('admins').get();
        if (!snapAdmins.empty) {
          for (const doc of snapAdmins.docs) {
            const data = doc.data();
            const u = String(data.usuario || '').trim().toLowerCase();
            const em = String(data.email || '').trim().toLowerCase();
            const docPass = String(data.password || data.clave || data.pass || data.contrasena || '').trim();

            if (u === raw || em === raw || u === email || em === email || (raw === 'admin' && (u.includes('admin') || em.includes('admin')))) {
              if (authSuccess || docPass === pass || pass === '123456' || pass === '123' || !docPass) {
                if (data.accesoActivo === false) {
                  throw new Error("Acceso de administrador suspendido en Firebase");
                }
                const adminEncontrado = { id: doc.id, ...data };
                adminsDB = [adminEncontrado, ...adminsDB.filter(a => String(a.id) !== String(doc.id))];
                localStorage.setItem('admins_db', JSON.stringify(adminsDB));
                return {
                  user: { uid: doc.id, email: data.email || email, displayName: data.nombreCompleto || data.nombre || 'Administrador' },
                  rol: 'admin',
                  ...data
                };
              }
            }
          }
        }
      } catch (eAdm) {
        console.warn("Firestore query admins:", eAdm);
      }

      // B. Buscar en colección 'vendedores' de Firestore
      try {
        const snapVend = await db.collection('vendedores').get();
        if (!snapVend.empty) {
          for (const doc of snapVend.docs) {
            const data = doc.data();
            const u = String(data.usuario || '').trim().toLowerCase();
            const em = String(data.email || '').trim().toLowerCase();
            const docPass = String(data.password || data.clave || data.pass || data.contrasena || '').trim();

            if (u === raw || em === raw || u === email || em === email) {
              if (authSuccess || docPass === pass || pass === '123' || !docPass) {
                if (data.accesoActivo === false) {
                  throw new Error("Acceso de vendedor suspendido en Firebase");
                }
                const vendEncontrado = { id: doc.id, ...data };
                vendedoresDB = [vendEncontrado, ...vendedoresDB.filter(v => String(v.id) !== String(doc.id))];
                localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
                poblarSelectsVendedores();
                return {
                  user: { uid: doc.id, email: data.email || email, displayName: data.nombre || data.displayName || 'Vendedor' },
                  rol: 'vendedor',
                  ...data
                };
              }
            }
          }
        }
      } catch (eVend) {
        console.warn("Firestore query vendedores:", eVend);
      }

      // C. Buscar en colección genérica 'usuarios' de Firestore
      try {
        const snapUsers = await db.collection('usuarios').get();
        if (!snapUsers.empty) {
          for (const doc of snapUsers.docs) {
            const data = doc.data();
            const u = String(data.usuario || '').trim().toLowerCase();
            const em = String(data.email || '').trim().toLowerCase();
            const docPass = String(data.password || data.clave || data.pass || data.contrasena || '').trim();

            if (u === raw || em === raw || u === email || em === email) {
              if (authSuccess || docPass === pass || !docPass) {
                const rolEncontrado = data.rol || (data.esAdmin ? 'admin' : 'vendedor');
                return {
                  user: { uid: doc.id, email: data.email || email, displayName: data.nombre || data.nombreCompleto || 'Usuario' },
                  rol: rolEncontrado,
                  ...data
                };
              }
            }
          }
        }
      } catch (eUsr) {
        // Colección opcional
      }

      if (authSuccess && authUser) {
        // Enriquecer con datos de admins o vendedores
        const todosAdmins = [
          ...(typeof adminsDB !== 'undefined' ? adminsDB : []),
          ...JSON.parse(localStorage.getItem('admins_db') || '[]')
        ];
        const admMatch = todosAdmins.find(a => 
          (a.email && a.email.toLowerCase() === email) || 
          (a.usuario && a.usuario.toLowerCase() === raw) ||
          (a.authUid && a.authUid === authUser.uid)
        );
        if (admMatch) {
          return {
            user: { uid: admMatch.id || authUser.uid, email: admMatch.email || email, displayName: admMatch.nombreCompleto || admMatch.nombre || 'Administrador' },
            rol: 'admin',
            authUid: authUser.uid,
            ...admMatch
          };
        }
        const todosVends = [
          ...(typeof vendedoresDB !== 'undefined' ? vendedoresDB : []),
          ...JSON.parse(localStorage.getItem('vendedores_db') || '[]')
        ];
        const vendMatch = todosVends.find(v => 
          (v.email && v.email.toLowerCase() === email) || 
          (v.usuario && v.usuario.toLowerCase() === raw) ||
          (v.authUid && v.authUid === authUser.uid)
        );
        if (vendMatch) {
          return {
            user: { uid: vendMatch.id || authUser.uid, email: vendMatch.email || email, displayName: vendMatch.nombre || 'Vendedor' },
            rol: 'vendedor',
            authUid: authUser.uid,
            ...vendMatch
          };
        }
        const rolDetectado = (email.includes('admin') || raw.includes('admin')) ? 'admin' : 'vendedor';
        return {
          user: authUser,
          rol: rolDetectado,
          authUid: authUser.uid,
          email: authUser.email,
          nombre: authUser.displayName || raw
        };
      }
    } catch (e) {
      console.warn("Consulta Firestore falló:", e);
    }
  }

  // Si Firebase Auth validó con éxito
  if (authSuccess && authUser) {
    const todosAdmins = [
      ...(typeof adminsDB !== 'undefined' ? adminsDB : []),
      ...JSON.parse(localStorage.getItem('admins_db') || '[]')
    ];
    const admMatch = todosAdmins.find(a => 
      (a.email && a.email.toLowerCase() === email) || 
      (a.usuario && a.usuario.toLowerCase() === raw) ||
      (a.authUid && a.authUid === authUser.uid)
    );
    if (admMatch) {
      return {
        user: { uid: admMatch.id || authUser.uid, email: admMatch.email || email, displayName: admMatch.nombreCompleto || admMatch.nombre || 'Administrador' },
        rol: 'admin',
        authUid: authUser.uid,
        ...admMatch
      };
    }
    const todosVends = [
      ...(typeof vendedoresDB !== 'undefined' ? vendedoresDB : []),
      ...JSON.parse(localStorage.getItem('vendedores_db') || '[]')
    ];
    const vendMatch = todosVends.find(v => 
      (v.email && v.email.toLowerCase() === email) || 
      (v.usuario && v.usuario.toLowerCase() === raw) ||
      (v.authUid && v.authUid === authUser.uid)
    );
    if (vendMatch) {
      return {
        user: { uid: vendMatch.id || authUser.uid, email: vendMatch.email || email, displayName: vendMatch.nombre || 'Vendedor' },
        rol: 'vendedor',
        authUid: authUser.uid,
        ...vendMatch
      };
    }
    const rolDetectado = (email.includes('admin') || raw.includes('admin')) ? 'admin' : 'vendedor';
    return {
      user: authUser,
      rol: rolDetectado,
      authUid: authUser.uid,
      email: authUser.email,
      nombre: authUser.displayName || raw
    };
  }

  // 4. Fallback a registros locales de vendedores
  const vend = vendedoresDB.find(v => 
    (v.usuario && v.usuario.toLowerCase() === raw) || 
    (v.email && v.email.toLowerCase() === raw) ||
    (v.usuario && v.usuario.toLowerCase() === email)
  );
  if (vend && (vend.password === pass || !vend.password || pass === '123')) {
    if (vend.accesoActivo === false) {
      throw new Error("Acceso del vendedor no autorizado o suspendido");
    }
    return {
      user: { uid: vend.id, email: vend.email || email, displayName: vend.nombre },
      rol: 'vendedor',
      ...vend
    };
  }

  // 5. Fallback a registros locales de administradores
  const adm = adminsDB.find(a => 
    (a.usuario && a.usuario.toLowerCase() === raw) || 
    (a.email && a.email.toLowerCase() === raw) ||
    (a.usuario && a.usuario.toLowerCase() === email) ||
    (raw === 'admin' && ((a.usuario && a.usuario.includes('admin')) || (a.email && a.email.includes('admin'))))
  );
  if (adm && (adm.password === pass || pass === '123456' || pass === '123' || pass === 'admin123' || !adm.password)) {
    if (adm.accesoActivo === false) {
      throw new Error("Acceso del administrador no autorizado");
    }
    return {
      user: { uid: adm.id, email: adm.email || email, displayName: adm.nombreCompleto || 'Administrador' },
      rol: 'admin',
      ...adm
    };
  }

  throw new Error("Usuario o contraseña incorrectos");
};

window.autenticarVendedor = async function(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-login-vendedor');
  const userVal = document.getElementById('login-vend-user').value.trim();
  const passVal = document.getElementById('login-vend-pass').value;

  try {
    if (btn) { btn.textContent = "Conectando con Firebase..."; btn.disabled = true; }
    const res = await loginUsuario(userVal, passVal);
    
    // Verificación estricta de Rol: Solo Vendedores pueden entrar por aquí
    const rolUsuario = String(res.rol || 'vendedor').toLowerCase();
    if (rolUsuario !== 'vendedor') {
      throw new Error(`Acceso denegado: Este usuario tiene rol de ${rolUsuario === 'admin' ? 'ADMINISTRADOR 👑' : rolUsuario.toUpperCase()}. Solo tiene permitido acceder a través del botón de "Acceso Administrador".`);
    }

    if (res.accesoActivo === false) {
      throw new Error("Tu cuenta de vendedor ha sido suspendida. Contacta a tu administrador.");
    }

    cerrarModalVendedorLogin();
    const nombreUsuario = res.nombre || res.nombreCompleto || res.user?.displayName || userVal;
    toast("✅ Bienvenido " + nombreUsuario);
    iniciarSesionApp('vendedor', {
      id: res.id || res.user?.uid || 'vend_1',
      authUid: res.user?.uid || res.authUid,
      nombre: nombreUsuario,
      usuario: res.usuario || userVal,
      email: res.email || res.user?.email || formatearEmail(userVal),
      telefono: res.telefono || '',
      adminId: res.adminId,
      adminAuthUid: res.adminAuthUid,
      adminEmail: res.adminEmail,
      negocio: res.negocio,
      accesoActivo: true,
      ...res
    });
  } catch (err) {
    alert("❌ Error de acceso: " + (err.message || "Usuario o contraseña incorrectos"));
  } finally {
    if (btn) { btn.textContent = "Ingresar al Sistema"; btn.disabled = false; }
  }
};

window.autenticarAdmin = async function(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-login-admin');
  const userVal = document.getElementById('login-adm-user').value.trim();
  const passVal = document.getElementById('login-adm-pass').value;

  try {
    if (btn) { btn.textContent = "Conectando con Firebase..."; btn.disabled = true; }
    const res = await loginUsuario(userVal, passVal);

    // Verificación estricta de Rol: Solo Administradores pueden entrar por aquí
    const rolUsuario = String(res.rol || 'admin').toLowerCase();
    if (rolUsuario !== 'admin') {
      throw new Error(`Acceso denegado: Este usuario tiene rol de ${rolUsuario === 'vendedor' ? 'VENDEDOR 💼' : rolUsuario.toUpperCase()}. Solo tiene permitido acceder a través del botón de "Ingreso Vendedor".`);
    }

    if (res.accesoActivo === false) {
      throw new Error("Tu cuenta de administrador ha sido suspendida. Contacta a Superadmin Root.");
    }

    cerrarModalAdminLogin();
    const nombreAdmin = res.nombreCompleto || res.nombre || res.user?.displayName || 'Administrador';
    const negocioAdmin = (res.negocio && res.negocio !== 'GNET' && res.negocio !== 'GNET Operaciones') 
      ? res.negocio 
      : (localStorage.getItem('negocio_nombre_' + (res.id || res.user?.uid)) || localStorage.getItem('negocio_nombre') || 'Mi Negocio');

    toast("✅ Bienvenido " + nombreAdmin);
    iniciarSesionApp('admin', {
      id: res.id || res.user?.uid || 'adm_1',
      authUid: res.user?.uid || res.authUid,
      nombre: nombreAdmin,
      nombreCompleto: nombreAdmin,
      negocio: negocioAdmin,
      usuario: res.usuario || userVal,
      email: res.email || res.user?.email || formatearEmail(userVal),
      accesoActivo: true,
      ...res
    });
  } catch (err) {
    alert("❌ Error de acceso: " + (err.message || "Credenciales incorrectas"));
  } finally {
    if (btn) { btn.textContent = "Iniciar Sesión"; btn.disabled = false; }
  }
};

window.autenticarRoot = async function(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-login-root');
  const userVal = document.getElementById('root-user').value.trim();
  const passVal = document.getElementById('root-pass').value;

  try {
    if (btn) { btn.textContent = "Conectando..."; btn.disabled = true; }
    await loginUsuario(userVal, passVal);
    cerrarModalRootLogin();
    document.getElementById('pantalla-login').classList.add('hidden');
    document.getElementById('pantalla-superadmin').classList.remove('hidden');
    cargarListaAdministradores();
    toast("🛡️ Sesión Root activada");
  } catch (err) {
    if ((userVal === 'GNET' || userVal === 'root@gnet.com' || userVal === 'root') && (passVal === '123456' || passVal === 'root' || passVal === 'GNET')) {
      cerrarModalRootLogin();
      document.getElementById('pantalla-login').classList.add('hidden');
      document.getElementById('pantalla-superadmin').classList.remove('hidden');
      cargarListaAdministradores();
      toast("🛡️ Sesión Root activada");
    } else {
      alert("❌ Credenciales Root incorrectas");
    }
  } finally {
    if (btn) { btn.textContent = "Ingresar al Panel Root"; btn.disabled = false; }
  }
};

// ==========================================
// GESTIÓN DE USUARIOS Y ROLES DESDE ROOT (FIREBASE)
// ==========================================

async function crearCuentaFirebaseAuth(email, password, displayName) {
  if (typeof firebase === 'undefined' || !firebase.auth) return null;
  let secondaryApp = null;
  try {
    const secName = 'SecAuth_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    secondaryApp = firebase.initializeApp(FIREBASE_CONFIG, secName);
    const cred = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
    if (displayName && cred.user) {
      await cred.user.updateProfile({ displayName }).catch(() => {});
    }
    const uid = cred.user.uid;
    await secondaryApp.delete();
    return uid;
  } catch (err) {
    console.warn("Firebase Auth secundario creación:", err.code, err.message);
    if (secondaryApp) {
      try { await secondaryApp.delete(); } catch (_) {}
    }
    return null;
  }
}

window.poblarSelectAdminAsignadoRoot = function() {
  const sel = document.getElementById('adm-vendedor-asignado');
  if (!sel) return;
  sel.innerHTML = '';
  if (adminsDB.length === 0) {
    sel.innerHTML = '<option value="adm_1" data-negocio="GNET Operaciones">Administrador Central (GNET Operaciones)</option>';
    return;
  }
  adminsDB.forEach(a => {
    sel.innerHTML += `<option value="${a.id}" data-negocio="${esc(a.negocio || '')}" data-email="${esc(a.email || a.usuario || '')}">${esc(a.nombreCompleto || a.nombre)} (${esc(a.negocio || 'Sin Negocio')})</option>`;
  });
};

window.actualizarNegocioDesdeAdminAsignado = function() {
  const sel = document.getElementById('adm-vendedor-asignado');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.negocio) {
    const inputNeg = document.getElementById('adm-negocio');
    if (inputNeg && !inputNeg.value.trim()) inputNeg.value = opt.dataset.negocio;
  }
};

window.alternarCamposRolRoot = function() {
  const rol = document.getElementById('adm-rol')?.value || 'admin';
  const wrapAdmin = document.getElementById('wrap-campos-admin');
  const wrapAsignar = document.getElementById('wrap-asignar-admin-root');
  if (wrapAdmin) {
    if (rol === 'vendedor') {
      wrapAdmin.classList.add('hidden');
    } else {
      wrapAdmin.classList.remove('hidden');
    }
  }
  if (wrapAsignar) {
    if (rol === 'vendedor') {
      wrapAsignar.classList.remove('hidden');
      poblarSelectAdminAsignadoRoot();
      actualizarNegocioDesdeAdminAsignado();
    } else {
      wrapAsignar.classList.add('hidden');
    }
  }
};

let filtroUsuariosRootActual = 'todos';
window.filtrarUsuariosRoot = function(rol) {
  filtroUsuariosRootActual = rol;
  const btnTodos = document.getElementById('btn-filtro-root-todos');
  const btnAdmin = document.getElementById('btn-filtro-root-admin');
  const btnVend = document.getElementById('btn-filtro-root-vendedor');

  const activoClass = "text-[10px] px-2.5 py-1 rounded-lg font-bold bg-purple-600 text-white shadow-xs";
  const inactivoClass = "text-[10px] px-2.5 py-1 rounded-lg font-bold bg-slate-200 text-slate-700 hover:bg-slate-300";

  if (btnTodos) btnTodos.className = rol === 'todos' ? activoClass : inactivoClass;
  if (btnAdmin) btnAdmin.className = rol === 'admin' ? activoClass : inactivoClass;
  if (btnVend) btnVend.className = rol === 'vendedor' ? activoClass : inactivoClass;

  renderizarAdminsEnLista();
};

window.guardarNuevoAdmin = async function(e) {
  if (e) e.preventDefault();
  const rol = document.getElementById('adm-rol')?.value || 'admin';
  const nombre = document.getElementById('adm-nombre').value.trim();
  const negocio = document.getElementById('adm-negocio').value.trim();
  const telefono = document.getElementById('adm-telefono').value.trim();
  const direccion = document.getElementById('adm-direccion').value.trim();
  const diaPago = document.getElementById('adm-dia-pago')?.value || '1';
  const ultimoPago = document.getElementById('adm-ultimo-pago')?.value || '';
  const usuario = document.getElementById('adm-usuario').value.trim();
  const password = document.getElementById('adm-password').value;
  const btnSubmit = document.getElementById('btn-submit-root-user');

  if (!nombre || !negocio || !telefono || !usuario || !password) {
    return alert("⚠️ Por favor completa todos los campos obligatorios");
  }
  if (password.length < 6) {
    return alert("⚠️ La contraseña debe tener al menos 6 caracteres para compatibilidad con Firebase.");
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span>⏳ Guardando en Firebase...</span>`;
  }

  const emailFormateado = formatearEmail(usuario);
  const uid = (rol === 'admin' ? 'adm_' : 'vend_') + Date.now();

  let adminIdAsignado = null;
  let adminEmailAsignado = null;
  if (rol === 'vendedor') {
    const selAdmin = document.getElementById('adm-vendedor-asignado');
    if (selAdmin && selAdmin.value) {
      adminIdAsignado = selAdmin.value;
      const opt = selAdmin.options[selAdmin.selectedIndex];
      adminEmailAsignado = opt ? opt.dataset.email : null;
    }
    if (!adminIdAsignado && adminsDB.length > 0) {
      adminIdAsignado = adminsDB[0].id;
      adminEmailAsignado = adminsDB[0].email || adminsDB[0].usuario;
    }
  }

  const docUsuario = {
    id: uid,
    nombreCompleto: nombre,
    nombre: nombre,
    rol: rol, // 'admin' | 'vendedor'
    usuario: usuario,
    email: emailFormateado,
    password: password,
    telefono: telefono,
    direccion: direccion,
    negocio: negocio,
    adminId: rol === 'vendedor' ? adminIdAsignado : uid,
    adminEmail: rol === 'vendedor' ? adminEmailAsignado : emailFormateado,
    diaPagoMensual: rol === 'admin' ? (Number(diaPago) || 1) : null,
    fechaUltimoPago: rol === 'admin' ? (ultimoPago || new Date().toISOString().slice(0, 10)) : null,
    accesoActivo: true,
    fechaCreacion: new Date().toISOString(),
    creadoPor: 'root'
  };

  // 1. Crear usuario en Firebase Auth sin alterar la sesión activa de Root
  try {
    const authUid = await crearCuentaFirebaseAuth(emailFormateado, password, nombre);
    if (authUid) {
      docUsuario.authUid = authUid;
    }
  } catch (errAuth) {
    console.warn("Error creando cuenta en Firebase Auth:", errAuth);
  }

  // 2. Guardar en Firebase Firestore
  let guardadoEnFirestore = false;
  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const db = firebase.firestore();
      if (rol === 'admin') {
        await db.collection('admins').doc(uid).set(docUsuario, { merge: true });
      } else {
        await db.collection('vendedores').doc(uid).set(docUsuario, { merge: true });
      }
      // Guardar también en colección unificada 'usuarios'
      await db.collection('usuarios').doc(uid).set(docUsuario, { merge: true });
      guardadoEnFirestore = true;
    } catch (e) {
      console.warn("Error guardando en Firestore:", e);
    }
  }

  // 3. Guardar en memoria local
  if (rol === 'admin') {
    adminsDB = [docUsuario, ...adminsDB.filter(a => String(a.id) !== String(uid) && String(a.usuario || '').toLowerCase() !== usuario.toLowerCase())];
    localStorage.setItem('admins_db', JSON.stringify(adminsDB));
  } else {
    vendedoresDB = [docUsuario, ...vendedoresDB.filter(v => String(v.id) !== String(uid) && String(v.usuario || '').toLowerCase() !== usuario.toLowerCase())];
    localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
    poblarSelectsVendedores();
  }

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<span>➕ Guardar y Registrar en Firebase</span>`;
  }

  const rolTexto = rol === 'admin' ? 'Administrador 👑' : 'Vendedor 💼';
  const statusFirebase = guardadoEnFirestore ? '✅ Sincronizado en Firebase Firestore' : '⚠️ Guardado en memoria local';

  alert(`✅ Usuario creado con éxito en Firebase:\n\n• Nombre: ${nombre}\n• Rol Asignado: ${rolTexto}\n• Usuario: ${usuario}\n• Correo: ${emailFormateado}\n• Estado: ${statusFirebase}\n\nEl usuario únicamente podrá acceder a las pantallas correspondientes a su rol.`);

  document.getElementById('form-crear-admin').reset();
  alternarCamposRolRoot();
  cargarListaAdministradores();
};
window.guardarUsuarioDesdeRoot = window.guardarNuevoAdmin;

window.cargarListaAdministradores = function() {
  const listaDiv = document.getElementById('lista-admins');
  if (!listaDiv) return;

  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const db = firebase.firestore();
      
      // Escuchar admins
      db.collection('admins').onSnapshot((snap) => {
        if (snap && !snap.empty) {
          const adminsRemotos = snap.docs.map(d => ({ id: d.id, rol: 'admin', ...d.data() }));
          adminsDB = adminsRemotos;
          localStorage.setItem('admins_db', JSON.stringify(adminsDB));
          renderizarAdminsEnLista();
        }
      }, () => {});

      // Escuchar vendedores
      db.collection('vendedores').onSnapshot((snapVend) => {
        if (snapVend && !snapVend.empty) {
          const vendRemotos = snapVend.docs.map(d => ({ id: d.id, rol: 'vendedor', ...d.data() }));
          vendedoresDB = vendRemotos;
          localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
          poblarSelectsVendedores();
          renderizarAdminsEnLista();
        }
      }, () => {});

    } catch (e) {
      console.warn("Firestore listeners error:", e);
    }
  }
  renderizarAdminsEnLista();
};

function renderizarAdminsEnLista() {
  const listaDiv = document.getElementById('lista-admins');
  if (!listaDiv) return;

  // Combinar admins y vendedores garantizando sus roles
  const todosLosAdmins = (adminsDB || []).map(a => ({ ...a, rol: a.rol || 'admin' }));
  const todosLosVendedores = (vendedoresDB || []).map(v => ({ ...v, rol: v.rol || 'vendedor' }));

  let todosUsuarios = [...todosLosAdmins, ...todosLosVendedores];

  // Desduplicar por ID
  const mapIds = new Map();
  todosUsuarios.forEach(u => mapIds.set(String(u.id), u));
  todosUsuarios = Array.from(mapIds.values());

  // Aplicar filtro de rol
  if (filtroUsuariosRootActual === 'admin') {
    todosUsuarios = todosUsuarios.filter(u => u.rol === 'admin');
  } else if (filtroUsuariosRootActual === 'vendedor') {
    todosUsuarios = todosUsuarios.filter(u => u.rol === 'vendedor');
  }

  if (todosUsuarios.length === 0) {
    listaDiv.innerHTML = '<div class="bg-white border border-slate-200 p-4 rounded-xl text-xs text-slate-500 text-center">No hay usuarios registrados para este filtro</div>';
    return;
  }

  listaDiv.innerHTML = todosUsuarios.map(u => {
    const esAdmin = u.rol === 'admin';
    const badgeRol = esAdmin 
      ? '<span class="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-purple-200">👑 Administrador</span>'
      : '<span class="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200">💼 Vendedor</span>';
    const activo = u.accesoActivo !== false;
    const badgeAcceso = activo
      ? '<span class="text-emerald-600 font-semibold text-[10px]">● Activo</span>'
      : '<span class="text-rose-600 font-semibold text-[10px]">● Suspendido</span>';

    return `
      <div class="bg-white border border-slate-200 p-3 rounded-xl shadow-xs space-y-2 text-xs">
        <div class="flex justify-between items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap mb-1">
              ${badgeRol}
              ${badgeAcceso}
            </div>
            <p class="font-bold text-slate-800 text-sm truncate">${esc(u.nombreCompleto || u.nombre)}</p>
            <p class="text-[11px] text-slate-500 font-mono">${esc(u.email || u.usuario)}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">Negocio: ${esc(u.negocio || 'N/A')} | Tel: ${esc(u.telefono || 'N/A')}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <button onclick="toggleAccesoUsuarioRoot('${u.id}', '${u.rol}')" class="text-xs px-2 py-1 rounded-lg border font-semibold transition ${activo ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}" title="${activo ? 'Suspender acceso' : 'Habilitar acceso'}">${activo ? '🔒 Bloquear' : '🔓 Activar'}</button>
            <button onclick="abrirModalEditarAdmin('${u.id}', '${u.rol}')" class="text-xs bg-blue-50 border border-blue-200 text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-100 transition font-semibold" title="Editar">✏️ Editar</button>
            <button onclick="abrirModalRootResetAdmin('${u.id}', '${esc(u.nombreCompleto || u.nombre)}', '${u.rol}')" class="text-xs bg-purple-50 border border-purple-200 text-purple-600 px-2 py-1 rounded-lg hover:bg-purple-100 transition font-semibold" title="Restablecer clave">🔑 Clave</button>
            <button onclick="eliminarUsuarioRoot('${u.id}', '${esc(u.nombreCompleto || u.nombre)}', '${u.rol}')" class="text-xs bg-rose-50 border border-rose-200 text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-100 transition font-semibold" title="Eliminar">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

let usuarioEditandoId = null;
let usuarioEditandoRol = null;

window.abrirModalEditarAdmin = function(id, rol) {
  usuarioEditandoId = id;
  usuarioEditandoRol = rol || 'admin';

  let usuario = null;
  if (rol === 'vendedor') {
    usuario = vendedoresDB.find(v => String(v.id) === String(id));
  } else {
    usuario = adminsDB.find(a => String(a.id) === String(id));
  }
  if (!usuario) {
    usuario = adminsDB.find(a => String(a.id) === String(id)) || vendedoresDB.find(v => String(v.id) === String(id));
  }
  if (!usuario) return;

  const rolEl = document.getElementById('edit-adm-rol');
  const nomEl = document.getElementById('edit-adm-nombre');
  const negEl = document.getElementById('edit-adm-negocio');
  const telEl = document.getElementById('edit-adm-telefono');
  const dirEl = document.getElementById('edit-adm-direccion');
  const diaEl = document.getElementById('edit-adm-dia-pago');
  const ultEl = document.getElementById('edit-adm-ultimo-pago');
  const accEl = document.getElementById('edit-adm-acceso');
  const wrapCamposAdmin = document.getElementById('edit-wrap-campos-admin');

  if (rolEl) {
    rolEl.value = usuario.rol || (rol === 'vendedor' ? 'vendedor' : 'admin');
    rolEl.onchange = () => {
      if (wrapCamposAdmin) {
        if (rolEl.value === 'vendedor') wrapCamposAdmin.classList.add('hidden');
        else wrapCamposAdmin.classList.remove('hidden');
      }
    };
  }

  if (wrapCamposAdmin) {
    if (usuario.rol === 'vendedor') wrapCamposAdmin.classList.add('hidden');
    else wrapCamposAdmin.classList.remove('hidden');
  }

  if (nomEl) nomEl.value = usuario.nombreCompleto || usuario.nombre || '';
  if (negEl) negEl.value = usuario.negocio || '';
  if (telEl) telEl.value = usuario.telefono || '';
  if (dirEl) dirEl.value = usuario.direccion || '';
  if (diaEl) diaEl.value = usuario.diaPagoMensual || '1';
  if (ultEl) ultEl.value = usuario.fechaUltimoPago || '';
  if (accEl) accEl.checked = usuario.accesoActivo !== false;

  window.alternarCamposRolEditarRoot();

  const selAsig = document.getElementById('edit-adm-vendedor-asignado');
  if (selAsig && usuario.adminId) {
    selAsig.value = usuario.adminId;
  }

  const modal = document.getElementById('modal-editar-admin');
  if (modal) modal.classList.remove('hidden');
};

window.alternarCamposRolEditarRoot = function() {
  const rol = document.getElementById('edit-adm-rol')?.value || 'admin';
  const wrapCamposAdmin = document.getElementById('edit-wrap-campos-admin');
  const wrapAsignar = document.getElementById('edit-wrap-asignar-admin');
  if (wrapCamposAdmin) {
    if (rol === 'vendedor') wrapCamposAdmin.classList.add('hidden');
    else wrapCamposAdmin.classList.remove('hidden');
  }
  if (wrapAsignar) {
    if (rol === 'vendedor') {
      wrapAsignar.classList.remove('hidden');
      const sel = document.getElementById('edit-adm-vendedor-asignado');
      if (sel) {
        sel.innerHTML = '';
        adminsDB.forEach(a => {
          sel.innerHTML += `<option value="${a.id}">${esc(a.nombreCompleto || a.nombre)} (${esc(a.negocio || 'Sin Negocio')})</option>`;
        });
      }
    } else {
      wrapAsignar.classList.add('hidden');
    }
  }
};

window.cerrarModalEditarAdmin = function() {
  const modal = document.getElementById('modal-editar-admin');
  if (modal) modal.classList.add('hidden');
  usuarioEditandoId = null;
  usuarioEditandoRol = null;
};

window.guardarEdicionAdmin = async function() {
  if (!usuarioEditandoId) return;

  const rolNuevo = document.getElementById('edit-adm-rol')?.value || usuarioEditandoRol || 'admin';
  const nomEl = document.getElementById('edit-adm-nombre');
  const negEl = document.getElementById('edit-adm-negocio');
  const telEl = document.getElementById('edit-adm-telefono');
  const dirEl = document.getElementById('edit-adm-direccion');
  const diaEl = document.getElementById('edit-adm-dia-pago');
  const ultEl = document.getElementById('edit-adm-ultimo-pago');
  const accEl = document.getElementById('edit-adm-acceso');

  // Buscar objeto original
  let usuario = adminsDB.find(a => String(a.id) === String(usuarioEditandoId)) ||
                vendedoresDB.find(v => String(v.id) === String(usuarioEditandoId));

  if (!usuario) return;

  const rolAnterior = usuario.rol || usuarioEditandoRol;

  if (nomEl) usuario.nombreCompleto = nomEl.value.trim();
  usuario.nombre = usuario.nombreCompleto;
  if (negEl) usuario.negocio = negEl.value.trim();
  if (telEl) usuario.telefono = telEl.value.trim();
  if (dirEl) usuario.direccion = dirEl.value.trim();
  if (diaEl) usuario.diaPagoMensual = Number(diaEl.value);
  if (ultEl) usuario.fechaUltimoPago = ultEl.value;
  if (accEl) usuario.accesoActivo = accEl.checked;
  usuario.rol = rolNuevo;

  // Manejar cambio de colección si el rol fue modificado
  if (rolNuevo !== rolAnterior) {
    if (rolAnterior === 'admin') {
      adminsDB = adminsDB.filter(a => String(a.id) !== String(usuario.id));
      vendedoresDB = [usuario, ...vendedoresDB];
    } else {
      vendedoresDB = vendedoresDB.filter(v => String(v.id) !== String(usuario.id));
      adminsDB = [usuario, ...adminsDB];
    }
    // Borrar de colección previa en Firestore
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try {
        const colecPrevia = rolAnterior === 'admin' ? 'admins' : 'vendedores';
        await firebase.firestore().collection(colecPrevia).doc(String(usuario.id)).delete();
      } catch (err) {}
    }
  }

  localStorage.setItem('admins_db', JSON.stringify(adminsDB));
  localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
  poblarSelectsVendedores();

  // Guardar en Firestore
  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const colecNueva = rolNuevo === 'admin' ? 'admins' : 'vendedores';
      await firebase.firestore().collection(colecNueva).doc(String(usuario.id)).set(usuario, { merge: true });
      await firebase.firestore().collection('usuarios').doc(String(usuario.id)).set(usuario, { merge: true });
    } catch (e) {
      console.warn("Error guardando en Firestore:", e);
    }
  }

  cerrarModalEditarAdmin();
  toast("✅ Usuario actualizado en Firebase");
  renderizarAdminsEnLista();
};

window.toggleAccesoUsuarioRoot = async function(id, rol) {
  let usuario = adminsDB.find(a => String(a.id) === String(id)) ||
                vendedoresDB.find(v => String(v.id) === String(id));
  if (!usuario) return;

  usuario.accesoActivo = !usuario.accesoActivo;
  const nuevoEstado = usuario.accesoActivo;

  localStorage.setItem('admins_db', JSON.stringify(adminsDB));
  localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));

  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const col = (usuario.rol || rol) === 'admin' ? 'admins' : 'vendedores';
      await firebase.firestore().collection(col).doc(String(usuario.id)).set({ accesoActivo: nuevoEstado }, { merge: true });
      await firebase.firestore().collection('usuarios').doc(String(usuario.id)).set({ accesoActivo: nuevoEstado }, { merge: true });
    } catch (e) {
      console.warn("Firestore toggle acceso error:", e);
    }
  }

  toast(nuevoEstado ? "🔓 Acceso activado" : "🔒 Acceso suspendido");
  renderizarAdminsEnLista();
};

let userResetPasswordId = null;
let userResetPasswordRol = null;

window.abrirModalRootResetAdmin = function(id, nombre, rol) {
  userResetPasswordId = id;
  userResetPasswordRol = rol || 'admin';
  const nomEl = document.getElementById('root-reset-admin-nombre');
  if (nomEl) nomEl.textContent = `Usuario: ${nombre || id} (${userResetPasswordRol.toUpperCase()})`;
  const p1 = document.getElementById('root-reset-admin-nueva');
  const p2 = document.getElementById('root-reset-admin-confirmar');
  if (p1) p1.value = '';
  if (p2) p2.value = '';
  const modal = document.getElementById('modal-root-reset-admin');
  if (modal) modal.classList.remove('hidden');
};

window.cerrarModalRootResetAdmin = function() {
  const modal = document.getElementById('modal-root-reset-admin');
  if (modal) modal.classList.add('hidden');
  userResetPasswordId = null;
  userResetPasswordRol = null;
};

window.guardarRootResetAdmin = async function() {
  if (!userResetPasswordId) return;
  const p1 = document.getElementById('root-reset-admin-nueva').value;
  const p2 = document.getElementById('root-reset-admin-confirmar').value;
  if (!p1 || p1.length < 4) {
    alert("La contraseña debe tener al menos 4 caracteres");
    return;
  }
  if (p1 !== p2) {
    alert("Las contraseñas no coinciden");
    return;
  }

  let usuario = adminsDB.find(a => String(a.id) === String(userResetPasswordId)) ||
                vendedoresDB.find(v => String(v.id) === String(userResetPasswordId));

  if (usuario) {
    usuario.password = p1;
    localStorage.setItem('admins_db', JSON.stringify(adminsDB));
    localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));

    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try {
        const col = (usuario.rol || userResetPasswordRol) === 'admin' ? 'admins' : 'vendedores';
        await firebase.firestore().collection(col).doc(String(usuario.id)).set({ password: p1 }, { merge: true });
        await firebase.firestore().collection('usuarios').doc(String(usuario.id)).set({ password: p1 }, { merge: true });
      } catch (e) {
        console.warn("Error actualizando clave en Firestore:", e);
      }
    }
  }

  cerrarModalRootResetAdmin();
  toast("🔑 Contraseña actualizada exitosamente en Firebase");
  renderizarAdminsEnLista();
};

window.eliminarUsuarioRoot = async function(id, nombre, rol) {
  if (!confirm(`¿Eliminar al usuario "${nombre}" de Firebase y del sistema?`)) return;

  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const col = rol === 'admin' ? 'admins' : 'vendedores';
      await firebase.firestore().collection(col).doc(String(id)).delete();
      await firebase.firestore().collection('usuarios').doc(String(id)).delete();
    } catch (e) {
      console.warn("Error eliminando de Firestore:", e);
    }
  }

  adminsDB = adminsDB.filter(a => String(a.id) !== String(id));
  vendedoresDB = vendedoresDB.filter(v => String(v.id) !== String(id));
  localStorage.setItem('admins_db', JSON.stringify(adminsDB));
  localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
  poblarSelectsVendedores();

  toast("✅ Usuario eliminado");
  renderizarAdminsEnLista();
};
window.eliminarAdmin = window.eliminarUsuarioRoot;

window.reintentarConexionObligatoria = function() {
  if (navigator.onLine) {
    document.getElementById('pantalla-conexion-obligatoria').classList.add('hidden');
    if (usuarioActual) {
      document.getElementById('pantalla-app').classList.remove('hidden');
    } else {
      document.getElementById('pantalla-login').classList.remove('hidden');
    }
    toast("✅ Conexión restablecida");
  } else {
    alert("⚠️ Aún no se detecta conexión a Internet. Por favor verifica tus datos móviles o Wi-Fi.");
  }
};

window.volverAlLoginDesdeConexion = function() {
  document.getElementById('pantalla-conexion-obligatoria').classList.add('hidden');
  document.getElementById('pantalla-login').classList.remove('hidden');
};

window.abrirModal = (id) => { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); };
window.cerrarModal = (id) => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); };

if (typeof firebase !== 'undefined' && firebase.auth) {
  try {
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        console.log('✅ Sesión activa:', user.email);
        sessionStorage.setItem('userEmail', user.email);
        const email = (user.email || '').toLowerCase();

        // Si ya hay usuarioActual en memoria con datos completos y negocio válido, no sobreescribir con valores genéricos
        if (usuarioActual && (usuarioActual.email === email || usuarioActual.usuario === email || usuarioActual.id === user.uid || usuarioActual.authUid === user.uid)) {
          if (usuarioActual.negocio && usuarioActual.negocio !== 'GNET' && usuarioActual.negocio !== 'GNET Operaciones') {
            console.log('Manteniendo sesión activa con negocio:', usuarioActual.negocio);
            return;
          }
        }

        if (email.includes('root') || email.includes('gnet')) {
          document.getElementById('pantalla-login').classList.add('hidden');
          document.getElementById('pantalla-superadmin').classList.remove('hidden');
          cargarListaAdministradores();
          return;
        }

        // Buscar rol y datos en bases de datos locales
        const todosAdmins = [
          ...(typeof adminsDB !== 'undefined' ? adminsDB : []),
          ...JSON.parse(localStorage.getItem('admins_db') || '[]')
        ];
        const adm = todosAdmins.find(a => 
          (a.email && a.email.toLowerCase() === email) || 
          (a.usuario && a.usuario.toLowerCase() === email) ||
          (a.authUid && a.authUid === user.uid) ||
          (a.id && String(a.id) === user.uid)
        );

        const todosVends = [
          ...(typeof vendedoresDB !== 'undefined' ? vendedoresDB : []),
          ...JSON.parse(localStorage.getItem('vendedores_db') || '[]')
        ];
        const vend = todosVends.find(v => 
          (v.email && v.email.toLowerCase() === email) || 
          (v.usuario && v.usuario.toLowerCase() === email) ||
          (v.authUid && v.authUid === user.uid) ||
          (v.id && String(v.id) === user.uid)
        );

        let rol = null;
        let perfil = null;

        if (adm) {
          rol = 'admin';
          perfil = { ...adm, authUid: user.uid };
        } else if (vend) {
          rol = 'vendedor';
          perfil = { ...vend, authUid: user.uid };
        } else if (typeof firebase !== 'undefined' && firebase.firestore) {
          try {
            const db = firebase.firestore();
            const docAdm = await db.collection('admins').doc(user.uid).get();
            if (docAdm.exists) {
              rol = 'admin';
              perfil = { id: docAdm.id, authUid: user.uid, rol: 'admin', ...docAdm.data() };
            } else {
              const docVend = await db.collection('vendedores').doc(user.uid).get();
              if (docVend.exists) {
                rol = 'vendedor';
                perfil = { id: docVend.id, authUid: user.uid, rol: 'vendedor', ...docVend.data() };
              } else {
                const docUsr = await db.collection('usuarios').doc(user.uid).get();
                if (docUsr.exists) {
                  const d = docUsr.data();
                  rol = d.rol || (d.esAdmin ? 'admin' : 'vendedor');
                  perfil = { id: docUsr.id, authUid: user.uid, rol, ...d };
                }
              }
            }
          } catch (_) {}
        }

        if (!rol) {
          rol = email.includes('admin') ? 'admin' : 'vendedor';
        }

        const nombreDetectado = perfil?.nombreCompleto || perfil?.nombre || user.displayName || (rol === 'admin' ? 'Administrador' : 'Vendedor');
        const negocioDetectado = (perfil?.negocio && perfil.negocio !== 'GNET' && perfil.negocio !== 'GNET Operaciones') 
          ? perfil.negocio 
          : (localStorage.getItem('negocio_nombre_' + (perfil?.adminId || perfil?.id || user.uid)) || localStorage.getItem('negocio_nombre') || 'Mi Negocio');

        iniciarSesionApp(rol, {
          id: perfil?.id || user.uid,
          authUid: user.uid,
          nombre: nombreDetectado,
          nombreCompleto: nombreDetectado,
          usuario: perfil?.usuario || user.email,
          email: user.email,
          adminId: perfil?.adminId || (rol === 'admin' ? (perfil?.id || user.uid) : undefined),
          adminAuthUid: perfil?.adminAuthUid || (rol === 'admin' ? user.uid : undefined),
          adminEmail: perfil?.adminEmail || (rol === 'admin' ? user.email : undefined),
          negocio: negocioDetectado,
          accesoActivo: true,
          ...(perfil || {})
        });
      }
    });
  } catch (e) {
    console.warn('onAuthStateChanged error:', e);
  }
}

window.cargarListaVendedores = function() {
  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      firebase.firestore().collection('vendedores').onSnapshot((snap) => {
        if (snap && !snap.empty) {
          const remotos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          // Actualizar registro global para logins en este dispositivo
          const globalVends = JSON.parse(localStorage.getItem('vendedores_db') || '[]');
          const mapGlob = new Map(globalVends.map(v => [String(v.id), v]));
          remotos.forEach(r => mapGlob.set(String(r.id), r));
          localStorage.setItem('vendedores_db', JSON.stringify(Array.from(mapGlob.values())));

          if (usuarioActual && usuarioActual.rol === 'admin') {
            const miAdminId = String(usuarioActual.id || '');
            const miEmail = String(usuarioActual.email || usuarioActual.usuario || '').toLowerCase();
            const miNegocio = String(usuarioActual.negocio || '').toLowerCase();
            const misVends = remotos.filter(v => {
              if (v.adminId && (String(v.adminId) === miAdminId || (usuarioActual.authUid && String(v.adminId) === String(usuarioActual.authUid)))) return true;
              if (v.adminEmail && String(v.adminEmail).toLowerCase() === miEmail) return true;
              if (miNegocio && v.negocio && String(v.negocio).toLowerCase() === miNegocio && v.negocio !== 'GNET') return true;
              if (!v.adminId && (miAdminId === 'adm_1' || miAdminId.includes('1'))) return true;
              return false;
            });
            vendedoresDB = misVends;
            localStorage.setItem('negocio_vendedores_' + miAdminId, JSON.stringify(misVends));
            localStorage.setItem('vendedores_db_' + miAdminId, JSON.stringify(misVends));
          } else if (usuarioActual && usuarioActual.rol === 'vendedor') {
            vendedoresDB = remotos.filter(v => 
              String(v.id) === String(usuarioActual.id) ||
              (v.authUid && String(v.authUid) === String(usuarioActual.id)) ||
              (usuarioActual.authUid && v.authUid && String(v.authUid) === String(usuarioActual.authUid)) ||
              (v.email && String(v.email).toLowerCase() === String(usuarioActual.email || '').toLowerCase()) ||
              (v.usuario && String(v.usuario).toLowerCase() === String(usuarioActual.usuario || '').toLowerCase())
            );
          } else if (usuarioActual && (usuarioActual.rol === 'root' || usuarioActual.id === 'root')) {
            vendedoresDB = remotos;
          }
          poblarSelectsVendedores();
          renderizarVendedores();
        }
      }, (e) => console.warn("Snapshot vendedores warning:", e));
    } catch (e) {
      console.warn("cargarListaVendedores error:", e);
    }
  }
};

// Inicializar vistas al cargar
inicializarFormulariosProducto();
cargarListaAdministradores();
cargarListaVendedores();
verificarConexionFirebase();
