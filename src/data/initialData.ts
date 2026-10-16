import { TacticalProduct, Customer, TacticalOrder } from '../types/tactical';

export const INITIAL_PRODUCTS: TacticalProduct[] = [
  {
    id: 'prod-1',
    sku: 'TAC-PNT-STRYKE',
    name: 'Pantalón Táctico Stryke Ripstop 10 Bolsillos',
    category: 'pantalones',
    categoryLabel: 'Pantalones',
    colors: ['Negro Táctico', 'Coyote Brown', 'Verde OD', 'Multicam'],
    sizes: [
      { size: '30x32', stock: 12, minStock: 3 },
      { size: '32x32', stock: 18, minStock: 4 },
      { size: '34x32', stock: 15, minStock: 4 },
      { size: '36x32', stock: 8, minStock: 2 },
      { size: '38x32', stock: 5, minStock: 2 }
    ],
    priceRetail: 1250,
    priceWholesale: 980,
    costPrice: 620,
    location: 'Cajuela Camioneta 01 (Caja 1)',
    image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=600&q=80',
    description: 'Pantalón operativo de alta resistencia en tela Ripstop antidesgarro con acabado Teflón repelente al agua y manchas. Refuerzo en rodillas y tiro.',
    material: '65% Poliéster / 35% Algodón Ripstop 240g con Teflón',
    barcode: '750102938401',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-2',
    sku: 'TAC-CMB-SHIRT',
    name: 'Camisa de Combate Tactical Assault Transpirable',
    category: 'camisas',
    categoryLabel: 'Camisas de Combate',
    colors: ['Multicam', 'Negro Táctico', 'Verde Oliva'],
    sizes: [
      { size: 'S', stock: 6, minStock: 2 },
      { size: 'M', stock: 14, minStock: 4 },
      { size: 'L', stock: 16, minStock: 4 },
      { size: 'XL', stock: 10, minStock: 3 },
      { size: '2XL', stock: 4, minStock: 2 }
    ],
    priceRetail: 950,
    priceWholesale: 740,
    costPrice: 450,
    location: 'Cajuela Camioneta 01 (Caja 2)',
    image: 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&w=600&q=80',
    description: 'Camisa diseñada para portar bajo chaleco táctico. Torso elástico de secado ultra-rápido y mangas reforzadas con bolsillos con velcro y coderas removibles.',
    material: 'Torso: 92% Poliéster / 8% Spandex. Mangas: Ripstop 65/35',
    barcode: '750102938402',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-3',
    sku: 'TAC-BOOT-8WP',
    name: 'Bota Táctica Operativa 8" Waterproof Cierre YKK',
    category: 'botas',
    categoryLabel: 'Calzado & Botas',
    colors: ['Negro Táctico', 'Coyote Tan'],
    sizes: [
      { size: '25.5 MEX', stock: 4, minStock: 1 },
      { size: '26.5 MEX', stock: 8, minStock: 2 },
      { size: '27.0 MEX', stock: 10, minStock: 3 },
      { size: '28.0 MEX', stock: 9, minStock: 2 },
      { size: '29.0 MEX', stock: 5, minStock: 2 }
    ],
    priceRetail: 2100,
    priceWholesale: 1680,
    costPrice: 1100,
    location: 'Almacén de Ruta (Cajas Calzado)',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
    description: 'Calzado táctico ligero con suela antiderrapante en aceite/agua, amortiguación EVA de alto impacto y cremallera lateral para descalce veloz.',
    material: 'Piel genuina hidrofugada + Cordura 1000D balística',
    barcode: '750102938403',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-4',
    sku: 'TAC-VEST-JPC',
    name: 'Chaleco Táctico Portaplacas Laser-Cut MOLLE Quick-Release',
    category: 'chalecos',
    categoryLabel: 'Chalecos & Portaplacas',
    colors: ['Negro Táctico', 'Coyote Brown', 'Verde OD'],
    sizes: [
      { size: 'Ajustable Universal (M/L/XL)', stock: 8, minStock: 2 },
      { size: 'Talla Grande (XL/2XL)', stock: 4, minStock: 1 }
    ],
    priceRetail: 2850,
    priceWholesale: 2200,
    costPrice: 1400,
    location: 'Cajuela Camioneta 01 (Rack Colgante)',
    image: 'https://images.unsplash.com/photo-1508873696983-2df57046475a?auto=format&fit=crop&w=600&q=80',
    description: 'Portaplacas balístico con sistema de liberación rápida por cable, ranuras cortadas por láser MOLLE y almohadillas acolchadas de hombro.',
    material: 'Nylon Cordura 1000D militar de alta tenacidad',
    barcode: '750102938404',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-5',
    sku: 'TAC-JCK-SFT',
    name: 'Chamarra Softshell Térmica Impermeable Fuerzas Especiales',
    category: 'chamarras',
    categoryLabel: 'Chamarras & Abrigo',
    colors: ['Negro Táctico', 'Verde OD', 'Gris Urbano'],
    sizes: [
      { size: 'M', stock: 7, minStock: 2 },
      { size: 'L', stock: 11, minStock: 3 },
      { size: 'XL', stock: 8, minStock: 2 },
      { size: '2XL', stock: 3, minStock: 1 }
    ],
    priceRetail: 1750,
    priceWholesale: 1390,
    costPrice: 890,
    location: 'Cajuela Camioneta 01 (Perchero)',
    image: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=600&q=80',
    description: 'Chamarra táctica rompevientos con forro polar interior microporoso transpirable, capucha oculta plegable y 7 bolsillos utilitarios.',
    material: 'Exterior DWR impermeable + Membrana TPU transpirable + Polar térmico',
    barcode: '750102938405',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-6',
    sku: 'TAC-BAG-ASSAULT',
    name: 'Mochila Táctica Asalto 3-Day Pack 45L con Sistema MOLLE',
    category: 'mochilas',
    categoryLabel: 'Mochilas & Bolsos',
    colors: ['Coyote Brown', 'Multicam', 'Negro Táctico'],
    sizes: [
      { size: 'Capacidad 45 Litros', stock: 10, minStock: 2 }
    ],
    priceRetail: 1450,
    priceWholesale: 1150,
    costPrice: 720,
    location: 'Cajuela Camioneta 01 (Estante Trasero)',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80',
    description: 'Mochila de combate con 4 compartimentos de carga, compartimento para bolsa de hidratación camelback de 3L y correas de compresión en Y.',
    material: 'Nylon Oxford balístico 900D impermeable',
    barcode: '750102938406',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-7',
    sku: 'TAC-BLT-COBRA',
    name: 'Cinturón Táctico Rigger con Hebilla Metálica Cobra Quick-Release',
    category: 'accesorios',
    categoryLabel: 'Accesorios & Equipo',
    colors: ['Negro Táctico', 'Coyote Tan', 'Verde Oliva'],
    sizes: [
      { size: 'M (30-34)', stock: 15, minStock: 4 },
      { size: 'L (36-40)', stock: 14, minStock: 4 },
      { size: 'XL (42-46)', stock: 7, minStock: 2 }
    ],
    priceRetail: 420,
    priceWholesale: 320,
    costPrice: 170,
    location: 'Cajonera Frontal Unidad',
    image: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&w=600&q=80',
    description: 'Cinturón de combate rígido de doble capa de 3.8 cm, apto para soportar funda de arma, cargadores y accesorios sin doblarse.',
    material: 'Nylon reforzado de 1000lb + Hebilla aleación de zinc y magnesio',
    barcode: '750102938407',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prod-8',
    sku: 'TAC-GLV-HARD',
    name: 'Guantes Tácticos con Nudillos Rígidos Antigolpe y Touchscreen',
    category: 'accesorios',
    categoryLabel: 'Accesorios & Equipo',
    colors: ['Negro Táctico', 'Coyote Brown', 'Verde Militar'],
    sizes: [
      { size: 'M', stock: 12, minStock: 3 },
      { size: 'L', stock: 15, minStock: 4 },
      { size: 'XL', stock: 9, minStock: 2 }
    ],
    priceRetail: 520,
    priceWholesale: 390,
    costPrice: 220,
    location: 'Cajonera Frontal Unidad',
    image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=600&q=80',
    description: 'Protección termoplástica en nudillos contra impactos severos, palma con grip antideslizante y puntas dactilares capacitivas para pantallas.',
    material: 'Microfibra transpirable, piel sintética PU y polímero EVA',
    barcode: '750102938408',
    updatedAt: new Date().toISOString()
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    name: 'Comandante Raúl Mendoza',
    phone: '525512345678',
    badge: 'Policía Estatal',
    organization: 'Grupo Táctico de Intervención (GTI)',
    locationZone: 'Destacamento Centro - Sector 4',
    notes: 'Compra por volumen para su destacamento. Prefiere colores Negro Táctico y Multicam.',
    creditBalance: 0,
    totalOrdersCount: 6,
    totalSpent: 18450,
    createdAt: '2026-08-15T10:00:00.000Z'
  },
  {
    id: 'cust-2',
    name: 'Lic. Gerardo Salazar (Jefe de Operaciones)',
    phone: '525587654321',
    badge: 'Seguridad Privada',
    organization: 'Seguridad Corporativa Dragón S.A.',
    locationZone: 'Parque Industrial Norte - Nave 12',
    notes: 'Pedidos quincenales de camisas, pantalones y botas. Solicita factura.',
    creditBalance: 2400,
    totalOrdersCount: 11,
    totalSpent: 42300,
    createdAt: '2026-07-20T12:00:00.000Z'
  },
  {
    id: 'cust-3',
    name: 'Sargento Primero Carlos V. Juárez',
    phone: '525599887766',
    badge: 'Fuerzas Especiales / Militar',
    organization: 'Campo Militar Zona 1',
    locationZone: 'Acceso Puerta 3 - Campo Militar',
    notes: 'Cliente personal. Interesado en botas ligeras y mochilas MOLLE.',
    creditBalance: 0,
    totalOrdersCount: 3,
    totalSpent: 7300,
    createdAt: '2026-09-01T15:30:00.000Z'
  },
  {
    id: 'cust-4',
    name: 'Roberto Valdés (Capitán de Equipo)',
    phone: '525544332211',
    badge: 'Tiro Deportivo / Airsoft',
    organization: 'Club Cinegético y Tiro "Los Halcones"',
    locationZone: 'Campo de Tiro Las Huertas',
    notes: 'Compran chalecos, parches, guantes y camisas tácticas los fines de semana.',
    creditBalance: 0,
    totalOrdersCount: 4,
    totalSpent: 11200,
    createdAt: '2026-09-18T11:20:00.000Z'
  },
  {
    id: 'cust-5',
    name: 'Cliente Mostrador / Campo Express',
    phone: '',
    badge: 'Civil / Escolta',
    organization: 'Venta Directa en Ruta',
    locationZone: 'En Unidad de Venta',
    notes: 'Cliente casual que compra al paso.',
    creditBalance: 0,
    totalOrdersCount: 14,
    totalSpent: 26800,
    createdAt: '2026-06-10T09:00:00.000Z'
  }
];

