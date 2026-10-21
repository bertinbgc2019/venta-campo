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
      negocio: neg,
      negocioId: String(adminPersonalizado?.authUid || adminPersonalizado?.id || 'adm_1')
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
      negocio: String(negocio || 'Mi Negocio'),
      negocioId: String((adm && adm.authUid) || usuarioActual.authUid || ((adm && adm.id) || adminId))
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

    // 4. [ELIMINADO] El antiguo fallback "asociar al administrador más reciente"
    //    podía conectar un vendedor al negocio equivocado. Ahora, si un vendedor
    //    no tiene administrador asignado, permanece sin negocio hasta que el
    //    Root o su Administrador lo asocien correctamente.

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
      negocio: String(negocio || usuarioActual.negocio || 'Mi Negocio'),
      negocioId: String(adminAuthUid || adminId || 'adm_1')
    };
  }

  // Root SuperAdmin
  return { adminId: 'root', adminEmail: 'root@ventas.com', negocio: 'GNET Central', negocioId: 'root' };
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

  // Si aún no hay productos y estamos en línea, consultar Firestore inmediatamente para cargar el catálogo (SOLO de este negocio)
  if (productosDB.length === 0 && typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine && negocioIdDe(tenant) && negocioIdDe(tenant) !== 'adm_1') {
    colTenant(firebase.firestore(), tenant, 'productos').get().then(snap => {
      if (snap && !snap.empty) {
        const delNegocio = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (delNegocio.length > 0) {
          productosDB = delNegocio.map(migrarProducto);
          guardarProductosDB();
          renderizarInventario();
          console.log(`✅ Catálogo de ${delNegocio.length} productos cargado desde Firestore para "${tenant.negocio}".`);
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
        if (!v.adminId && clave === 'adm_1') return true;
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

  // Auto-sincronizar nóminas desde Firestore en segundo plano si estamos en línea (SOLO de este negocio)
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine && negocioIdDe(tenant) && negocioIdDe(tenant) !== 'adm_1') {
    const dbNominas = firebase.firestore();
    let consultaNominas;
    if (usuario.rol === 'admin') {
      consultaNominas = colTenant(dbNominas, tenant, 'nominas');
    } else {
      // Vendedor: solo SUS recibos de nómina (filtrado en el servidor)
      const miUid = String(usuario.authUid || usuario.id || '');
      consultaNominas = colTenant(dbNominas, tenant, 'nominas').where('vendedorId', '==', miUid);
    }
    consultaNominas.get().then(snap => {
      if (snap && !snap.empty) {
        const remotos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (remotos.length > 0) {
          const mapNom = new Map(nominasDB.map(n => [String(n.id), n]));
          remotos.forEach(r => mapNom.set(String(r.id), r));
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

  // Si el negocio está suspendido (el Root bloqueó al administrador) se avisa
  // y se deshabilitan las funciones restringidas.
  if (typeof window.aplicarSuspensionNegocio === 'function') window.aplicarSuspensionNegocio();

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
    negocioId: tenant.negocioId || adminAuthUidActual || adminIdActual,
    rol: 'vendedor',
    accesoActivo: true,
    fechaCreacion: new Date().toISOString()
  };

  try {
    // 1. Crear en Firebase Auth con app secundaria para NO desloguear al Administrador activo
    const resAuth = await crearCuentaFirebaseAuth(formatearEmail(usuario), password, nuevo.nombre);
    if (resAuth.ok) {
      nuevo.authUid = resAuth.uid;
      // El UID de Auth es la identidad estable del vendedor: como doc ID permite
      // que las reglas de Firestore verifiquen su membresía en el negocio.
      nuevo.id = resAuth.uid;
    } else {
      // La cuenta ya existía en Auth: la contraseña REAL sigue siendo la de
      // creación. Se avisa para que el administrador no crea haberla cambiado.
      nuevo.credencialPendiente = true;
    }

    // 2. Guardar dentro del espacio aislado de ESTE negocio + espejo de perfil
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      const docSanitizado = sanitizarParaFirestore(nuevo);
      const nid = negocioIdDe(obtenerTenantActual()) || nuevo.negocioId;
      if (nid && nid !== 'adm_1') {
        // Datos del equipo dentro del negocio
        await db.collection('negocios').doc(nid).collection('vendedores').doc(nuevo.id).set(docSanitizado, { merge: true });
      }
      // Espejo de perfil (login directo por UID y directorio de Root)
      await db.collection('vendedores').doc(nuevo.id).set(docSanitizado, { merge: true });
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
  if (nuevo.credencialPendiente) {
    toast(`⚠️ Vendedor ${nuevo.nombre} agregado al equipo, pero su cuenta ya existía en Firebase.`);
    alert('⚠️ ' + mensajeErrorAuth('auth/email-already-in-use')
      + '\n\nUsuario: ' + nuevo.email);
  } else {
    toast(`✅ Vendedor ${nuevo.nombre} registrado para "${negocioActual}" exitosamente.`);
  }
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
      if (v.adminAuthUid && miAdminId && String(v.adminAuthUid) === miAdminId) return true;
      if (v.adminEmail && String(v.adminEmail).toLowerCase() === miEmail) return true;
      if (miNegocio && v.negocio && String(v.negocio).toLowerCase() === miNegocio && v.negocio !== 'GNET') return true;
      if (!v.adminId && miAdminId === 'adm_1') return true;
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
      if (v.adminAuthUid && miAdminId && String(v.adminAuthUid) === miAdminId) return true;
      if (v.adminEmail && String(v.adminEmail).toLowerCase() === miEmail) return true;
      if (miNegocio && v.negocio && String(v.negocio).toLowerCase() === miNegocio && v.negocio !== 'GNET') return true;
      if (!v.adminId && miAdminId === 'adm_1') return true;
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
    gps: normalizarGPS(document.getElementById('cli-gps').value),
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

// ============================================================
// NEGOCIO SUSPENDIDO
// Cuando el Root bloquea al administrador, el negocio queda suspendido:
// el vendedor conserva el catálogo y la lectura de sus clientes, pero
// pierde el historial de ventas y la modificación de clientes.
// El bloqueo real lo aplican las reglas de Firestore en el servidor.
// ============================================================
window.negocioSuspendidoActual = function() {
  return !!(usuarioActual && usuarioActual.rol === 'vendedor' && usuarioActual.negocioSuspendido === true);
};

window.aplicarSuspensionNegocio = function() {
  const banner = document.getElementById('banner-negocio-suspendido');
  const btnVentas = document.getElementById('btn-nav-ventas-semana');
  const suspendido = window.negocioSuspendidoActual();
  if (banner) banner.classList.toggle('hidden', !suspendido);
  if (btnVentas) {
    // 'disabled' sobrevive al reinicio de clases que hace cambiarVista()
    btnVentas.disabled = suspendido;
    btnVentas.classList.toggle('opacity-40', suspendido);
    btnVentas.classList.toggle('pointer-events-none', suspendido);
    btnVentas.setAttribute('title', suspendido
      ? 'Historial de ventas deshabilitado: el negocio está suspendido'
      : 'Historial de ventas');
  }
  if (suspendido) {
    const vista = document.getElementById('vista-ventas-semana');
    if (vista) vista.classList.add('hidden');
  }
  return suspendido;
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

  const suspendido = window.negocioSuspendidoActual();

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
        ${suspendido
          ? '<button disabled class="bg-slate-200 text-slate-400 border border-slate-200 rounded-lg py-2 text-[10px] font-semibold cursor-not-allowed">✏️ Actualizar datos</button>'
          : `<button onclick="abrirModalActualizarCliente(${c.id})" class="bg-blue-600/20 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-lg py-2 text-[10px] font-semibold">✏️ Actualizar datos</button>`}
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
      const db = firebase.firestore();
      const nid = negocioIdDe(obtenerTenantActual());
      if (nid && nid !== 'adm_1') {
        await db.collection('negocios').doc(nid).collection('vendedores').doc(String(v.id)).set({ password: nueva }, { merge: true });
      }
      await db.collection('vendedores').doc(String(v.id)).set({ password: nueva }, { merge: true });
    } catch (e) {
      console.warn("Error actualizando clave en Firestore:", e);
    }
  }

  cerrarModalRestablecerPassword();
  renderizarVendedores();
  toast(`✅ Contraseña de ${v.nombre} restablecida en Firebase`);
  // AVISO IMPORTANTE: desde el navegador no se puede cambiar la contraseña
  // REAL de otro usuario de Firebase Auth. Lo que se guardó arriba es la
  // copia de referencia (modo sin conexión). Para que el vendedor entre
  // con esa clave hay que restablecerla en Authentication.
  alert('📌 La clave de referencia quedó guardada para "' + v.nombre + '".\n\n'
    + 'Por seguridad, Firebase NO permite cambiar desde el navegador la contraseña de otro usuario.\n\n'
    + 'Para que el vendedor entre con esta clave, el Root debe restablecerla en Firebase Authentication '
    + '(node scripts/establecer-clave.mjs ' + (v.email || v.usuario) + ' "' + nueva + '"), '
    + 'o bien el vendedor debe usar "🔑 Cambiar mi contraseña" dentro de la app.');
};

let clienteEditandoId = null;
let clienteAsignandoId = null;

window.abrirModalActualizarCliente = function(id) {
  if (typeof window.negocioSuspendidoActual === 'function' && window.negocioSuspendidoActual()) {
    return alert('⛔ No puedes modificar clientes: el negocio está suspendido por el Superadministrador.');
  }
  const c = clientesDB.find(x => x.id === id); if (!c) return;
  clienteEditandoId = id;
  document.getElementById('edit-cli-nombre').value = c.nombre || '';
  document.getElementById('edit-cli-telefono').value = c.telefono || '';
  document.getElementById('edit-cli-direccion').value = c.direccion || '';
  document.getElementById('edit-cli-gps').value = c.gps || '';
  document.querySelectorAll('input[name="edit-dias"]').forEach(cb => cb.checked = (c.diasVisita || []).includes(cb.value));
  document.getElementById('modal-actualizar-cliente').classList.remove('hidden');
  if (typeof window.pintarMapaGPS === 'function') window.pintarMapaGPS('edit-cli-gps');
};
window.cerrarModalCliente = function() { document.getElementById('modal-actualizar-cliente').classList.add('hidden'); clienteEditandoId=null; };

// Normaliza el valor del campo GPS: sólo se guardan coordenadas válidas
// ("latitud, longitud"). Cualquier otro texto (incluidos los mensajes de
// error de versiones anteriores) se guarda como "Sin GPS".
function normalizarGPS(valor) {
  const crudo = String(valor == null ? '' : valor).trim();
  if (!crudo) return 'Sin GPS';
  const partes = crudo.split(',').map(x => parseFloat(String(x).trim()));
  if (partes.length < 2 || isNaN(partes[0]) || isNaN(partes[1])) return 'Sin GPS';
  if (partes[0] < -90 || partes[0] > 90 || partes[1] < -180 || partes[1] > 180) return 'Sin GPS';
  return partes[0].toFixed(5) + ', ' + partes[1].toFixed(5);
}

window.guardarClienteActualizado = function() {
  const c=clientesDB.find(x=>x.id===clienteEditandoId); if(!c) return;
  const dias=Array.from(document.querySelectorAll('input[name="edit-dias"]:checked')).map(x=>x.value);
  if(!document.getElementById('edit-cli-nombre').value.trim()) return alert('Escribe el nombre del cliente.');
  if(!dias.length) return alert('Selecciona al menos un día de visita.');
  c.nombre=document.getElementById('edit-cli-nombre').value.trim(); c.telefono=document.getElementById('edit-cli-telefono').value.trim(); c.direccion=document.getElementById('edit-cli-direccion').value.trim(); c.gps=normalizarGPS(document.getElementById('edit-cli-gps').value); c.diasVisita=dias;
  guardarClientesDB();
  guardarClienteEnNube(c);
  cerrarModalCliente(); renderizarMisClientes(); renderizarClientesAdmin(); renderizarAgenda(); toast('✅ Datos del cliente actualizados');
};

// Sube el cliente (con su geolocalización) a la nube del negocio
async function guardarClienteEnNube(cliente) {
  if (typeof firebase === 'undefined' || !firebase.firestore || !navigator.onLine) return;
  const tenant = obtenerTenantActual();
  const nid = negocioIdDe(tenant);
  if (!nid) return;
  try {
    const db = firebase.firestore();
    const doc = sanitizarParaFirestore({
      ...cliente,
      adminId: tenant.adminId,
      adminEmail: tenant.adminEmail,
      negocio: tenant.negocio,
      negocioId: nid,
      vendedorId: cliente.vendedorId || (usuarioActual && usuarioActual.id) || null
    });
    await conTimeout(db.collection('negocios').doc(String(nid)).collection('clientes').doc(String(cliente.id)).set(doc, { merge: true }), 4000);
    toast('☁️ Cliente sincronizado con la nube');
  } catch (e) {
    console.warn('No se pudo sincronizar el cliente:', e && e.message);
    toast('💾 Guardado en este dispositivo (sin conexión con la nube)', 'warn');
  }
}

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
    vendedorId: String(vend.authUid || vend.id || vId),
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
    negocio: miNegocio,
    negocioId: tenant.negocioId || miAdminId
  };

  nominasDB = [nuevaNomina, ...nominasDB.filter(n => String(n.id) !== String(nuevaNomina.id))];
  guardarNominasDB();

  // Guardar en Firestore inmediatamente si está disponible y en línea (dentro del negocio)
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      const nid = negocioIdDe(tenant);
      if (nid && nid !== 'adm_1') {
        await colTenant(firebase.firestore(), tenant, 'nominas').doc(nuevaNomina.id).set(sanitizarParaFirestore(nuevaNomina), { merge: true });
      }
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
    (String(n.adminId) === miAdminId) || 
    (tenant.adminAuthUid && String(n.adminId) === String(tenant.adminAuthUid)) ||
    (miNegocio && n.negocio && String(n.negocio).toLowerCase() === miNegocio && n.negocio !== 'GNET')
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

  // Si no hay locales y hay conexión, consultar SOLO las nóminas de este venedor en su negocio
  if (misNominas.length === 0 && typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    const tenantNom = obtenerTenantActual();
    const nidNom = negocioIdDe(tenantNom);
    if (nidNom && nidNom !== 'adm_1') {
      const miUidNom = String(usuarioActual.authUid || usuarioActual.id || '');
      colTenant(firebase.firestore(), tenantNom, 'nominas').where('vendedorId', '==', miUidNom).get().then(snap => {
        if (snap && !snap.empty) {
          const remotas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (remotas.length > 0) {
            const mapNom = new Map(nominasDB.map(n => [String(n.id), n]));
            remotas.forEach(r => mapNom.set(String(r.id), r));
            nominasDB = Array.from(mapNom.values());
            guardarNominasDB();
            renderizarNominasVendedor();
          }
        }
      }).catch(console.warn);
    }
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

  // Guardar en Firestore inmediatamente si está disponible y en línea (dentro de este negocio)
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      const nidProd = negocioIdDe(tenant);
      if (nidProd && nidProd !== 'adm_1') {
        const prodDoc = sanitizarParaFirestore({ ...nuevo, negocioId: nidProd });
        await colTenant(firebase.firestore(), tenant, 'productos').doc(String(nuevo.id)).set(prodDoc, { merge: true });
      }
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
      const nidProdMod = negocioIdDe(tenant);
      if (nidProdMod && nidProdMod !== 'adm_1') {
        // Nota: se usa prodActualizado.id porque cancelarEdicionProducto()
        // limpia productoEnEdicionId antes de este punto.
        await colTenant(firebase.firestore(), tenant, 'productos').doc(String(prodActualizado.id)).set(sanitizarParaFirestore({ ...prodActualizado, negocioId: nidProdMod }), { merge: true });
      }
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
      const tenantDel = obtenerTenantActual();
      if (negocioIdDe(tenantDel) && negocioIdDe(tenantDel) !== 'adm_1') {
        await colTenant(firebase.firestore(), tenantDel, 'productos').doc(String(idAEliminar)).delete();
      }
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
    vendedorNombre: nombreUsuarioActual(),
    negocioNombre: (usuarioActual && usuarioActual.negocio) || localStorage.getItem('negocio_nombre') || 'Ventas de Campo'
  };
  cerrarPantallaOperacion();
  renderizarAgenda();
  ultimaOperacion = op;
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

// ============================================================
// TICKET EN PDF (documento presentable) + envío por WhatsApp
// ============================================================
function construirTicketPDF(op) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210;
  const M = 18;
  const anchoUtil = W - M * 2;
  const AZUL = [30, 64, 175];
  const AZUL_SUAVE = [219, 234, 254];
  const GRIS = [100, 116, 139];
  const NEGRO = [15, 23, 42];
  const VERDE = [5, 150, 105];
  const folio = String(op.id || Date.now());

  // ---------- Encabezado ----------
  doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.rect(0, 0, W, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(String(op.negocioNombre || 'Ventas de Campo'), M, 18, { maxWidth: anchoUtil - 55 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(219, 234, 254);
  doc.text('Ropa táctica y equipo de campo', M, 25.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(op.tipo === 'pedido' ? 'PEDIDO' : 'NOTA DE VENTA', W - M, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(219, 234, 254);
  doc.text('Folio: ' + folio, W - M, 23, { align: 'right' });
  doc.text(new Date(op.fecha).toLocaleString('es-MX'), W - M, 28, { align: 'right' });

  let y = 54;

  // ---------- Datos del cliente / venta ----------
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(M, y - 6, anchoUtil, 30, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
  doc.text('CLIENTE', M + 5, y + 1);
  doc.text('ATENDIÓ', M + 5, y + 12);
  doc.text('TELÉFONO / WHATSAPP', M + 100, y + 1);
  doc.text(op.tipo === 'pedido' ? 'FECHA DE ENTREGA' : 'FECHA', M + 100, y + 12);
  doc.setFontSize(10);
  doc.setTextColor(NEGRO[0], NEGRO[1], NEGRO[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(String(op.clienteNombre || 'Venta mostrador'), M + 5, y + 7, { maxWidth: 90 });
  doc.setFont('helvetica', 'normal');
  doc.text(String(op.vendedorNombre || '—'), M + 5, y + 18, { maxWidth: 90 });
  doc.setFontSize(9);
  doc.text(String(op.telefono || '—'), M + 100, y + 7);
  doc.text(op.tipo === 'pedido' ? fechaLegible(op.fechaEntrega) : new Date(op.fecha).toLocaleDateString('es-MX'), M + 100, y + 18);
  y += 34;

  // ---------- Tabla de productos ----------
  doc.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.rect(M, y - 6, anchoUtil, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PRODUCTO', M + 5, y);
  doc.text('CANT.', W - M - 55, y, { align: 'right' });
  doc.text('PRECIO', W - M - 30, y, { align: 'right' });
  doc.text('IMPORTE', W - M - 5, y, { align: 'right' });
  y += 9;

  const items = Array.isArray(op.items) ? op.items : [];
  items.forEach((i, idx) => {
    const desc = String(i.descripcion || 'Producto');
    const lineas = doc.splitTextToSize(desc, 82);
    const altoFila = Math.max(7, lineas.length * 4.2 + 3);
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y - 5.5, anchoUtil, altoFila, 'F');
    }
    doc.setTextColor(NEGRO[0], NEGRO[1], NEGRO[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(lineas, M + 5, y);
    doc.text(fmtNum(i.cantidad), W - M - 55, y, { align: 'right' });
    doc.text(fmtMoneda(i.precio), W - M - 30, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(fmtMoneda(i.subtotal), W - M - 5, y, { align: 'right' });
    y += altoFila;
  });

  if (!items.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    doc.text('Sin productos en este documento', M + 5, y + 2);
    y += 8;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(M, y - 5, W - M, y - 5);

  // ---------- Totales ----------
  y += 4;
  const xPanel = W - M - 78;
  doc.setFillColor(AZUL_SUAVE[0], AZUL_SUAVE[1], AZUL_SUAVE[2]);
  doc.roundedRect(xPanel, y - 6, 78, 24, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
  doc.text('TOTAL', xPanel + 5, y + 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
  doc.text(fmtMoneda(op.total), xPanel + 73, y + 2, { align: 'right' });

  let yp = y + 10;
  const pagos = [];
  if (op.metodoPago) pagos.push(['Forma de pago', etiquetaMetodoPago(op.metodoPago)]);
  if (op.metodoPago === 'efectivo') {
    pagos.push(['Efectivo recibido', fmtMoneda(op.efectivo)]);
    pagos.push(['Cambio', fmtMoneda(op.cambio)]);
  }
  if (op.saldoPendiente) pagos.push(['Saldo pendiente', fmtMoneda(op.saldoPendiente)]);
  pagos.forEach((par) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    doc.text(par[0], xPanel + 5, yp);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(NEGRO[0], NEGRO[1], NEGRO[2]);
    doc.text(par[1], xPanel + 73, yp, { align: 'right' });
    yp += 5;
  });

  // ---------- Notas ----------
  if (op.anotaciones) {
    y = Math.max(y + 26, yp + 2);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(M, y, anchoUtil, 16, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14);
    doc.text('NOTAS', M + 5, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(NEGRO[0], NEGRO[1], NEGRO[2]);
    doc.text(doc.splitTextToSize(String(op.anotaciones), anchoUtil - 10), M + 5, y + 12);
    y += 22;
  }

  // ---------- Pie ----------
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(M, 268, W - M, 268);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.text('¡Gracias por su preferencia!', W / 2, 277, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
  doc.text('Documento generado el ' + new Date().toLocaleString('es-MX'), W / 2, 282, { align: 'center' });
  doc.text('Folio ' + folio + ' · ' + (op.negocioNombre || 'Ventas de Campo'), W / 2, 286, { align: 'center' });

  return doc;
}

function nombreArchivoTicket(op) {
  const quien = String(op.clienteNombre || 'cliente').replace(/[^\w]+/g, '_').slice(0, 20);
  return 'ticket_' + (op.tipo === 'pedido' ? 'pedido' : 'venta') + '_' + quien + '_' + Date.now() + '.pdf';
}

window.generarTicketPDF = function() {
  if (!ultimaOperacion) return;
  if (!window.jspdf || !window.jspdf.jsPDF) return alert('Generador PDF no disponible.');
  const op = ultimaOperacion;
  construirTicketPDF(op).save(nombreArchivoTicket(op));
  document.getElementById('modal-ticket').classList.add('hidden');
  toast('✅ Ticket PDF generado');
  // También se ofrece el envío por WhatsApp: si el cliente no está
  // registrado se le pregunta el número en el momento de enviar.
  mostrarModalWhatsApp(op);
};

// Envía el ticket como PDF adjunto por WhatsApp.
// En el celular abre la hoja de compartir: eliges WhatsApp y se adjunta el PDF.
// En escritorio (donde no se puede adjuntar) descarga el PDF y abre WhatsApp.
window.enviarTicketPDFPorWhatsApp = async function() {
  if (!ultimaOperacion) return;
  if (!window.jspdf || !window.jspdf.jsPDF) return alert('Generador PDF no disponible.');
  const op = ultimaOperacion;

  // Destino: si el cliente está registrado se usa su número guardado;
  // si no está registrado se le pide el número al usuario.
  const numero = await numeroWhatsAppParaEnvio(op);
  if (!numero) {
    toast('⚠️ Se necesita un número de WhatsApp para enviar el ticket');
    return;
  }

  const doc = construirTicketPDF(op);
  const archivo = nombreArchivoTicket(op);
  const texto = 'Hola ' + (op.clienteNombre || '') + ' 👋\nTe enviamos tu ' + (op.tipo === 'pedido' ? 'pedido' : 'ticket de venta') + ' por ' + fmtMoneda(op.total) + '.\n¡Gracias por tu preferencia!';

  try {
    const blob = doc.output('blob');
    const archivoPdf = new File([blob], archivo, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [archivoPdf] })) {
      await navigator.share({ files: [archivoPdf], title: 'Ticket de venta', text: texto });
      cerrarModalesTicket();
      toast('✅ Ticket PDF enviado');
      ultimaOperacion = null;
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // el usuario canceló el diálogo
    console.warn('No se pudo compartir el PDF:', e && e.message);
  }

  // Respaldo: se descarga el PDF y se abre WhatsApp con el número destino
  doc.save(archivo);
  window.open('https://wa.me/' + numero + '?text=' + encodeURIComponent(texto + '\n\n(Adjunta el archivo PDF que se acaba de descargar.)'), '_blank');
  cerrarModalesTicket();
  toast('📄 Ticket PDF descargado');
};

// Cierra los modales de ticket y de WhatsApp
function cerrarModalesTicket() {
  const mt = document.getElementById('modal-ticket');
  const mw = document.getElementById('modal-whatsapp');
  if (mt) mt.classList.add('hidden');
  if (mw) mw.classList.add('hidden');
}

// Expuesto para pruebas y soporte
window.construirTicketPDF = construirTicketPDF;
window.nombreArchivoTicket = nombreArchivoTicket;
window.normalizarNumeroWhatsApp = normalizarNumeroWhatsApp;
window.numeroWhatsAppParaEnvio = numeroWhatsAppParaEnvio;

function telefonoWhatsApp(tel) {
  let digitos = String(tel || '').replace(/\D/g, '');
  if (digitos.length === 10) digitos = CODIGO_PAIS_WHATSAPP + digitos;
  return digitos;
}

// Normaliza un teléfono a un número válido de WhatsApp (lada 52 + 10 dígitos).
// Devuelve '' si con los datos capturados no se puede armar un número válido.
function normalizarNumeroWhatsApp(tel) {
  let digitos = String(tel || '').replace(/\D/g, '');
  if (digitos.length === 10) {
    digitos = CODIGO_PAIS_WHATSAPP + digitos;
  } else if (digitos.length === 11 && digitos.charAt(0) === '1') {
    digitos = CODIGO_PAIS_WHATSAPP + digitos.slice(1);
  } else if (digitos.length >= 13 && digitos.charAt(0) === '1' && digitos.slice(1, 3) === CODIGO_PAIS_WHATSAPP) {
    digitos = digitos.slice(1);   // +1 52 10 dígitos
  }
  if (digitos.length >= 12 && digitos.startsWith(CODIGO_PAIS_WHATSAPP)) return digitos;
  return '';
}

// ============================================================
// CAPTURA DEL NÚMERO DE WHATSAPP
// Se usa un modal de la app (no un prompt del navegador) para que
// funcione igual en el celular que en la computadora.
// ============================================================
let resolverNumeroWhatsApp = null;

// Muestra el modal para escribir el número de WhatsApp.
// Devuelve una promesa que resuelve con el número ya normalizado
// (52 + 10 dígitos) o '' si el usuario cancela.
window.pedirNumeroWhatsApp = function() {
  const modal = document.getElementById('modal-numero-whatsapp');
  const input = document.getElementById('input-numero-whatsapp');
  const error = document.getElementById('error-numero-whatsapp');
  if (!modal || !input) return Promise.resolve('');

  if (error) { error.innerText = ''; error.classList.add('hidden'); }
  input.value = '';
  modal.classList.remove('hidden');
  try { input.focus(); } catch (_) {}

  return new Promise((resolve) => { resolverNumeroWhatsApp = resolve; });
};

// Botón "Usar este número": valida y cierra el modal.
window.confirmarNumeroWhatsApp = function() {
  const input = document.getElementById('input-numero-whatsapp');
  const error = document.getElementById('error-numero-whatsapp');
  const numero = normalizarNumeroWhatsApp(input ? input.value : '');
  if (!numero) {
    if (error) {
      error.innerText = 'Ese número no es válido. Escribe 10 dígitos con lada (ejemplo: 5512345678).';
      error.classList.remove('hidden');
    }
    return;
  }
  window.cerrarModalNumeroWhatsApp(numero);
};

// Botón "Cancelar" o cualquier cierre del modal.
window.cerrarModalNumeroWhatsApp = function(numero) {
  const modal = document.getElementById('modal-numero-whatsapp');
  if (modal) modal.classList.add('hidden');
  const resolver = resolverNumeroWhatsApp;
  resolverNumeroWhatsApp = null;
  if (resolver) resolver(numero || '');
};

// Determina el número de WhatsApp de destino de una operación:
//   - Si el cliente está registrado se usa su número guardado.
//   - Si el cliente NO está registrado (venta de mostrador) se le pide
//     el número al usuario, porque no hay ninguno en el sistema.
// Devuelve '' si el usuario cancela.
async function numeroWhatsAppParaEnvio(op) {
  const registrado = normalizarNumeroWhatsApp(op && op.telefono);
  if (registrado) return registrado;

  // Cliente sin registro: no hay número guardado, se le pregunta.
  const capturado = await window.pedirNumeroWhatsApp();
  return normalizarNumeroWhatsApp(capturado);
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

window.enviarPorWhatsApp = async function() {
  if (!ultimaOperacion) return;
  // Cliente registrado: se usa su número. Cliente no registrado: se pregunta.
  const numero = await numeroWhatsAppParaEnvio(ultimaOperacion);
  if (!numero) {
    toast('⚠️ Se necesita un número de WhatsApp para enviar el ticket');
    return;
  }
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(armarMensajeWhatsApp(ultimaOperacion))}`;
  window.open(url, '_blank');
  cerrarModalWhatsApp();
};

window.obtenerGPS = function(campoId) {
  const inputGps = document.getElementById(campoId || 'cli-gps');
  if (!inputGps) return;
  const valorPrevio = inputGps.value;
  inputGps.value = "Obteniendo...";
  if (!("geolocation" in navigator)) {
    inputGps.value = valorPrevio;
    return alert('Este dispositivo no tiene GPS disponible. Escribe las coordenadas a mano.');
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      inputGps.value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      if (typeof window.pintarMapaGPS === 'function') window.pintarMapaGPS(campoId);
    },
    (err) => {
      inputGps.value = valorPrevio;
      const mensaje = (err && err.code === 1)
        ? 'Permiso de ubicación denegado. Actívalo en el candado de la barra de direcciones y vuelve a capturar.'
        : 'No se pudo obtener la ubicación. Inténtalo de nuevo en un lugar abierto.';
      alert(mensaje);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
};

// Abre la ubicación capturada en Google Maps
window.verMapaGPS = function(campoId) {
  const inputGps = document.getElementById(campoId || 'cli-gps');
  const coords = String(inputGps ? inputGps.value : '').trim();
  if (!coords || coords === 'Sin GPS' || coords.indexOf('Obteniendo') === 0) {
    return alert('Todavía no hay coordenadas capturadas.');
  }
  const partes = coords.split(',').map(x => parseFloat(String(x).trim()));
  if (partes.length < 2 || isNaN(partes[0]) || isNaN(partes[1])) {
    return alert('Las coordenadas no son válidas. Usa el formato: latitud, longitud');
  }
  window.open(`https://www.google.com/maps/search/?api=1&query=${partes[0]},${partes[1]}`, '_blank', 'noopener');
};

// Borra las coordenadas capturadas
window.limpiarGPS = function(campoId) {
  const inputGps = document.getElementById(campoId || 'cli-gps');
  if (inputGps) inputGps.value = 'Sin GPS';
};

// Pinta un mini-mapa con la posición capturada
window.pintarMapaGPS = function(campoId) {
  const id = campoId || 'cli-gps';
  const inputGps = document.getElementById(id);
  const mapa = document.getElementById(id + '-mapa');
  if (!inputGps || !mapa) return;
  const coords = String(inputGps.value || '').trim();
  if (!coords || coords === 'Sin GPS' || coords.indexOf('Obteniendo') === 0) { mapa.innerHTML = ''; return; }
  const partes = coords.split(',').map(x => parseFloat(String(x).trim()));
  if (partes.length < 2 || isNaN(partes[0]) || isNaN(partes[1])) { mapa.innerHTML = ''; return; }
  const d = 0.004;
  const bbox = `${partes[0] - d},${partes[1] - d},${partes[0] + d},${partes[1] + d}`;
  mapa.innerHTML = `<iframe title="Mapa" class="w-full h-28 rounded-lg border border-slate-200" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${partes[0]},${partes[1]}"></iframe>`;
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
    if (typeof window.negocioSuspendidoActual === 'function' && window.negocioSuspendidoActual()) {
      alert('⛔ El historial de ventas está deshabilitado porque el negocio está suspendido por el Superadministrador.');
      return;
    }
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

  // Reaplicar el estado de suspensión (cambiarVista reinicia las clases)
  if (typeof window.aplicarSuspensionNegocio === 'function') window.aplicarSuspensionNegocio();
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
    // Probar conexión en vivo: leer un documento inexistente. Cualquier
    // respuesta del servidor (aunque sea "permission-denied") confirma
    // que hay red; solo errores de red indican falta de conexión.
    await firebase.firestore().collection('admins').doc('verificacion-conexion').get();
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
    const erroresDeRed = ['unavailable', 'deadline-exceeded', 'cancelled', 'internal', 'resource-exhausted'];
    if (!erroresDeRed.includes(err.code)) {
      // El servidor respondió (p. ej. permission-denied): hay conexión
      if (elLogin) {
        elLogin.className = 'font-semibold text-emerald-600';
        elLogin.innerText = 'Conectado a Firestore';
      }
      if (elSync) {
        elSync.className = 'font-semibold text-emerald-600';
        elSync.innerText = '✅ Conectado a Firestore (ventas-campo-92a4c)';
      }
      return true;
    }
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

// ============================================================
// HELPERS DE AISLAMIENTO MULTI-NEGOCIO
// El identificador estable de cada negocio (tenant) es el UID
// de Firebase Auth del administrador que lo creó.
// Los datos de cada negocio viven en: negocios/{negocioId}/{col}
// ============================================================
function negocioIdDe(tenant) {
  return String((tenant && (tenant.adminAuthUid || tenant.adminId)) || '');
}

// Referencia a una colección DENTRO del espacio aislado del negocio
function colTenant(db, tenant, col) {
  return db.collection('negocios').doc(negocioIdDe(tenant)).collection(col);
}

// Identificadores propios del vendedor que usa este dispositivo
function idsVendedorActual() {
  const ids = new Set();
  if (usuarioActual) {
    if (usuarioActual.id) ids.add(String(usuarioActual.id));
    if (usuarioActual.uid) ids.add(String(usuarioActual.uid));
    if (usuarioActual.authUid) ids.add(String(usuarioActual.authUid));
  }
  return ids;
}

// ¿Este documento pertenece al vendedor que usa este dispositivo?
function esMioDeVendedor(doc) {
  const ids = idsVendedorActual();
  return !!(doc && doc.vendedorId != null && ids.has(String(doc.vendedorId)));
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
    const miNegocioId = negocioIdDe(tenant);

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

    // -------------------------------------------------------
    // ESTADO DEL NEGOCIO: si el Root bloqueó al administrador, el
    // negocio queda suspendido y el vendedor pierde el historial de
    // ventas y la modificación de clientes.
    // -------------------------------------------------------
    if (db && navigator.onLine && miNegocioId && miNegocioId !== 'adm_1' && rolActual === 'vendedor') {
      try {
        const docNeg = await conTimeout(db.collection('negocios').doc(String(miNegocioId)).get(), 4000);
        const suspendido = !!(docNeg.exists && docNeg.data().suspendido === true);
        if (usuarioActual) usuarioActual.negocioSuspendido = suspendido;
        if (typeof window.aplicarSuspensionNegocio === 'function') window.aplicarSuspensionNegocio();
        if (suspendido) {
          log('⛔ Tu negocio está suspendido: sin historial de ventas ni edición de clientes.', 'warn');
        }
      } catch (eNeg) {
        console.warn('Estado del negocio:', eNeg.message);
      }
    }

    if (rolActual === 'admin') {
      // =======================================================
      // ADMINISTRADOR: SINCRONIZACIÓN Y AISLAMIENTO DE NEGOCIO
      // =======================================================

      if (!db || !navigator.onLine) {
        log(`💾 Modo local activo: ${productosDB.length} productos, ${clientesDB.length} clientes y ${ventasDB.length} ventas resguardados en este dispositivo`, 'info');
      } else if (!miNegocioId || miNegocioId === 'adm_1') {
        log('⚠️ Tu usuario no tiene un negocio configurado en la nube. Pide al Root que registre tu negocio para sincronizar.', 'warn');
      } else {
        // -------------------------------------------------------
        // SUBIR datos locales de ESTE negocio a negocios/{negocioId}
        // -------------------------------------------------------
        const subirColeccion = async (coleccion, lista, etiqueta) => {
          let subidos = 0;
          try {
            for (const item of lista) {
              if (!item || !item.id) continue;
              const docSubir = sanitizarParaFirestore({
                ...item,
                adminId: miAdminId,
                adminEmail: miEmail,
                negocio: miNegocio,
                negocioId: miNegocioId
              });
              await conTimeout(colTenant(db, tenant, coleccion).doc(String(item.id)).set(docSubir, { merge: true }), 3500);
              subidos++;
            }
            if (subidos > 0) {
              log(`☁️ ${subidos} ${etiqueta} de "${miNegocio}" sincronizados a Firestore`, 'success');
              subidaCloudOk = true;
            }
          } catch (eSub) {
            console.warn(`Subida ${coleccion} Firestore:`, eSub.message);
            log(`💾 ${lista.length} ${etiqueta} resguardados en Local Storage (${eSub.message.includes('permission') ? 'permiso denegado por reglas' : 'sin conexión'})`, 'info');
          }
        };

        await subirColeccion('productos', productosDB, 'productos');
        await subirColeccion('clientes', clientesDB, 'clientes y visitas');
        await subirColeccion('ventas', ventasDB, 'notas de venta');
        await subirColeccion('nominas', nominasDB, 'recibos de nómina');
        await subirColeccion('vendedores', vendedoresDB, 'vendedores');

        // Los vendedores también llevan espejo de perfil en la raíz
        // (para login directo por UID y directorio de Root)
        try {
          for (const vend of vendedoresDB) {
            if (!vend || !vend.id) continue;
            await conTimeout(db.collection('vendedores').doc(String(vend.id)).set(sanitizarParaFirestore({ ...vend, negocioId: miNegocioId, adminId: miAdminId, negocio: miNegocio }), { merge: true }), 3500);
          }
        } catch (eEspejo) {
          console.warn('Espejo vendedores Firestore:', eEspejo.message);
        }
      }

      // -------------------------------------------------------
      // DESCARGAR datos SOLO de este negocio (la ruta de Firestore
      // ya garantiza el aislamiento: otros negocios nunca se leen)
      // -------------------------------------------------------
      if (db && navigator.onLine && miNegocioId && miNegocioId !== 'adm_1') {
        const descargarColeccion = async (coleccion, obtener, fijar, etiqueta, render) => {
          try {
            const snap = await conTimeout(colTenant(db, tenant, coleccion).get(), 5000);
            if (snap && !snap.empty) {
              const remotos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              if (remotos.length > 0) {
                const mapa = new Map(obtener().map(x => [String(x.id), x]));
                remotos.forEach(r => mapa.set(String(r.id), r));
                fijar(Array.from(mapa.values()));
                if (render) render();
                descargaCloudOk = true;
                log(`📥 ${remotos.length} ${etiqueta} consolidados desde tu negocio`, 'success');
              }
            }
          } catch (eDesc) {
            console.warn(`Descarga ${coleccion} Firestore:`, eDesc.message);
          }
        };

        await descargarColeccion('productos', () => productosDB, v => { productosDB = v; guardarProductosDB(); }, 'productos', renderizarInventario);
        await descargarColeccion('clientes', () => clientesDB, v => { clientesDB = v; guardarClientesDB(); }, 'clientes y visitas', () => { renderizarAgenda(); renderizarMisClientes(); });
        await descargarColeccion('ventas', () => ventasDB, v => { ventasDB = v; guardarVentasDB(); }, 'ventas del equipo', () => { renderizarVentasSemana(); renderizarReporteVentas(); });
        await descargarColeccion('vendedores', () => vendedoresDB, v => { vendedoresDB = v; guardarVendedoresDB(); }, 'vendedores', () => { poblarSelectsVendedores(); renderizarVendedores(); });
        await descargarColeccion('nominas', () => nominasDB, v => { nominasDB = v; guardarNominasDB(); }, 'recibos de nómina', renderizarHistorialNominasAdmin);
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
      // VENDEDOR: COMUNICA CON SU ADMINISTRADOR
      // Sube SUS ventas y SUS clientes; descarga el catálogo del
      // negocio, SUS clientes asignados y SUS nóminas. Todo ocurre
      // dentro de negocios/{negocioId} — jamás toca otros negocios.
      // =======================================================
      const miVendedorId = String(usuarioActual.authUid || usuarioActual.id || usuarioActual.uid || '');

      if (!db || !navigator.onLine) {
        log(`💾 Modo local: tus ventas y clientes están resguardados en este dispositivo`, 'info');
      } else if (!miNegocioId || miNegocioId === 'adm_1') {
        log('⚠️ Tu usuario no tiene un negocio asignado. Pide a tu Administrador o al Root que te asocien a un negocio para poder sincronizar.', 'warn');
      } else {
        // 1. Subir SUS ventas realizadas hacia la cuenta de su Administrador
        const misVentasLocales = ventasDB.filter(v => esMioDeVendedor(v));
        let vSubidas = 0;
        try {
          for (const v of misVentasLocales) {
            if (!v.id) continue;
            const ventaDoc = sanitizarParaFirestore({
              ...v,
              adminId: miAdminId,
              vendedorId: miVendedorId,
              negocio: miNegocio,
              negocioId: miNegocioId
            });
            await conTimeout(colTenant(db, tenant, 'ventas').doc(String(v.id)).set(ventaDoc, { merge: true }), 3500);
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

        // 2. Subir SUS clientes registrados (incluyen sus visitas/agenda)
        const misClientesLocales = clientesDB.filter(c => esMioDeVendedor(c));
        let cSubidos = 0;
        try {
          for (const c of misClientesLocales) {
            if (!c.id) continue;
            const cliDoc = sanitizarParaFirestore({
              ...c,
              adminId: miAdminId,
              vendedorId: miVendedorId,
              negocio: miNegocio,
              negocioId: miNegocioId
            });
            await conTimeout(colTenant(db, tenant, 'clientes').doc(String(c.id)).set(cliDoc, { merge: true }), 3500);
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

        // 3. Descargar el catálogo OFICIAL de productos de su Administrador
        try {
          const snapProds = await conTimeout(colTenant(db, tenant, 'productos').get(), 5000);
          if (snapProds && !snapProds.empty) {
            const prodsAdmin = snapProds.docs.map(d => ({ id: d.id, ...d.data() }));
            if (prodsAdmin.length > 0) {
              productosDB = prodsAdmin.map(migrarProducto);
              guardarProductosDB();
              renderizarInventario();
              descargaCloudOk = true;
              log(`📥 ${prodsAdmin.length} productos de "${miNegocio}" descargados a tu catálogo local`, 'success');
            }
          }
        } catch (errProdsVend) {
          console.warn("Descarga productos vendedor Firestore:", errProdsVend.message);
        }

        // 4. Descargar SUS clientes asignados (el filtro lo aplica Firestore,
        //    no se descarga ningún cliente de otro vendedor)
        try {
          const snapCli = await conTimeout(colTenant(db, tenant, 'clientes').where('vendedorId', '==', miVendedorId).get(), 5000);
          if (snapCli && !snapCli.empty) {
            const cliAdmin = snapCli.docs.map(d => ({ id: d.id, ...d.data() }));
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

        // 5. Descargar SUS recibos de nómina emitidos por el Administrador
        try {
          const snapNom = await conTimeout(colTenant(db, tenant, 'nominas').where('vendedorId', '==', miVendedorId).get(), 5000);
          if (snapNom && !snapNom.empty) {
            const nomVend = snapNom.docs.map(d => ({ id: d.id, ...d.data() }));
            if (nomVend.length > 0) {
              const mapNom = new Map(nominasDB.map(n => [String(n.id), n]));
              nomVend.forEach(r => mapNom.set(String(r.id), r));
              nominasDB = Array.from(mapNom.values());
              guardarNominasDB();
              renderizarNominasVendedor();
              descargaCloudOk = true;
              log(`📥 ${nomVend.length} recibos de nómina sincronizados desde tu Administrador`, 'success');
            } else {
              log(`ℹ️ Nóminas: sin recibos emitidos recientemente para ${usuarioActual.nombre || ''}`, 'info');
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

      log(`🔒 Sincronización completa con "${miNegocio}": catálogo recibido y tus datos compartidos con tu Administrador.`, 'info');

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

  // Correos a probar. El usuario puede escribir el nombre suelto ("carlos")
  // o el correo completo. Algunas cuentas antigas quedaron en @ventas.com,
  // así que se prueban los dos dominios antes de decir "contraseña incorrecta".
  const candidatos = [];
  const agregarCandidato = (c) => { if (c && !candidatos.includes(c)) candidatos.push(c); };
  agregarCandidato(email);
  if (email.endsWith('@ventas.campo')) agregarCandidato(email.replace(/@ventas\.campo$/, '@ventas.com'));
  else if (email.endsWith('@ventas.com')) agregarCandidato(email.replace(/@ventas\.com$/, '@ventas.campo'));

  let authSuccess = false;
  let authUser = null;
  let ultimoErrorAuth = null;

  // 2. Autenticación con Firebase Auth (identidad real del usuario)
  if (typeof firebase !== 'undefined' && firebase.auth && navigator.onLine) {
    for (const correo of candidatos) {
      try {
        const authPromise = firebase.auth().signInWithEmailAndPassword(correo, pass);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 8000));
        const res = await Promise.race([authPromise, timeoutPromise]);
        authUser = res.user;
        authSuccess = true;
        ultimoErrorAuth = null;
        break;
      } catch (err) {
        console.warn("Firebase Auth falló:", correo, err.code, err.message);
        ultimoErrorAuth = err;
        // Si la cuenta existe pero la contraseña está mal, no tiene sentido
        // probar el otro dominio: se corta aquí.
        if (err.code !== 'auth/invalid-credential' && err.code !== 'auth/user-not-found' && err.code !== 'auth/email-not-found') {
          break;
        }
      }
    }
  }

  // 3. Cargar el PERFIL del usuario autenticado.
  //    Ya NO se escanean colecciones completas (eso rompía el aislamiento
  //    entre negocios). Cada perfil se lee por su propio UID.
  if (authSuccess && authUser && typeof firebase !== 'undefined' && firebase.firestore) {
    const db = firebase.firestore();
    const uid = authUser.uid;
    let perfil = null;

    // 3.A Administrador: doc id = su propio UID
    try {
      const docAdm = await conTimeout(db.collection('admins').doc(uid).get(), 5000);
      if (docAdm.exists) {
        const data = docAdm.data();
        if (data.accesoActivo === false) throw new Error("Acceso de administrador suspendido");
        perfil = { id: uid, authUid: uid, rol: 'admin', ...data };
      }
    } catch (eAdm) {
      if (String(eAdm.message || '').includes('suspendido')) throw eAdm;
      console.warn("Perfil admin:", eAdm.message);
    }

    // 3.B Vendedor: doc id = su propio UID
    if (!perfil) {
      try {
        const docVend = await conTimeout(db.collection('vendedores').doc(uid).get(), 5000);
        if (docVend.exists) {
          const data = docVend.data();
          if (data.accesoActivo === false) throw new Error("Acceso de vendedor suspendido");
          perfil = { id: uid, authUid: uid, rol: 'vendedor', ...data };
        }
      } catch (eVend) {
        if (String(eVend.message || '').includes('suspendido')) throw eVend;
        console.warn("Perfil vendedor:", eVend.message);
      }
    }

    // 3.B.bis Estado del negocio. Si el Root bloqueó al administrador, el
    //         negocio queda suspendido: el vendedor conserva el catálogo y
    //         la lectura de sus clientes, pero pierde el historial de ventas
    //         y la modificación de clientes (las reglas lo bloquean en el
    //         servidor, esto solo es la señal para la interfaz).
    if (perfil && perfil.rol === 'vendedor' && perfil.negocioId) {
      try {
        const docNeg = await conTimeout(db.collection('negocios').doc(String(perfil.negocioId)).get(), 4000);
        if (docNeg.exists && docNeg.data().suspendido === true) {
          perfil.negocioSuspendido = true;
        }
      } catch (eNeg) {
        console.warn("Estado del negocio:", eNeg.message);
      }
    }

    if (perfil) {
      if (perfil.rol === 'admin') {
        adminsDB = [perfil, ...adminsDB.filter(a => String(a.id) !== String(perfil.id))];
        localStorage.setItem('admins_db', JSON.stringify(adminsDB));
      } else {
        vendedoresDB = [perfil, ...vendedoresDB.filter(v => String(v.id) !== String(perfil.id))];
        localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
        poblarSelectsVendedores();
      }
      return {
        user: { uid, email: authUser.email || email, displayName: perfil.nombreCompleto || perfil.nombre || 'Usuario' },
        ...perfil
      };
    }

    // 3.C Perfil no encontrado: se rechaza en vez de adivinar el rol
    //     (adivinar permitía que un usuario entrara con permisos equivocados).
    throw new Error("Tu cuenta no está registrada como administrador ni vendedor. Contacta al Superadministrador.");
  }

  // 4. Sin conexión: validar contra los perfiles guardados en este dispositivo
  const todosAdmins = [
    ...(typeof adminsDB !== 'undefined' ? adminsDB : []),
    ...JSON.parse(localStorage.getItem('admins_db') || '[]')
  ];
  const adm = todosAdmins.find(a =>
    (a.usuario && a.usuario.toLowerCase() === raw) ||
    (a.email && a.email.toLowerCase() === raw) ||
    (a.usuario && a.usuario.toLowerCase() === email) ||
    (a.email && a.email.toLowerCase() === email)
  );
  if (adm && (adm.password === pass || !adm.password)) {
    if (adm.accesoActivo === false) throw new Error("Acceso del administrador no autorizado");
    return {
      user: { uid: adm.authUid || adm.id, email: adm.email || email, displayName: adm.nombreCompleto || 'Administrador' },
      rol: 'admin',
      ...adm
    };
  }

  const vend = vendedoresDB.find(v =>
    (v.usuario && v.usuario.toLowerCase() === raw) ||
    (v.email && v.email.toLowerCase() === raw) ||
    (v.usuario && v.usuario.toLowerCase() === email) ||
    (v.email && v.email.toLowerCase() === email)
  );
  if (vend && (vend.password === pass || !vend.password)) {
    if (vend.accesoActivo === false) {
      throw new Error("Acceso del vendedor no autorizado o suspendido");
    }
    return {
      user: { uid: vend.authUid || vend.id, email: vend.email || email, displayName: vend.nombre },
      rol: 'vendedor',
      ...vend
    };
  }

  // 5. Si Firebase Auth validó pero no pudimos leer el perfil (p. ej. sin red),
  //    usar los datos mínimos de la sesión. Las reglas de Firestore restringen
  //    el acceso real a los datos, así que no se puede escalar privilegios.
  if (authSuccess && authUser) {
    return {
      user: authUser,
      rol: 'vendedor',
      authUid: authUser.uid,
      id: authUser.uid,
      email: authUser.email,
      nombre: authUser.displayName || raw
    };
  }

  const codigoErrorAuth = ultimoErrorAuth && ultimoErrorAuth.code;
  if (codigoErrorAuth === 'auth/user-not-found' || codigoErrorAuth === 'auth/email-not-found') {
    throw new Error(`No existe ninguna cuenta con el usuario "${raw}". Se buscó: ${candidatos.join('  |  ')}`);
  }
  if (codigoErrorAuth === 'auth/user-disabled') {
    throw new Error("Tu cuenta está deshabilitada. Contacta al Superadministrador.");
  }
  if (codigoErrorAuth === 'auth/too-many-requests') {
    throw new Error("Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.");
  }
  throw new Error("Usuario o contraseña incorrectos");
};

// ==========================================
// CAMBIAR MI PROPIA CONTRASEÑA
// Esta es la única forma segura de cambiar la contraseña real:
// el usuario cambia la SUYA con su sesión iniciada en Firebase Auth.
// ==========================================
window.abrirModalCambiarMiClave = function() {
  const act = document.getElementById('mi-clave-actual');
  const nue = document.getElementById('mi-clave-nueva');
  const con = document.getElementById('mi-clave-confirmar');
  if (act) act.value = '';
  if (nue) nue.value = '';
  if (con) con.value = '';
  const m = document.getElementById('modal-cambiar-mi-clave');
  if (m) m.classList.remove('hidden');
  if (act) setTimeout(() => act.focus(), 50);
};

window.cerrarModalCambiarMiClave = function() {
  const m = document.getElementById('modal-cambiar-mi-clave');
  if (m) m.classList.add('hidden');
};

window.guardarCambiarMiClave = async function() {
  const actual = document.getElementById('mi-clave-actual').value;
  const nueva = document.getElementById('mi-clave-nueva').value;
  const confirmar = document.getElementById('mi-clave-confirmar').value;
  if (!actual) return alert('Escribe tu contraseña actual.');
  if (!nueva || nueva.length < 6) return alert('La nueva contraseña debe tener al menos 6 caracteres.');
  if (nueva !== confirmar) return alert('Las contraseñas no coinciden.');
  if (nueva === actual) return alert('La nueva contraseña debe ser distinta de la actual.');

  try {
    if (typeof firebase === 'undefined' || !firebase.auth) throw new Error('SDK de Firebase no disponible');
    const user = firebase.auth().currentUser;
    if (!user || !user.email) throw new Error('No hay una sesión de Firebase Authentication activa.');

    // Reautenticar para tener permisos de cambio de contraseña
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, actual);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(nueva);

    // Copia de referencia (modo sin conexión). No es lo que permite entrar:
    // lo que permite entrar es la contraseña real que acabamos de cambiar.
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try {
        const db = firebase.firestore();
        const uid = user.uid;
        const tenant = obtenerTenantActual();
        const nid = negocioIdDe(tenant);
        const esAdmin = (usuarioActual && usuarioActual.rol === 'admin');
        if (esAdmin) {
          await db.collection('admins').doc(uid).set({ password: nueva }, { merge: true });
        } else {
          await db.collection('vendedores').doc(uid).set({ password: nueva }, { merge: true });
          if (nid && nid !== 'adm_1') {
            await db.collection('negocios').doc(nid).collection('vendedores').doc(uid).set({ password: nueva }, { merge: true });
          }
        }
      } catch (e) {
        console.warn('Copia de referencia de contraseña no actualizada:', e.message);
      }
    }
    if (usuarioActual) {
      usuarioActual.password = nueva;
      localStorage.setItem(usuarioActual.rol === 'admin' ? 'admins_db' : 'vendedores_db',
        JSON.stringify(usuarioActual.rol === 'admin' ? adminsDB : vendedoresDB));
    }

    cerrarModalCambiarMiClave();
    toast('🔑 Contraseña actualizada en Firebase Authentication');
  } catch (err) {
    console.warn('Cambio de contraseña:', err.code, err.message);
    let msg = err.message || 'Error desconocido';
    if (err.code === 'auth/wrong-password') msg = 'La contraseña actual no es correcta.';
    if (err.code === 'auth/weak-password') msg = 'La nueva contraseña es demasiado débil.';
    if (err.code === 'auth/user-token-expired' || err.code === 'auth/requires-recent-login') {
      msg = 'Por seguridad vuelve a iniciar sesión y prueba de nuevo.';
    }
    alert('❌ No se pudo cambiar la contraseña: ' + msg);
  }
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
    const msg = String(err.message || '');
    if (/suspendid[oa]|no autorizad|no está registrad/i.test(msg)) {
      // Cuenta suspendida: se cierra la sesión de Firebase para que no
      // pueda seguir usando la app con la sesión viva.
      try { if (typeof firebase !== 'undefined' && firebase.auth) await firebase.auth().signOut(); } catch (_) {}
      usuarioActual = null;
      mostrarPantallaAccesoNoAutorizado();
      return;
    }
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
    const msg = String(err.message || '');
    if (/suspendid[oa]|no autorizad|no está registrad/i.test(msg)) {
      // Cuenta suspendida: se cierra la sesión de Firebase para que no
      // pueda seguir usando la app con la sesión viva.
      try { if (typeof firebase !== 'undefined' && firebase.auth) await firebase.auth().signOut(); } catch (_) {}
      usuarioActual = null;
      mostrarPantallaAccesoNoAutorizado();
      return;
    }
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

  // El Superadministrador también es un usuario REAL de Firebase Auth.
  // Así, cuando entra al panel Root, sus consultas van autenticadas y las
  // reglas de Firestore lo reconocen (antes era un acceso "falso" sin sesión).
  const emailRoot = userVal.includes('@') ? userVal.toLowerCase() : 'root@ventas.com';

  try {
    if (btn) { btn.textContent = "Conectando..."; btn.disabled = true; }
    if (typeof firebase !== 'undefined' && firebase.auth) {
      await firebase.auth().signInWithEmailAndPassword(emailRoot, passVal);
    }
    // Guardar el usuario Root en memoria para que el resto del panel funcione
    usuarioActual = {
      id: 'root',
      authUid: (firebase.auth().currentUser && firebase.auth().currentUser.uid) || 'root',
      email: emailRoot,
      usuario: emailRoot,
      rol: 'root',
      nombre: 'Root SuperAdmin',
      nombreCompleto: 'Root SuperAdmin',
      negocio: 'GNET Central'
    };
    cerrarModalRootLogin();
    document.getElementById('pantalla-login').classList.add('hidden');
    document.getElementById('pantalla-superadmin').classList.remove('hidden');
    cargarListaAdministradores();
    toast("🛡️ Sesión Root activada");
  } catch (err) {
    console.warn('Login Root:', err.code, err.message);
    alert("❌ Credenciales Root incorrectas");
  } finally {
    if (btn) { btn.textContent = "Ingresar al Panel Root"; btn.disabled = false; }
  }
};

// ==========================================
// GESTIÓN DE USUARIOS Y ROLES DESDE ROOT (FIREBASE)
// ==========================================

async function crearCuentaFirebaseAuth(email, password, displayName) {
  if (typeof firebase === 'undefined' || !firebase.auth) return { ok: false, code: 'sin-sdk' };
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
    return { ok: true, uid };
  } catch (err) {
    console.warn("Firebase Auth secundario creación:", err.code, err.message);
    if (secondaryApp) {
      try { await secondaryApp.delete(); } catch (_) {}
    }
    return { ok: false, code: err.code || 'error', message: err.message };
  }
}

// Mensaje claro para el administrador cuando la cuenta ya existe en Auth.
function mensajeErrorAuth(code) {
  if (code === 'auth/email-already-in-use') {
    return 'Ese correo YA existe en Firebase Authentication, por lo que su contraseña NO se cambió. '
      + 'Pide al vendedor que use "Cambiar mi contraseña" al entrar, o al Root que restablezca la clave real.';
  }
  if (code === 'auth/invalid-email') return 'El correo no es válido.';
  if (code === 'auth/weak-password') return 'La contraseña es demasiado débil (mínimo 6 caracteres).';
  if (code === 'auth/operation-not-allowed') return 'El proveedor de correo/contraseña no está habilitado en el proyecto.';
  if (code === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  return 'No se pudo crear la cuenta en Firebase Authentication.';
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
    const negocioId = a.authUid || a.negocioId || a.id;
    sel.innerHTML += `<option value="${a.id}" data-negocio="${esc(a.negocio || '')}" data-email="${esc(a.email || a.usuario || '')}" data-authuid="${esc(a.authUid || '')}" data-negocioid="${esc(negocioId || '')}">${esc(a.nombreCompleto || a.nombre)} (${esc(a.negocio || 'Sin Negocio')})</option>`;
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
  let adminAuthUidAsignado = null;
  let negocioIdAsignado = null;
  if (rol === 'vendedor') {
    const selAdmin = document.getElementById('adm-vendedor-asignado');
    if (selAdmin && selAdmin.value) {
      adminIdAsignado = selAdmin.value;
      const opt = selAdmin.options[selAdmin.selectedIndex];
      adminEmailAsignado = opt ? opt.dataset.email : null;
      adminAuthUidAsignado = opt ? (opt.dataset.authuid || null) : null;
      negocioIdAsignado = opt ? (opt.dataset.negocioid || null) : null;
    }
    if (!adminIdAsignado && adminsDB.length > 0) {
      adminIdAsignado = adminsDB[0].id;
      adminEmailAsignado = adminsDB[0].email || adminsDB[0].usuario;
      adminAuthUidAsignado = adminsDB[0].authUid || null;
      negocioIdAsignado = adminsDB[0].authUid || adminsDB[0].id;
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
    adminAuthUid: rol === 'vendedor' ? adminAuthUidAsignado : null,
    negocioId: rol === 'vendedor' ? (negocioIdAsignado || adminAuthUidAsignado || adminIdAsignado) : null,
    diaPagoMensual: rol === 'admin' ? (Number(diaPago) || 1) : null,
    fechaUltimoPago: rol === 'admin' ? (ultimoPago || new Date().toISOString().slice(0, 10)) : null,
    accesoActivo: true,
    fechaCreacion: new Date().toISOString(),
    creadoPor: 'root'
  };

  // 1. Crear usuario en Firebase Auth sin alterar la sesión activa de Root
  let errorAuthCreacion = null;
  try {
    const resAuth = await crearCuentaFirebaseAuth(emailFormateado, password, nombre);
    if (resAuth.ok) {
      docUsuario.authUid = resAuth.uid;
      // El UID de Auth identifica de forma estable al negocio (si es admin)
      // y al propio usuario (si es vendedor). Es la pieza clave del aislamiento.
      docUsuario.id = resAuth.uid;
      if (rol === 'admin') {
        docUsuario.negocioId = resAuth.uid;
      }
    } else {
      errorAuthCreacion = resAuth.code;
      docUsuario.credencialPendiente = true;
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
        await db.collection('admins').doc(docUsuario.id).set(docUsuario, { merge: true });
      } else {
        await db.collection('vendedores').doc(docUsuario.id).set(docUsuario, { merge: true });
        // Miembro del equipo dentro del negocio al que fue asignado
        const nidVend = docUsuario.negocioId || docUsuario.adminAuthUid;
        if (nidVend) {
          await db.collection('negocios').doc(String(nidVend)).collection('vendedores').doc(docUsuario.id).set(docUsuario, { merge: true });
        }
      }
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

  if (errorAuthCreacion) {
    alert(`⚠️ El usuario se registró en el sistema, pero NO en Firebase Authentication.\n\n• Nombre: ${nombre}\n• Rol Asignado: ${rolTexto}\n• Usuario: ${usuario}\n• Correo: ${emailFormateado}\n• Estado: ${statusFirebase}\n\n${mensajeErrorAuth(errorAuthCreacion)}\n\nHasta que la cuenta exista en Authentication, este usuario NO podrá iniciar sesión.`);
  } else {
    alert(`✅ Usuario creado con éxito en Firebase:\n\n• Nombre: ${nombre}\n• Rol Asignado: ${rolTexto}\n• Usuario: ${usuario}\n• Correo: ${emailFormateado}\n• Estado: ${statusFirebase}\n\nEl usuario únicamente podrá acceder a las pantallas correspondientes a su rol.`);
  }

  document.getElementById('form-crear-admin').reset();
  alternarCamposRolRoot();
  cargarListaAdministradores();
};
window.guardarUsuarioDesdeRoot = window.guardarNuevoAdmin;

window.cargarListaAdministradores = function() {
  const listaDiv = document.getElementById('lista-admins');
  if (!listaDiv) return;

  // Consulta puntual (no onSnapshot): con las reglas de aislamiento,
  // las escuchas en tiempo real de colecciones completas solo están
  // permitidas para Root y consumen ancho de banda innecesario.
  if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
    try {
      const db = firebase.firestore();
      db.collection('admins').get().then(snap => {
        if (snap && !snap.empty) {
          adminsDB = snap.docs.map(d => ({ id: d.id, rol: 'admin', ...d.data() }));
          localStorage.setItem('admins_db', JSON.stringify(adminsDB));
        }
        return db.collection('vendedores').get();
      }).then(snapVend => {
        if (snapVend && !snapVend.empty) {
          vendedoresDB = snapVend.docs.map(d => ({ id: d.id, rol: 'vendedor', ...d.data() }));
          localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
        }
        poblarSelectsVendedores();
        renderizarAdminsEnLista();
      }).catch(e => {
        console.warn("Firestore listas error:", e.message);
        renderizarAdminsEnLista();
      });
      return;
    } catch (e) {
      console.warn("Firestore listas error:", e);
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
      usuario.negocioId = usuario.negocioId || usuario.authUid || usuario.id;
    } else {
      vendedoresDB = vendedoresDB.filter(v => String(v.id) !== String(usuario.id));
      adminsDB = [usuario, ...adminsDB];
      // Al convertirse en administrador, su negocio pasa a ser su propio UID
      usuario.negocioId = usuario.authUid || usuario.id;
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
      const dbFs = firebase.firestore();
      const colecNueva = rolNuevo === 'admin' ? 'admins' : 'vendedores';
      await dbFs.collection(colecNueva).doc(String(usuario.id)).set(usuario, { merge: true });
      // Si es vendedor, mantener su registro dentro del negocio asignado
      if (rolNuevo === 'vendedor') {
        const nidEdit = usuario.negocioId || usuario.adminAuthUid;
        if (nidEdit) {
          await dbFs.collection('negocios').doc(String(nidEdit)).collection('vendedores').doc(String(usuario.id)).set(usuario, { merge: true });
        }
      }
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

  const rolUsuario = usuario.rol || rol || 'admin';
  const esAdmin = rolUsuario === 'admin';
  const estadoAnterior = usuario.accesoActivo !== false;
  const vaABloquear = estadoAnterior;
  const nombreUsuario = usuario.nombreCompleto || usuario.nombre || usuario.usuario || id;

  // Aviso claro de lo que va a pasar antes de aplicar el cambio
  if (vaABloquear) {
    const mensaje = esAdmin
      ? `Se suspenderá TODO el negocio de "${nombreUsuario}":\n\n` +
        `• El administrador no podrá entrar a su cuenta ni ver sus datos.\n` +
        `• Sus vendedores dejarán de revisar el historial de ventas.\n` +
        `• Sus vendedores no podrán modificar clientes ni registrar ventas.\n\n` +
        `¿Deseas continuar?`
      : `Se suspenderá el acceso de "${nombreUsuario}".\n\n¿Deseas continuar?`;
    if (!confirm(mensaje)) return;
  }

  const nuevoEstado = !estadoAnterior;

  localStorage.setItem('admins_db', JSON.stringify(adminsDB));
  localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));

  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const dbFs = firebase.firestore();
      const col = esAdmin ? 'admins' : 'vendedores';
      const nid = usuario.negocioId || usuario.adminAuthUid || (esAdmin ? (usuario.authUid || usuario.id) : null);
      const batch = dbFs.batch();

      // Estado de acceso del usuario
      batch.set(dbFs.collection(col).doc(String(usuario.id)), { accesoActivo: nuevoEstado }, { merge: true });

      if (esAdmin && nid) {
        // El negocio queda SUSPENDIDO: los vendedores pierden el historial
        // de ventas y no pueden modificar clientes (lo aplican las reglas).
        batch.set(dbFs.collection('negocios').doc(String(nid)), { suspendido: !nuevoEstado }, { merge: true });
      } else if (!esAdmin && nid) {
        // Ficha del vendedor dentro de su negocio
        batch.set(dbFs.collection('negocios').doc(String(nid)).collection('vendedores').doc(String(usuario.id)), { accesoActivo: nuevoEstado }, { merge: true });
      }

      await batch.commit();

      // Se relee del servidor: si el cambio no está guardado de verdad,
      // no se puede mostrar "Bloqueado" en la pantalla del Root.
      const verif = await dbFs.collection(col).doc(String(usuario.id)).get();
      const confirmado = verif.exists && ((verif.data().accesoActivo !== false) === nuevoEstado);
      if (!confirmado) throw new Error('El servidor no confirmó el cambio.');
    } catch (e) {
      console.warn("Firestore toggle acceso error:", e);
      // Se revierte el estado local: no se muestra un bloqueo que no ocurrió
      usuario.accesoActivo = estadoAnterior;
      localStorage.setItem('admins_db', JSON.stringify(adminsDB));
      localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
      renderizarAdminsEnLista();
      alert(
        '⚠️ No se pudo aplicar el cambio de acceso a "' + nombreUsuario + '".\n\n' +
        'Revisa tu conexión a internet e inténtalo de nuevo.\n\n' +
        'Detalle: ' + (e && e.message ? e.message : 'error desconocido')
      );
      return;
    }
  }

  // El cambio ya quedó confirmado en el servidor: se actualiza la copia
  // local para que la lista del Root muestre el estado real.
  usuario.accesoActivo = nuevoEstado;
  localStorage.setItem('admins_db', JSON.stringify(adminsDB));
  localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));

  toast(nuevoEstado
    ? "🔓 Acceso activado"
    : (esAdmin
        ? "🔒 Negocio suspendido (vendedores sin historial de ventas ni edición de clientes)"
        : "🔒 Acceso suspendido"));
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
        if ((usuario.rol || userResetPasswordRol) === 'vendedor') {
          const nidPwd = usuario.negocioId || usuario.adminAuthUid;
          if (nidPwd) {
            await firebase.firestore().collection('negocios').doc(String(nidPwd)).collection('vendedores').doc(String(usuario.id)).set({ password: p1 }, { merge: true });
          }
        }
      } catch (e) {
        console.warn("Error actualizando clave en Firestore:", e);
      }
    }
  }

  cerrarModalRootResetAdmin();
  toast("🔑 Contraseña actualizada exitosamente en Firebase");
  renderizarAdminsEnLista();
  alert('📌 La clave de referencia quedó guardada para "' + (usuario.nombreCompleto || usuario.nombre || usuario.usuario) + '".\n\n'
    + 'La contraseña REAL de Firebase Authentication NO se puede cambiar desde el navegador '
    + '(Firebase sólo permite cambiar la del usuario que tiene la sesión iniciada).\n\n'
    + 'Para restablecerla de verdad, ejecuta:\n'
    + 'node scripts/establecer-clave.mjs ' + (usuario.email || usuario.usuario) + ' "' + p1 + '"\n\n'
    + 'El UID, el correo y todos sus datos se conservan.');
};

window.eliminarUsuarioRoot = async function(id, nombre, rol) {
  if (!confirm(`¿Eliminar al usuario "${nombre}" de Firebase y del sistema?`)) return;

  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const dbFs = firebase.firestore();
      const col = rol === 'admin' ? 'admins' : 'vendedores';
      const usuario = adminsDB.find(a => String(a.id) === String(id)) ||
                      vendedoresDB.find(v => String(v.id) === String(id));
      await dbFs.collection(col).doc(String(id)).delete();
      if (rol !== 'admin') {
        const nidDel = usuario && (usuario.negocioId || usuario.adminAuthUid);
        if (nidDel) {
          await dbFs.collection('negocios').doc(String(nidDel)).collection('vendedores').doc(String(id)).delete();
        }
      }
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

// ============================================================
// ESTADO DE ACCESO (fuente de verdad: la nube)
// Lee el perfil del usuario y dice si puede entrar.
//   bloqueado  -> el Root le suspendió la cuenta (accesoActivo === false)
//   suspendido -> su negocio está suspendido (sólo afecta a los vendedores:
//                 pierden el historial de ventas y la edición de clientes)
// Devuelve null si no se pudo comprobar (sin conexión).
// ============================================================
window.leerEstadoAcceso = async function(uid) {
  if (!uid || !navigator.onLine || typeof firebase === 'undefined' || !firebase.firestore) return null;
  const db = firebase.firestore();

  // En equipos lentos (o con la app en segundo plano) la primera lectura
  // puede tardar: se espera más y se reintenta una vez antes de rendirse.
  const leerDoc = async (coleccion) => {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        return await conTimeout(db.collection(coleccion).doc(String(uid)).get(), 9000);
      } catch (e) {
        if (e && e.message === 'TIMEOUT_CONEXION' && intento < 2) {
          console.warn('Lectura lenta de ' + coleccion + '/' + uid + ': se reintenta...');
          continue;
        }
        throw e;
      }
    }
    return null;
  };

  try {
    const docAdm = await leerDoc('admins');
    if (docAdm && docAdm.exists) {
      const data = docAdm.data();
      return {
        rol: 'admin',
        perfil: { id: docAdm.id, authUid: String(uid), rol: 'admin', ...data },
        bloqueado: data.accesoActivo === false,
        suspendido: false
      };
    }
    const docVend = await leerDoc('vendedores');
    if (docVend && docVend.exists) {
      const data = docVend.data();
      let suspendido = false;
      if (data.negocioId) {
        try {
          const docNeg = await conTimeout(db.collection('negocios').doc(String(data.negocioId)).get(), 5000);
          suspendido = !!(docNeg.exists && docNeg.data().suspendido === true);
        } catch (_) {}
      }
      return {
        rol: 'vendedor',
        perfil: { id: docVend.id, authUid: String(uid), rol: 'vendedor', ...data },
        bloqueado: data.accesoActivo === false,
        suspendido
      };
    }
  } catch (e) {
    console.warn('No se pudo leer el estado de acceso:', e && e.message);
  }
  return null;
};

// Revisa el acceso del usuario actual y, si fue bloqueado, cierra su
// sesión y lo saca de la aplicación.
window.validarAccesoActual = async function() {
  if (!usuarioActual || !usuarioActual.authUid) return true;
  if (usuarioActual.rol === 'root') return true;

  const estado = await window.leerEstadoAcceso(usuarioActual.authUid);
  if (!estado) return true;   // sin conexión: no se puede comprobar ahora

  if (estado.bloqueado) {
    console.warn('⛔ Acceso suspendido para', usuarioActual.authUid);
    try { if (typeof firebase !== 'undefined' && firebase.auth) await firebase.auth().signOut(); } catch (_) {}
    usuarioActual = null;
    localStorage.removeItem('sesion_usuario');
    mostrarPantallaAccesoNoAutorizado();
    return false;
  }

  if (estado.rol === 'vendedor') {
    usuarioActual.negocioSuspendido = estado.suspendido;
    if (typeof window.aplicarSuspensionNegocio === 'function') window.aplicarSuspensionNegocio();
  }
  return true;
};

if (typeof firebase !== 'undefined' && firebase.auth) {
  try {
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        console.log('✅ Sesión activa:', user.email);
        sessionStorage.setItem('userEmail', user.email);
        const email = (user.email || '').toLowerCase();

        if (email.includes('root') || email.includes('gnet')) {
          document.getElementById('pantalla-login').classList.add('hidden');
          document.getElementById('pantalla-superadmin').classList.remove('hidden');
          cargarListaAdministradores();
          return;
        }

        // --------------------------------------------------------
        // 1) VALIDACIÓN DE ACCESO contra la nube (fuente de verdad).
        //    Se hace ANTES de mantener o crear la sesión: si el Root
        //    bloqueó la cuenta, el usuario no puede entrar aunque su
        //    sesión de Firebase siga viva en el navegador.
        // --------------------------------------------------------
        let estado = await window.leerEstadoAcceso(user.uid);
        if (estado && estado.bloqueado) {
          console.warn('⛔ Cuenta suspendida por el Superadministrador:', user.uid);
          try { await firebase.auth().signOut(); } catch (_) {}
          mostrarPantallaAccesoNoAutorizado();
          return;
        }

        let rol = null;
        let perfil = null;

        if (estado && estado.perfil) {
          rol = estado.rol;
          perfil = estado.perfil;
        }

        // Sin conexión (o si la nube no respondió): se usa la copia local
        // del dispositivo para poder trabajar sin internet.
        if (!perfil) {
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

          if (adm) { rol = 'admin'; perfil = { ...adm, authUid: user.uid }; }
          else if (vend) { rol = 'vendedor'; perfil = { ...vend, authUid: user.uid }; }

          // Si la copia local ya sabe que la cuenta está suspendida, se bloquea.
          if (perfil && perfil.accesoActivo === false) {
            console.warn('⛔ Cuenta suspendida (copia local del dispositivo):', user.uid);
            try { await firebase.auth().signOut(); } catch (_) {}
            mostrarPantallaAccesoNoAutorizado();
            return;
          }
        }

        // Si no se pudo determinar el rol, se intenta una vez más contra la
        // nube (puede haber sido una lectura lenta) y sólo después de eso se
        // cierra la sesión, para no expulsar al usuario por un fallo puntual.
        if (!rol) {
          estado = await window.leerEstadoAcceso(user.uid);
          if (estado && estado.bloqueado) {
            console.warn('⛔ Cuenta suspendida por el Superadministrador:', user.uid);
            try { await firebase.auth().signOut(); } catch (_) {}
            mostrarPantallaAccesoNoAutorizado();
            return;
          }
          if (estado && estado.perfil) {
            rol = estado.rol;
            perfil = estado.perfil;
          }
        }

        // Si no se pudo determinar el rol, no se adivina: se cierra la sesión
        // para evitar que alguien entre con permisos inventados.
        if (!rol) {
          console.warn('No se encontró perfil para', user.uid, '- cerrando sesión');
          try { await firebase.auth().signOut(); } catch (_) {}
          return;
        }

        // Si ya hay usuarioActual en memoria con datos completos y negocio válido, no sobreescribir con valores genéricos
        if (usuarioActual && (usuarioActual.email === email || usuarioActual.usuario === email || usuarioActual.id === user.uid || usuarioActual.authUid === user.uid)) {
          if (usuarioActual.negocio && usuarioActual.negocio !== 'GNET' && usuarioActual.negocio !== 'GNET Operaciones') {
            console.log('Manteniendo sesión activa con negocio:', usuarioActual.negocio);
            if (estado && estado.rol === 'vendedor') {
              usuarioActual.negocioSuspendido = estado.suspendido;
              if (typeof window.aplicarSuspensionNegocio === 'function') window.aplicarSuspensionNegocio();
            }
            return;
          }
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
          accesoActivo: perfil?.accesoActivo !== false,
          negocioSuspendido: estado ? !!estado.suspendido : false,
          ...(perfil || {})
        });
      }
    });
  } catch (e) {
    console.warn('onAuthStateChanged error:', e);
  }
}

// Comprobación periódica del acceso: si el Root bloquea a un usuario
// mientras la app está abierta, se le expulsa en el siguiente control.
setInterval(() => {
  if (document.visibilityState === 'visible' && usuarioActual && usuarioActual.rol !== 'root') {
    window.validarAccesoActual();
  }
}, 60000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && usuarioActual && usuarioActual.rol !== 'root') {
    window.validarAccesoActual();
  }
});

window.cargarListaVendedores = function() {
  // Root: directorio global (consulta puntual, no escucha en vivo).
  // Para Admin y Vendedor, los datos de su equipo llegan por la ruta
  // aislada negocios/{negocioId}/vendedores durante la sincronización.
  if (!usuarioActual) {
    if (typeof firebase !== 'undefined' && firebase.firestore && navigator.onLine) {
      firebase.firestore().collection('vendedores').get().then(snap => {
        if (snap && !snap.empty) {
          vendedoresDB = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          localStorage.setItem('vendedores_db', JSON.stringify(vendedoresDB));
          poblarSelectsVendedores();
          renderizarVendedores();
        }
      }).catch(() => {});
    }
    return;
  }

  if (usuarioActual.rol === 'admin' || usuarioActual.rol === 'vendedor') {
    const tenant = obtenerTenantActual();
    const nid = negocioIdDe(tenant);
    if (!nid || nid === 'adm_1' || typeof firebase === 'undefined' || !firebase.firestore || !navigator.onLine) return;
    const db = firebase.firestore();
    const consulta = usuarioActual.rol === 'vendedor'
      ? db.collection('negocios').doc(nid).collection('vendedores').doc(String(usuarioActual.authUid || usuarioActual.id))
      : db.collection('negocios').doc(nid).collection('vendedores');
    const promesa = usuarioActual.rol === 'vendedor' ? consulta.get() : consulta.get();
    promesa.then(snap => {
      if (usuarioActual.rol === 'vendedor') {
        if (snap.exists) {
          // El vendedor solo se conoce a sí mismo en el equipo del negocio
          vendedoresDB = [{ id: snap.id, ...snap.data() }];
          localStorage.setItem('negocio_vendedores_' + nid, JSON.stringify(vendedoresDB));
        }
      } else if (snap && !snap.empty) {
        vendedoresDB = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        localStorage.setItem('negocio_vendedores_' + nid, JSON.stringify(vendedoresDB));
        localStorage.setItem('vendedores_db_' + nid, JSON.stringify(vendedoresDB));
      }
      poblarSelectsVendedores();
      renderizarVendedores();
    }).catch(e => console.warn("cargarListaVendedores:", e.message));
  }
};

// Inicializar vistas al cargar
inicializarFormulariosProducto();
cargarListaAdministradores();
cargarListaVendedores();
verificarConexionFirebase();
