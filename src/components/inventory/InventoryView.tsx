import React, { useState } from 'react';
import {
  Package,
  Plus,
  Search,
  Scan,
  AlertTriangle,
  Edit2,
  Trash2,
  Layers,
  TrendingUp,
  DollarSign,
  ArrowUpDown,
  History,
  CheckCircle,
  Shield
} from 'lucide-react';
import { TacticalProduct, StockMovement } from '../../types/tactical';
import { ProductFormModal } from './ProductFormModal';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';

interface InventoryViewProps {
  products: TacticalProduct[];
  movements: StockMovement[];
  onSaveProduct: (product: TacticalProduct) => void;
  onDeleteProduct: (id: string) => void;
  onAdjustStock: (productId: string, size: string, change: number, reason?: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  movements,
  onSaveProduct,
  onDeleteProduct,
  onAdjustStock
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [stockStatusFilter, setStockStatusFilter] = useState<'todos' | 'bajo' | 'agotado'>('todos');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<TacticalProduct | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Overall Inventory Stats
  const totalItemsCount = products.reduce(
    (acc, p) => acc + p.sizes.reduce((sum, s) => sum + s.stock, 0),
    0
  );

  const totalRetailValue = products.reduce((acc, p) => {
    const pStock = p.sizes.reduce((sum, s) => sum + s.stock, 0);
    return acc + pStock * p.priceRetail;
  }, 0);

  const totalCostValue = products.reduce((acc, p) => {
    const pStock = p.sizes.reduce((sum, s) => sum + s.stock, 0);
    return acc + pStock * p.costPrice;
  }, 0);

  const lowStockProducts = products.filter((p) => {
    return p.sizes.some((s) => s.stock <= s.minStock);
  });

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'todos' || p.category === selectedCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      p.barcode.includes(query) ||
      p.material.toLowerCase().includes(query) ||
      p.location.toLowerCase().includes(query);

    const totalStock = p.sizes.reduce((sum, s) => sum + s.stock, 0);
    const matchesStock =
      stockStatusFilter === 'todos'
        ? true
        : stockStatusFilter === 'agotado'
        ? totalStock === 0
        : p.sizes.some((s) => s.stock <= s.minStock && s.stock > 0);

    return matchesCategory && matchesSearch && matchesStock;
  });

  const categories = [
    { id: 'todos', label: 'Todas las Categorías' },
    { id: 'pantalones', label: 'Pantalones' },
    { id: 'camisas', label: 'Camisas' },
    { id: 'botas', label: 'Botas' },
    { id: 'chalecos', label: 'Chalecos' },
    { id: 'chamarras', label: 'Chamarras' },
    { id: 'mochilas', label: 'Mochilas' },
    { id: 'accesorios', label: 'Accesorios' }
  ];

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 pb-24 md:pb-8 space-y-6">
      {/* Top Banner & Fast Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">Total Prendas en Ruta</span>
            <Package className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-100">
            {totalItemsCount} <span className="text-xs font-normal text-slate-400">unidades</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">En vehículo & maletas</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">Valor Inventario (Venta)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-emerald-400">
            ${totalRetailValue.toLocaleString('es-MX')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Precio menudeo público</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">Inversión / Costo</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-slate-200">
            ${totalCostValue.toLocaleString('es-MX')}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">
            Ganancia bruta: ${(totalRetailValue - totalCostValue).toLocaleString('es-MX')}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase">Alertas de Stock</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-mono font-extrabold text-rose-400">
            {lowStockProducts.length} <span className="text-xs font-normal text-slate-400">modelos</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Requieren reabastecimiento</div>
        </div>
      </div>

      {/* Action Bar: Search, Category, Scanner & New Product */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por SKU, nombre, código de barras o material..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={() => setIsScannerOpen(true)}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
            title="Escanear Etiqueta"
          >
            <Scan className="w-5 h-5 text-amber-400" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 transition-colors"
          >
            <History className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Kardex / Movimientos</span>
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              setIsProductModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nueva Prenda Táctica</span>
          </button>
        </div>
      </div>

      {/* Category Pills & Stock Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === c.id
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setStockStatusFilter('todos')}
            className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-colors ${
              stockStatusFilter === 'todos' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setStockStatusFilter('bajo')}
            className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-colors ${
              stockStatusFilter === 'bajo' ? 'bg-amber-500/20 text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            Bajo Stock
          </button>
          <button
            onClick={() => setStockStatusFilter('agotado')}
            className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-colors ${
              stockStatusFilter === 'agotado' ? 'bg-rose-500/20 text-rose-400 font-bold' : 'text-slate-400'
            }`}
          >
            Agotados
          </button>
        </div>
      </div>

      {/* Product List / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredProducts.map((product) => {
          const totalStock = product.sizes.reduce((acc, s) => acc + s.stock, 0);

          return (
            <div
              key={product.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm"
            >
              <div>
                {/* Header info */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex gap-3">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-16 h-16 rounded-xl object-cover bg-slate-950 border border-slate-800 shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-400">
                          {product.sku}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase">
                          {product.categoryLabel}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-100 mt-0.5 leading-snug">
                        {product.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1">
                        📍 {product.location}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingProduct(product);
                        setIsProductModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar ${product.name} del inventario?`)) {
                          onDeleteProduct(product.id);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Price Bar */}
                <div className="grid grid-cols-3 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 mb-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Menudeo:</span>
                    <span className="font-mono font-bold text-amber-400">
                      ${product.priceRetail.toLocaleString('es-MX')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Mayoreo:</span>
                    <span className="font-mono font-bold text-slate-200">
                      ${product.priceWholesale.toLocaleString('es-MX')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Costo:</span>
                    <span className="font-mono text-slate-400">
                      ${product.costPrice.toLocaleString('es-MX')}
                    </span>
                  </div>
                </div>

                {/* Fast Stock Adjuster per Size */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                    <span>Ajuste Rápido de Stock en Terreno:</span>
                    <span className="font-mono text-slate-300">Total: {totalStock} pzas</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {product.sizes.map((s) => {
                      const isLow = s.stock <= s.minStock;
                      return (
                        <div
                          key={s.size}
                          className={`p-2 rounded-lg border flex items-center justify-between ${
                            s.stock === 0
                              ? 'bg-rose-950/20 border-rose-900/40 text-rose-300'
                              : isLow
                              ? 'bg-amber-950/20 border-amber-900/40 text-amber-300'
                              : 'bg-slate-950 border-slate-800/80 text-slate-200'
                          }`}
                        >
                          <div className="overflow-hidden pr-1">
                            <div className="text-xs font-mono font-bold truncate">{s.size}</div>
                            <div className="text-[10px] text-slate-400">{s.stock} pzas</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onAdjustStock(product.id, s.size, -1, 'Venta rápida en ruta')}
                              disabled={s.stock <= 0}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-300 flex items-center justify-center transition-colors"
                            >
                              -
                            </button>
                            <button
                              onClick={() => onAdjustStock(product.id, s.size, 1, 'Reposición de cajuela')}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-400 flex items-center justify-center transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer info: barcode & updated */}
              <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Cod: {product.barcode}</span>
                <span>Colores: {product.colors.join(', ')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="p-12 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
          <Package className="w-10 h-10 mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No se encontraron prendas con este filtro.</p>
          <p className="text-xs text-slate-500 mt-1">
            Intenta cambiar los términos de búsqueda o registra una nueva prenda.
          </p>
        </div>
      )}

      {/* Product Form Modal */}
      {isProductModalOpen && (
        <ProductFormModal
          initialProduct={editingProduct}
          onSave={onSaveProduct}
          onClose={() => {
            setIsProductModalOpen(false);
            setEditingProduct(null);
          }}
        />
      )}

      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <BarcodeScannerModal
          products={products}
          onScanMatch={(p) => {
            setEditingProduct(p);
            setIsProductModalOpen(true);
          }}
          onClose={() => setIsScannerOpen(false)}
        />
      )}

      {/* Kardex Movements Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-800/80 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 uppercase text-sm">
                  Kardex de Movimientos en Terreno
                </h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-2">
              {movements.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No hay movimientos de inventario registrados aún.
                </div>
              ) : (
                movements.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-200">
                        {m.productName} ({m.sku})
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Talla: <span className="text-amber-400">{m.size}</span> · {m.reason}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {new Date(m.date).toLocaleString('es-MX')} · {m.operator}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${
                          m.type === 'venta'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {m.type === 'venta' ? `-${m.quantity}` : `+${m.quantity}`}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
