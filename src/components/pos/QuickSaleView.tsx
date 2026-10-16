import React, { useState } from 'react';
import {
  Search,
  Scan,
  ShoppingBag,
  Trash2,
  User,
  Plus,
  CreditCard,
  Banknote,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Minus,
  MapPin,
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  TacticalProduct,
  Customer,
  CartItem,
  PaymentMethod,
  PaymentStatus,
  TacticalCategory,
  TacticalOrder
} from '../../types/tactical';
import { ProductSelectModal } from './ProductSelectModal';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';
import { SaleReceiptModal } from './SaleReceiptModal';

interface QuickSaleViewProps {
  products: TacticalProduct[];
  customers: Customer[];
  onCompleteSale: (orderData: Omit<TacticalOrder, 'id' | 'folio' | 'date'>) => TacticalOrder;
  onQuickAddCustomer: (customer: Customer) => void;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  isCartDrawerOpen: boolean;
  setIsCartDrawerOpen: (open: boolean) => void;
}

export const QuickSaleView: React.FC<QuickSaleViewProps> = ({
  products,
  customers,
  onCompleteSale,
  onQuickAddCustomer,
  cart,
  setCart,
  isCartDrawerOpen,
  setIsCartDrawerOpen
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedProductForModal, setSelectedProductForModal] = useState<TacticalProduct | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Checkout states
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustBadge, setNewCustBadge] = useState<Customer['badge']>('Policía Estatal');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [fieldLocation, setFieldLocation] = useState('Punto de Control / Base');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [cashTendered, setCashTendered] = useState<string>(''); // Cuánto paga el cliente en mano
  const [creditAmountPaid, setCreditAmountPaid] = useState<number>(0); // Anticipo si es a crédito
  const [lastCompletedOrder, setLastCompletedOrder] = useState<TacticalOrder | null>(null);

  const categories = [
    { id: 'todos', label: 'Todo el Equipo' },
    { id: 'pantalones', label: 'Pantalones' },
    { id: 'camisas', label: 'Camisas' },
    { id: 'botas', label: 'Botas' },
    { id: 'chalecos', label: 'Chalecos' },
    { id: 'chamarras', label: 'Chamarras' },
    { id: 'mochilas', label: 'Mochilas' },
    { id: 'accesorios', label: 'Accesorios' }
  ];

  // Filters
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'todos' || p.category === selectedCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      p.barcode.includes(query) ||
      p.colors.some((c) => c.toLowerCase().includes(query));
    return matchesCat && matchesSearch;
  });

  // Cart calculations
  const subtotal = cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const totalCost = cart.reduce((acc, item) => acc + item.quantity * item.costPrice, 0);
  const total = Math.max(0, subtotal - discountAmount);
  const profit = Math.max(0, total - totalCost);

  // Cash change
  const cashGivenNumber = parseFloat(cashTendered) || 0;
  const cashChange = cashGivenNumber > total ? cashGivenNumber - total : 0;

  const handleAddToCart = (item: CartItem) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) => i.productId === item.productId && i.size === item.size && i.color === item.color
      );
      if (existingIndex >= 0) {
        const copy = [...prev];
        const newQty = Math.min(copy[existingIndex].maxStock, copy[existingIndex].quantity + item.quantity);
        copy[existingIndex] = { ...copy[existingIndex], quantity: newQty };
        return copy;
      }
      return [...prev, item];
    });
    setIsCartDrawerOpen(true);
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateCartQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveFromCart(index);
      return;
    }
    setCart((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        quantity: Math.min(copy[index].maxStock, newQty)
      };
      return copy;
    });
  };

  const handleCreateQuickCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      badge: newCustBadge,
      locationZone: fieldLocation,
      creditBalance: 0,
      totalOrdersCount: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString()
    };

    onQuickAddCustomer(newCust);
    setSelectedCustomerId(newCust.id);
    setNewCustName('');
    setNewCustPhone('');
    setIsNewCustomerModalOpen(false);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;

    const currentCustomer = customers.find((c) => c.id === selectedCustomerId) || {
      id: 'cust-anon',
      name: 'Cliente Mostrador / Campo Express',
      phone: '',
      badge: 'Civil / Escolta'
    };

    let paymentStatus: PaymentStatus = 'pagado';
    let amountPaid = total;
    let amountPending = 0;

    if (paymentMethod === 'credito') {
      amountPaid = creditAmountPaid;
      amountPending = Math.max(0, total - creditAmountPaid);
      paymentStatus = amountPending === 0 ? 'pagado' : creditAmountPaid > 0 ? 'anticipo' : 'pendiente';
    }

    const orderCreated = onCompleteSale({
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      customerPhone: currentCustomer.phone,
      customerBadge: currentCustomer.badge,
      items: [...cart],
      subtotal,
      discount: discountAmount,
      total,
      totalCost,
      profit,
      paymentMethod,
      paymentStatus,
      amountPaid,
      amountPending,
      deliveryStatus: 'entregado_en_campo',
      fieldLocation: fieldLocation || 'Entrega en Terreno',
      notes: notes.trim(),
      receiptGenerated: true
    });

    // Confetti celebration
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch {
      // safe fallback
    }

    setLastCompletedOrder(orderCreated);
    setCart([]);
    setDiscountAmount(0);
    setNotes('');
    setCashTendered('');
    setCreditAmountPaid(0);
    setIsCartDrawerOpen(false);
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 pb-24 md:pb-8">
      {/* Search & Quick Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por prenda, modelo, código SKU, color..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              Borrar
            </button>
          )}
        </div>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-sm"
        >
          <Scan className="w-4 h-4 text-amber-400" />
          <span>Escanear Etiqueta</span>
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-4 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main Grid: Products + Cart Sidebar for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Products Grid */}
        <div className="lg:col-span-8 xl:col-span-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase text-slate-400">
              {filteredProducts.length} artículos disponibles en ruta
            </span>
            <span className="text-xs text-slate-500">Toca para seleccionar talla & color</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((product) => {
              const totalStock = product.sizes.reduce((acc, s) => acc + s.stock, 0);
              const isOut = totalStock <= 0;

              return (
                <div
                  key={product.id}
                  onClick={() => setSelectedProductForModal(product)}
                  className={`group relative bg-slate-900 border rounded-xl overflow-hidden cursor-pointer transition-all hover:border-amber-500/50 hover:shadow-lg flex flex-col ${
                    isOut ? 'border-slate-800/60 opacity-60' : 'border-slate-800'
                  }`}
                >
                  {/* Image container */}
                  <div className="relative aspect-square bg-slate-950 overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-amber-400 border border-slate-800">
                      {product.sku}
                    </div>
                    {totalStock <= 5 && totalStock > 0 && (
                      <div className="absolute bottom-2 left-2 bg-amber-500/90 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        Pocas pzas ({totalStock})
                      </div>
                    )}
                    {isOut && (
                      <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-xs font-bold text-rose-400">
                        Agotado en Ruta
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-100 line-clamp-2 leading-tight">
                        {product.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                        {product.colors.join(' · ')}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-baseline justify-between">
                      <div>
                        <span className="text-sm sm:text-base font-mono font-extrabold text-amber-400">
                          ${product.priceRetail.toLocaleString('es-MX')}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Mayoreo: ${product.priceWholesale}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-slate-400">
                        {totalStock} pzas
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cart Drawer / Sidebar */}
        <div
          className={`lg:col-span-4 xl:col-span-4 ${
            isCartDrawerOpen
              ? 'fixed inset-0 z-50 lg:relative lg:inset-auto bg-slate-950/80 lg:bg-transparent flex justify-end'
              : 'hidden lg:block'
          }`}
        >
          <div className="w-full max-w-md lg:max-w-none bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col h-full max-h-[92vh] overflow-hidden my-auto lg:my-0">
            {/* Cart Header */}
            <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
                  Pedido en Curso ({cart.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    Vaciar
                  </button>
                )}
                {isCartDrawerOpen && (
                  <button
                    onClick={() => setIsCartDrawerOpen(false)}
                    className="lg:hidden text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-800 rounded"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            </div>

            {/* Cart Items List */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-500 space-y-2">
                  <ShoppingBag className="w-10 h-10 mx-auto text-slate-700" />
                  <p className="text-xs">No hay prendas agregadas.</p>
                  <p className="text-[11px] text-slate-600">
                    Selecciona ropa táctica del catálogo para levantar pedido.
                  </p>
                </div>
              ) : (
                cart.map((item, index) => (
                  <div
                    key={`${item.productId}-${item.size}-${item.color}`}
                    className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl space-y-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-200 line-clamp-1">{item.name}</div>
                        <div className="text-[11px] text-slate-400">
                          Talla: <span className="text-amber-400 font-semibold">{item.size}</span> | Color: {item.color}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFromCart(index)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg">
                        <button
                          onClick={() => handleUpdateCartQty(index, item.quantity - 1)}
                          className="px-2 py-1 text-slate-400 hover:text-white"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-mono font-bold text-slate-200">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateCartQty(index, item.quantity + 1)}
                          className="px-2 py-1 text-slate-400 hover:text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-amber-400">
                          ${(item.quantity * item.unitPrice).toLocaleString('es-MX')}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          (${item.unitPrice} c/u)
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Customer Selector */}
              {cart.length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                      <User className="w-3 h-3 text-amber-400" />
                      <span>Cliente en Campo:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsNewCustomerModalOpen(true)}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300"
                    >
                      + Nuevo Cliente
                    </button>
                  </div>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.organization ? `(${c.organization})` : ''}
                      </option>
                    ))}
                  </select>

                  {/* Field location input */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span>Punto de entrega en ruta:</span>
                    </label>
                    <input
                      type="text"
                      value={fieldLocation}
                      onChange={(e) => setFieldLocation(e.target.value)}
                      placeholder="Ej. Destacamento Norte, Caseta 2"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Payment Method Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300">Forma de Pago:</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('efectivo')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                          paymentMethod === 'efectivo'
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                            : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        <Banknote className="w-3.5 h-3.5" /> Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('transferencia')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                          paymentMethod === 'transferencia'
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                            : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Transferencia SPEI
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('tarjeta')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                          paymentMethod === 'tarjeta'
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                            : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        Tarjeta
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('credito')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors ${
                          paymentMethod === 'credito'
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                            : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        Crédito en Campo
                      </button>
                    </div>
                  </div>

                  {/* Cash Change Calculator */}
                  {paymentMethod === 'efectivo' && (
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Paga con:</span>
                        <input
                          type="number"
                          placeholder="$0.00"
                          value={cashTendered}
                          onChange={(e) => setCashTendered(e.target.value)}
                          className="w-24 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-right font-mono font-bold text-slate-100"
                        />
                      </div>
                      {cashGivenNumber > 0 && (
                        <div className="flex justify-between items-center pt-1 border-t border-slate-900 font-bold">
                          <span className="text-slate-400">Cambio a entregar:</span>
                          <span className="font-mono text-emerald-400 text-sm">
                            ${cashChange.toLocaleString('es-MX')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Credit Advance Input */}
                  {paymentMethod === 'credito' && (
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Anticipo recibido hoy:</span>
                        <input
                          type="number"
                          min="0"
                          max={total}
                          value={creditAmountPaid}
                          onChange={(e) => setCreditAmountPaid(parseFloat(e.target.value) || 0)}
                          className="w-24 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-right font-mono font-bold text-slate-100"
                        />
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-900 font-bold text-rose-400">
                        <span>Saldo por cobrar:</span>
                        <span className="font-mono text-sm">
                          ${Math.max(0, total - creditAmountPaid).toLocaleString('es-MX')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Optional Discount */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Descuento ($):</span>
                    <input
                      type="number"
                      min="0"
                      value={discountAmount || ''}
                      placeholder="$0"
                      onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                      className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-xs font-mono text-amber-400"
                    />
                  </div>

                  {/* Quick Note */}
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Nota / Observación rápida (opcional)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
                  />
                </div>
              )}
            </div>

            {/* Cart Footer & Checkout */}
            {cart.length > 0 && (
              <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-mono">${subtotal.toLocaleString('es-MX')}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Descuento:</span>
                      <span className="font-mono">-${discountAmount.toLocaleString('es-MX')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-extrabold text-white pt-1">
                    <span>TOTAL:</span>
                    <span className="font-mono text-amber-400 text-lg">
                      ${total.toLocaleString('es-MX')} MXN
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg active:scale-98"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Cobrar Venta & Generar Ticket</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Select Modal */}
      <ProductSelectModal
        product={selectedProductForModal}
        onAddToCart={handleAddToCart}
        onClose={() => setSelectedProductForModal(null)}
      />

      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <BarcodeScannerModal
          products={products}
          onScanMatch={(p) => {
            setSelectedProductForModal(p);
          }}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

      {/* Sale Receipt Modal (Generated after checkout) */}
      <SaleReceiptModal
        order={lastCompletedOrder}
        onClose={() => setLastCompletedOrder(null)}
      />

      {/* Quick Add Customer Modal */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              Agregar Cliente de Campo
            </h4>
            <form onSubmit={handleCreateQuickCustomer} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nombre Completo:</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Ej. Capitán Morales"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">WhatsApp / Teléfono:</label>
                <input
                  type="tel"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="Ej. 5512345678"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Sector / Corporación:</label>
                <select
                  value={newCustBadge}
                  onChange={(e) => setNewCustBadge(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="Policía Estatal">Policía Estatal</option>
                  <option value="Policía Municipal">Policía Municipal</option>
                  <option value="Seguridad Privada">Seguridad Privada</option>
                  <option value="Fuerzas Especiales / Militar">Fuerzas Especiales / Militar</option>
                  <option value="Tiro Deportivo / Airsoft">Tiro Deportivo / Airsoft</option>
                  <option value="Civil / Escolta">Civil / Escolta</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  className="flex-1 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