export const INITIAL_ORDERS: TacticalOrder[] = [
  {
    id: 'ord-101',
    folio: 'VC-2026-0142',
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    customerId: 'cust-1',
    customerName: 'Comandante Raúl Mendoza',
    customerPhone: '525512345678',
    customerBadge: 'Policía Estatal',
    items: [
      {
        productId: 'prod-1',
        name: 'Pantalón Táctico Stryke Ripstop 10 Bolsillos',
        sku: 'TAC-PNT-STRYKE',
        color: 'Negro Táctico',
        size: '32x32',
        quantity: 2,
        unitPrice: 980,
        costPrice: 620,
        maxStock: 18
      },
      {
        productId: 'prod-2',
        name: 'Camisa de Combate Tactical Assault Transpirable',
        sku: 'TAC-CMB-SHIRT',
        color: 'Negro Táctico',
        size: 'L',
        quantity: 2,
        unitPrice: 740,
        costPrice: 450,
        maxStock: 16
      }
    ],
    subtotal: 3440,
    discount: 0,
    total: 3440,
    totalCost: 2140,
    profit: 1300,
    paymentMethod: 'transferencia',
    paymentStatus: 'pagado',
    amountPaid: 3440,
    amountPending: 0,
    deliveryStatus: 'entregado_en_campo',
    fieldLocation: 'Destacamento Centro',
    notes: 'Entregado en mano en puesto de guardia.',
    historyPayments: [
      {
        date: new Date(Date.now() - 86400000 * 2).toISOString(),
        amount: 3440,
        method: 'transferencia',
        note: 'Pago SPEI Banco Azteca'
      }
    ]
  },
  {
    id: 'ord-102',
    folio: 'VC-2026-0143',
    date: new Date(Date.now() - 86400000).toISOString(),
    customerId: 'cust-2',
    customerName: 'Lic. Gerardo Salazar (Jefe de Operaciones)',
    customerPhone: '525587654321',
    customerBadge: 'Seguridad Privada',
    items: [
      {
        productId: 'prod-3',
        name: 'Bota Táctica Operativa 8" Waterproof Cierre YKK',
        sku: 'TAC-BOOT-8WP',
        color: 'Negro Táctico',
        size: '27.0 MEX',
        quantity: 2,
        unitPrice: 1680,
        costPrice: 1100,
        maxStock: 10
      },
      {
        productId: 'prod-7',
        name: 'Cinturón Táctico Rigger con Hebilla Metálica Cobra Quick-Release',
        sku: 'TAC-BLT-COBRA',
        color: 'Negro Táctico',
        size: 'L (36-40)',
        quantity: 4,
        unitPrice: 320,
        costPrice: 170,
        maxStock: 14
      }
    ],
    subtotal: 4640,
    discount: 240,
    total: 4400,
    totalCost: 2880,
    profit: 1520,
    paymentMethod: 'credito',
    paymentStatus: 'anticipo',
    amountPaid: 2000,
    amountPending: 2400,
    deliveryStatus: 'entregado_en_campo',
    fieldLocation: 'Parque Industrial Norte Nave 12',
    notes: 'Anticipo en efectivo recibido $2,000. Saldo pendiente $2,400 a liquidar el viernes.',
    historyPayments: [
      {
        date: new Date(Date.now() - 86400000).toISOString(),
        amount: 2000,
        method: 'efectivo',
        note: 'Anticipo inicial en mano'
      }
    ]
  }
];
