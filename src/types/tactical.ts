export type TacticalCategory =
  | 'pantalones'
  | 'camisas'
  | 'botas'
  | 'chalecos'
  | 'chamarras'
  | 'mochilas'
  | 'accesorios';

export interface ProductSize {
  size: string;
  stock: number;
  minStock: number;
}

export interface TacticalProduct {
  id: string;
  sku: string;
  name: string;
  category: TacticalCategory;
  categoryLabel: string;
  colors: string[];
  sizes: ProductSize[];
  priceRetail: number; // Precio Menudeo
  priceWholesale: number; // Precio Mayoreo (3+ pzas)
  costPrice: number; // Costo adquisición
  location: string; // Ej: "Cajuela Camioneta 01", "Almacén Central"
  image: string;
  description: string;
  material: string;
  barcode: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  badge: 'Seguridad Privada' | 'Policía Estatal' | 'Policía Municipal' | 'Fuerzas Especiales / Militar' | 'Tiro Deportivo / Airsoft' | 'Civil / Escolta';
  organization?: string;
  locationZone: string;
  notes?: string;
  creditBalance: number; // Saldo pendiente
  totalOrdersCount: number;
  totalSpent: number;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  maxStock: number;
}

export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta' | 'credito';
export type PaymentStatus = 'pagado' | 'anticipo' | 'pendiente';
export type DeliveryStatus = 'entregado_en_campo' | 'en_camino' | 'pendiente';

export interface TacticalOrder {
  id: string;
  folio: string; // Ej: "TC-2026-0045"
  date: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerBadge: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  totalCost: number;
  profit: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountPending: number;
  deliveryStatus: DeliveryStatus;
  fieldLocation: string;
  notes: string;
  receiptGenerated?: boolean;
  historyPayments?: Array<{
    date: string;
    amount: number;
    method: PaymentMethod;
    note?: string;
  }>;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  type: 'venta' | 'reabastecimiento' | 'ajuste' | 'devolucion';
  quantity: number;
  referenceFolio?: string;
  reason: string;
  operator: string;
}

export interface FirebaseConnectionConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  isConfigured: boolean;
  syncEnabled: boolean;
  lastSync?: string;
}
