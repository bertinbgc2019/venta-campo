import React, { useState } from 'react';
import { X, Plus, Trash2, Shield, Layers, DollarSign, Image } from 'lucide-react';
import { TacticalProduct, TacticalCategory, ProductSize } from '../../types/tactical';

interface ProductFormModalProps {
  initialProduct?: TacticalProduct | null;
  onSave: (product: TacticalProduct) => void;
  onClose: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  initialProduct,
  onSave,
  onClose
}) => {
  const isEditing = Boolean(initialProduct);

  const [sku, setSku] = useState(initialProduct?.sku || `TAC-${Math.floor(100 + Math.random() * 900)}`);
  const [name, setName] = useState(initialProduct?.name || '');
  const [category, setCategory] = useState<TacticalCategory>(initialProduct?.category || 'pantalones');
  const [priceRetail, setPriceRetail] = useState<number>(initialProduct?.priceRetail || 1200);
  const [priceWholesale, setPriceWholesale] = useState<number>(initialProduct?.priceWholesale || 950);
  const [costPrice, setCostPrice] = useState<number>(initialProduct?.costPrice || 600);
  const [location, setLocation] = useState(initialProduct?.location || 'Cajuela Camioneta 01');
  const [image, setImage] = useState(
    initialProduct?.image || 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=600&q=80'
  );
  const [description, setDescription] = useState(initialProduct?.description || '');
  const [material, setMaterial] = useState(initialProduct?.material || 'Ripstop 65/35 Poliéster Algodón');
  const [barcode, setBarcode] = useState(
    initialProduct?.barcode || `${750100000000 + Math.floor(Math.random() * 999999)}`
  );

  const [colors, setColors] = useState<string[]>(
    initialProduct?.colors || ['Negro Táctico', 'Coyote Brown', 'Verde OD']
  );
  const [newColorInput, setNewColorInput] = useState('');

  const defaultSizes: ProductSize[] = [
    { size: 'S / 30', stock: 5, minStock: 2 },
    { size: 'M / 32', stock: 10, minStock: 3 },
    { size: 'L / 34', stock: 10, minStock: 3 },
    { size: 'XL / 36', stock: 6, minStock: 2 }
  ];

  const [sizes, setSizes] = useState<ProductSize[]>(
    initialProduct?.sizes && initialProduct.sizes.length > 0 ? initialProduct.sizes : defaultSizes
  );
  const [newSizeName, setNewSizeName] = useState('');
  const [newSizeStock, setNewSizeStock] = useState<number>(5);

  const handleAddColor = () => {
    if (!newColorInput.trim()) return;
    if (!colors.includes(newColorInput.trim())) {
      setColors([...colors, newColorInput.trim()]);
    }
    setNewColorInput('');
  };

  const handleRemoveColor = (col: string) => {
    setColors(colors.filter((c) => c !== col));
  };

  const handleAddSize = () => {
    if (!newSizeName.trim()) return;
    setSizes([
      ...sizes,
      {
        size: newSizeName.trim(),
        stock: Number(newSizeStock) || 0,
        minStock: 2
      }
    ]);
    setNewSizeName('');
    setNewSizeStock(5);
  };

  const handleUpdateSizeStock = (index: number, stock: number) => {
    const copy = [...sizes];
    copy[index].stock = Math.max(0, stock);
    setSizes(copy);
  };

  const handleRemoveSize = (index: number) => {
    setSizes(sizes.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;

    const categoryLabels: Record<TacticalCategory, string> = {
      pantalones: 'Pantalones Tácticos',
      camisas: 'Camisas de Combate',
      botas: 'Calzado & Botas',
      chalecos: 'Chalecos & Portaplacas',
      chamarras: 'Chamarras & Abrigo',
      mochilas: 'Mochilas & Bolsos',
      accesorios: 'Accesorios & Equipo'
    };

    const finalProduct: TacticalProduct = {
      id: initialProduct?.id || `prod-${Date.now()}`,
      sku: sku.trim().toUpperCase(),
      name: name.trim(),
      category,
      categoryLabel: categoryLabels[category],
      colors: colors.length > 0 ? colors : ['Estándar'],
      sizes: sizes.length > 0 ? sizes : [{ size: 'Única', stock: 10, minStock: 2 }],
      priceRetail: Number(priceRetail) || 0,
      priceWholesale: Number(priceWholesale) || 0,
      costPrice: Number(costPrice) || 0,
      location: location.trim() || 'Cajuela Camioneta',
      image: image.trim(),
      description: description.trim(),
      material: material.trim(),
      barcode: barcode.trim(),
      updatedAt: new Date().toISOString()
    };

    onSave(finalProduct);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-800/80 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100 uppercase tracking-wide">
              {isEditing ? 'Editar Prenda Táctica' : 'Registrar Nueva Prenda Táctica'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 max-h-[75vh] overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Nombre de la Prenda *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Pantalón Táctico Stryke Ripstop"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Código SKU Táctico *
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ej. TAC-PNT-STRYKE"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono uppercase text-amber-400 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TacticalCategory)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="pantalones">Pantalones Tácticos</option>
                <option value="camisas">Camisas de Combate</option>
                <option value="botas">Calzado & Botas</option>
                <option value="chalecos">Chalecos & Portaplacas</option>
                <option value="chamarras">Chamarras & Abrigo</option>
                <option value="mochilas">Mochilas & Bolsos</option>
                <option value="accesorios">Accesorios & Equipo</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Ubicación en Vehículo / Ruta
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej. Cajuela Camioneta (Caja 1)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Código de Barras / Etiqueta
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Ej. 750102938401"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
              Estructura de Precios (MXN)
            </span>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Precio Menudeo</label>
                <input
                  type="number"
                  required
                  value={priceRetail}
                  onChange={(e) => setPriceRetail(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Precio Mayoreo (3+)</label>
                <input
                  type="number"
                  required
                  value={priceWholesale}
                  onChange={(e) => setPriceWholesale(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-amber-400"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Costo Adquisición</label>
                <input
                  type="number"
                  required
                  value={costPrice}
                  onChange={(e) => setCostPrice(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-400"
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-500 flex justify-between pt-1">
              <span>Margen estimado: ${priceRetail - costPrice} por pieza (menudeo)</span>
              <span>Ganancia: {Math.round(((priceRetail - costPrice) / (priceRetail || 1)) * 100)}%</span>
            </div>
          </div>

          {/* Sizes & Stock breakdown */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Tallas & Existencias en Stock
              </span>
              <span className="text-xs font-mono text-amber-400">
                Total: {sizes.reduce((acc, s) => acc + s.stock, 0)} piezas
              </span>
            </div>

            <div className="space-y-2">
              {sizes.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="w-24 text-xs font-mono font-bold text-slate-200">{s.size}</span>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-[11px] text-slate-400">Stock:</span>
                    <input
                      type="number"
                      min="0"
                      value={s.stock}
                      onChange={(e) => handleUpdateSizeStock(idx, parseInt(e.target.value) || 0)}
                      className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-right text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSize(idx)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new size input */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Nueva talla (ej. 34, 28 MEX, XL)"
                value={newSizeName}
                onChange={(e) => setNewSizeName(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="number"
                min="0"
                placeholder="Stock"
                value={newSizeStock}
                onChange={(e) => setNewSizeStock(parseInt(e.target.value) || 0)}
                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-right"
              />
              <button
                type="button"
                onClick={handleAddSize}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg transition-colors"
              >
                + Talla
              </button>
            </div>
          </div>

          {/* Colors */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
              Colores Disponibles
            </span>
            <div className="flex flex-wrap gap-1.5">
              {colors.map((c) => (
                <div
                  key={c}
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                >
                  <span>{c}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveColor(c)}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Ej. Multicam Black, Coyote Tan"
                value={newColorInput}
                onChange={(e) => setNewColorInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={handleAddColor}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-lg"
              >
                + Color
              </button>
            </div>
          </div>

          {/* Technical Specs & Image URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Material & Composición
              </label>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="Ej. Ripstop 65/35 con teflón hidrófugo"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                URL Imagen de la Prenda
              </label>
              <input
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Descripción Táctica / Características
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles de bolsillos, refuerzo en rodillas, tipo de cremallera..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>

          {/* Submit Actions */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-md"
            >
              {isEditing ? 'Guardar Cambios' : 'Registrar Prenda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
