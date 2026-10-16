import { TacticalProduct, Customer, TacticalOrder, StockMovement, CartItem } from '../types/tactical';
import { INITIAL_PRODUCTS, INITIAL_CUSTOMERS, INITIAL_ORDERS } from '../data/initialData';

const KEYS = {
  PRODUCTS: 'vc_tactical_products_v1',
  CUSTOMERS: 'vc_tactical_customers_v1',
  ORDERS: 'vc_tactical_orders_v1',
  MOVEMENTS: 'vc_tactical_movements_v1'
};

export const storageService = {
  // --- PRODUCTOS ---
  getProducts(): TacticalProduct[] {
    try {
      const data = localStorage.getItem(KEYS.PRODUCTS);
      if (!data) {
        localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(INITIAL_PRODUCTS));
        return INITIAL_PRODUCTS;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Error reading products', e);
      return INITIAL_PRODUCTS;
    }
  },

  saveProducts(products: TacticalProduct[]): void {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products));
  },

  saveProduct(product: TacticalProduct): TacticalProduct[] {
    const products = this.getProducts();
    const index = products.findIndex((p) => p.id === product.id);
    if (index >= 0) {
      products[index] = { ...product, updatedAt: new Date().toISOString() };
    } else {
      products.unshift({ ...product, updatedAt: new Date().toISOString() });
    }
    this.saveProducts(products);
    return products;
  },

  deleteProduct(id: string): TacticalProduct[] {
    const products = this.getProducts().filter((p) => p.id !== id);
    this.saveProducts(products);
    return products;
  },

  adjustStock(
    productId: string,
    size: string,
    quantityChange: number,
    reason: string = 'Ajuste manual de campo'
  ): { products: TacticalProduct[]; success: boolean } {
    const products = this.getProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) return { products, success: false };

    const sizeObj = product.sizes.find((s) => s.size === size);
    if (!sizeObj) return { products, success: false };

    const newStock = Math.max(0, sizeObj.stock + quantityChange);
    const diff = newStock - sizeObj.stock;
    sizeObj.stock = newStock;
    product.updatedAt = new Date().toISOString();

    this.saveProducts(products);

    if (diff !== 0) {
      this.recordMovement({
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: new Date().toISOString(),
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        size,
        color: product.colors[0] || 'Estándar',
        type: diff > 0 ? 'reabastecimiento' : 'ajuste',
        quantity: Math.abs(diff),
        reason,
        operator: 'Vendedor en Campo'
      });
    }

    return { products, success: true };
  },

  // --- CLIENTES ---
  getCustomers(): Customer[] {
    try {
      const data = localStorage.getItem(KEYS.CUSTOMERS);
      if (!data) {
        localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
        return INITIAL_CUSTOMERS;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Error reading customers', e);
      return INITIAL_CUSTOMERS;
    }
  },

  saveCustomers(customers: Customer[]): void {
    localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(customers));
  },

  saveCustomer(customer: Customer): Customer[] {
    const customers = this.getCustomers();
    const index = customers.findIndex((c) => c.id === customer.id);
    if (index >= 0) {
      customers[index] = customer;
    } else {
      customers.unshift(customer);
    }
    this.saveCustomers(customers);
    return customers;
  },

  recordCustomerPayment(
    customerId: string,
    amount: number,
    method: 'efectivo' | 'transferencia' | 'tarjeta',
    orderId?: string
  ): { customers: Customer[]; orders: TacticalOrder[] } {
    const customers = this.getCustomers();
    const cust = customers.find((c) => c.id === customerId);
    if (cust) {
      cust.creditBalance = Math.max(0, cust.creditBalance - amount);
      this.saveCustomers(customers);
    }

    const orders = this.getOrders();
    if (orderId) {
      const ord = orders.find((o) => o.id === orderId);
      if (ord) {
        ord.amountPaid = (ord.amountPaid || 0) + amount;
        ord.amountPending = Math.max(0, ord.total - ord.amountPaid);
        if (ord.amountPending === 0) {
          ord.paymentStatus = 'pagado';
        }
        if (!ord.historyPayments) ord.historyPayments = [];
        ord.historyPayments.push({
          date: new Date().toISOString(),
          amount,
          method,
          note: 'Abono registrado en campo'
        });
        this.saveOrders(orders);
      }
    }

    return { customers, orders };
  },

  // --- PEDIDOS / VENTAS ---
  getOrders(): TacticalOrder[] {
    try {
      const data = localStorage.getItem(KEYS.ORDERS);
      if (!data) {
        localStorage.setItem(KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
        return INITIAL_ORDERS;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Error reading orders', e);
      return INITIAL_ORDERS;
    }
  },

  saveOrders(orders: TacticalOrder[]): void {
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  },

  createOrder(orderData: Omit<TacticalOrder, 'id' | 'folio' | 'date'>): {
    order: TacticalOrder;
    products: TacticalProduct[];
    customers: Customer[];
    orders: TacticalOrder[];
  } {
    const orders = this.getOrders();
    const count = orders.length + 144;
    const year = new Date().getFullYear();
    const folio = `VC-${year}-${String(count).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const newOrder: TacticalOrder = {
      ...orderData,
      id: `ord-${Date.now()}`,
      folio,
      date: now,
      historyPayments: orderData.amountPaid > 0 ? [
        {
          date: now,
          amount: orderData.amountPaid,
          method: orderData.paymentMethod,
          note: orderData.paymentStatus === 'pagado' ? 'Pago completo liquidado' : 'Anticipo inicial'
        }
      ] : []
    };

    orders.unshift(newOrder);
    this.saveOrders(orders);

    // Descontar inventario automáticamente
    const products = this.getProducts();
    for (const item of orderData.items) {
      const prod = products.find((p) => p.id === item.productId);
      if (prod) {
        const sizeObj = prod.sizes.find((s) => s.size === item.size);
        if (sizeObj) {
          sizeObj.stock = Math.max(0, sizeObj.stock - item.quantity);
        }
        prod.updatedAt = now;

        // Registrar kardex
        this.recordMovement({
          id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          date: now,
          productId: prod.id,
          productName: prod.name,
          sku: item.sku,
          size: item.size,
          color: item.color,
          type: 'venta',
          quantity: item.quantity,
          referenceFolio: folio,
          reason: `Venta en campo nota #${folio}`,
          operator: 'Venta de Campo'
        });
      }
    }
    this.saveProducts(products);

    // Actualizar cliente
    const customers = this.getCustomers();
    const cust = customers.find((c) => c.id === orderData.customerId);
    if (cust) {
      cust.totalOrdersCount = (cust.totalOrdersCount || 0) + 1;
      cust.totalSpent = (cust.totalSpent || 0) + newOrder.total;
      if (newOrder.amountPending > 0) {
        cust.creditBalance = (cust.creditBalance || 0) + newOrder.amountPending;
      }
      this.saveCustomers(customers);
    }

    return { order: newOrder, products, customers, orders };
  },

  // --- KARDEX & MOVIMIENTOS ---
  getMovements(): StockMovement[] {
    try {
      const data = localStorage.getItem(KEYS.MOVEMENTS);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  recordMovement(movement: StockMovement): void {
    const list = this.getMovements();
    list.unshift(movement);
    if (list.length > 500) list.pop(); // Mantener los últimos 500
    localStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(list));
  },

  // --- COPIA DE SEGURIDAD & RESTAURACIÓN ---
  exportBackupJSON(): string {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      products: this.getProducts(),
      customers: this.getCustomers(),
      orders: this.getOrders(),
      movements: this.getMovements()
    };
    return JSON.stringify(payload, null, 2);
  },

  importBackupJSON(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.products)) this.saveProducts(data.products);
      if (Array.isArray(data.customers)) this.saveCustomers(data.customers);
      if (Array.isArray(data.orders)) this.saveOrders(data.orders);
      if (Array.isArray(data.movements)) localStorage.setItem(KEYS.MOVEMENTS, JSON.stringify(data.movements));
      return true;
    } catch (e) {
      console.error('Error importing backup', e);
      return false;
    }
  },

  resetToDemo(): void {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(INITIAL_PRODUCTS));
    localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(INITIAL_CUSTOMERS));
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
    localStorage.removeItem(KEYS.MOVEMENTS);
  }
};
