import React, { useState } from 'react';
import { X, Check, ShoppingBag, ShieldAlert, Tag, Layers } from 'lucide-react';
import { TacticalProduct, CartItem } from '../../types/tactical';

interface ProductSelectModalProps {
  product: TacticalProduct | null;
  onAddToCart: (item: CartItem) => void;
  onClose: () => void;
}

export const ProductSelectModal: React.FC<ProductSelectModalProps> = ({
  product,
  onAddToCart,
  onClose
}) => {
  if (!product) return null;

  // Find first size with stock available
  const initialSizeObj = product.sizes.find((s) => s.stock > 0) || product.sizes[0];
  const [selectedSize, setSelectedSize] = useState<string>(initialSizeObj?.size || '');
  const [selectedColor, setSelectedColor] = useState<string>(product.colors[0] || 'Estándar');
  const [quantity, setQuantity] = useState<number>(1);
  const [useWholesalePrice, setUseWholesalePrice] = useState<boolean>(false);

  const currentSizeObj = product.sizes.find((s) => s.size === selectedSize);
  const currentStock = currentSizeObj ? currentSizeObj.stock : 0;
  const isOutOfStock = currentStock <= 0;

  const currentUnitPrice = useWholesalePrice ? product.priceWholesale : product.priceRetail;

  const handleAdd = () => {
    if (isOutOfStock) return;
    const finalQty = Math.min(quantity, currentStock);

    onAddToCart({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      color: selectedColor,
      size: selectedSize,
      quantity: finalQty,
      unitPrice: currentUnitPrice,
      costPrice: product.costPrice,
      maxStock: currentStock
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/80 border-b border-slate-700">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
              {product.sku} · {product.categoryLabel}
            </span>
            <h3 className="text-base font-bold text-slate-100 leading-tight">
              {product.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Product Image & Fast Info */}
          <div className="flex gap-4 items-center">
            <img
              src={product.image}
              alt={product.name}
              className="w-20 h-20 rounded-xl object-cover bg-slate-950 border border-slate-700 shrink-0"
            />
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-mono font-extrabold text-amber-400">
                  ${currentUnitPrice.toLocaleString('es-MX')}
                </span>
                <span className="text-xs text-slate-400">MXN</span>
                {useWholesalePrice && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
                    PRECIO MAYOREO
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{product.description}</p>
              <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                <span>Ubicación: {product.location}</span>
              </div>
            </div>
          </div>

          {/* Pricing Toggle */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="text-xs">
              <div className="font-semibold text-slate-200">Tarifa de Venta</div>
              <div className="text-slate-500 text-[11px]">
                Menudeo (${product.priceRetail}) vs Mayoreo (${product.priceWholesale})
              </div>
            </div>
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setUseWholesalePrice(false)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  !useWholesalePrice ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Menudeo
              </button>
              <button
                type="button"
                onClick={() => setUseWholesalePrice(true)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  useWholesalePrice ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mayoreo
              </button>
            </div>
          </div>

          {/* Size Selector */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Selecciona Talla / Medida:
              </label>
              <span
                className={`text-xs font-mono font-semibold ${
                  currentStock > 3 ? 'text-emerald-400' : currentStock > 0 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                {currentStock > 0 ? `${currentStock} piezas en stock` : 'Sin existencias en esta talla'}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {product.sizes.map((s) => {
                const isSelected = selectedSize === s.size;
                const hasStock = s.stock > 0;
                return (
                  <button
                    key={s.size}
                    type="button"
                    onClick={() => {
                      setSelectedSize(s.size);
                      if (quantity > s.stock) setQuantity(Math.max(1, s.stock));
                    }}
                    className={`p-2 rounded-xl text-xs font-mono font-bold flex flex-col items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-sm ring-1 ring-amber-500/30'
                        : hasStock
                        ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700'
                        : 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-60'
                    }`}
                  >
                    <span>{s.size}</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      {hasStock ? `${s.stock} disp.` : 'Agotado'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
              Color Táctico:
            </label>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c) => {
                const isSelected = selectedColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                    <span>{c}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity Controls */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block mb-2">
              Cantidad a Vender:
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-4 py-2.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 text-base font-bold transition-colors"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max={currentStock || 1}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setQuantity(Math.min(currentStock || 1, Math.max(1, val)));
                  }}
                  className="w-16 bg-transparent text-center font-mono font-bold text-slate-100 text-sm focus:outline-none"
                />
                <button
                  type="button"
                  disabled={quantity >= currentStock || isOutOfStock}
                  onClick={() => setQuantity((q) => Math.min(currentStock, q + 1))}
                  className="px-4 py-2.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 text-base font-bold transition-colors"
                >
                  +
                </button>
              </div>

              <div className="text-right flex-1">
                <div className="text-xs text-slate-400">Total Prenda:</div>
                <div className="text-lg font-mono font-extrabold text-white">
                  ${(quantity * currentUnitPrice).toLocaleString('es-MX')} MXN
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={handleAdd}
            className="flex-2 flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-md active:scale-98"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{isOutOfStock ? 'Sin Existencias' : 'Agregar al Pedido'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
