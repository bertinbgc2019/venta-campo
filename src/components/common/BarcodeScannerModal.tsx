import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Barcode, Scan, AlertCircle } from 'lucide-react';
import { TacticalProduct } from '../../types/tactical';

interface BarcodeScannerModalProps {
  products: TacticalProduct[];
  onScanMatch: (product: TacticalProduct) => void;
  onClose: () => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  products,
  onScanMatch,
  onClose
}) => {
  const [manualCode, setManualCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [hasCamera, setHasCamera] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Attempt camera access
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setHasCamera(true);
          setIsScanning(true);
        }
      })
      .catch(() => {
        // Fallback gracefully to manual keypad / simulation
        setHasCamera(false);
      });

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleLookup = (code: string) => {
    const clean = code.trim().toLowerCase();
    if (!clean) return;

    const matched = products.find(
      (p) =>
        p.barcode.toLowerCase() === clean ||
        p.sku.toLowerCase() === clean ||
        p.name.toLowerCase().includes(clean)
    );

    if (matched) {
      onScanMatch(matched);
      onClose();
    } else {
      setErrorMsg(`No se encontró prenda con el código "${code}"`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-800/80 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Scan className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-slate-100 uppercase tracking-wide">
              Escanear Etiqueta Táctica
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="p-5 space-y-4">
          <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border-2 border-dashed border-amber-500/40 flex items-center justify-center">
            {hasCamera ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400">
                <Camera className="w-10 h-10 text-slate-600 mb-2" />
                <p className="text-xs">
                  Apunta la cámara a la etiqueta con código de barras o ingresa el código manual abajo.
                </p>
              </div>
            )}

            {/* Tactical Crosshairs & Scan Line Overlay */}
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-amber-500 shadow-[0_0_12px_#f59e0b] animate-pulse pointer-events-none" />
            <div className="absolute inset-4 border border-amber-500/30 pointer-events-none rounded flex items-center justify-between p-2 text-[10px] font-mono text-amber-500/60 uppercase">
              <span>SCAN // TAC-OPTIC</span>
              <span>LOCKED</span>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Manual Entry Keypad / Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Barcode className="w-3.5 h-3.5 text-amber-400" />
              <span>Código de barras o SKU:</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  setErrorMsg('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLookup(manualCode);
                }}
                placeholder="Ej. 750102938401 ó TAC-PNT"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <button
                onClick={() => handleLookup(manualCode)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-lg transition-colors"
              >
                Buscar
              </button>
            </div>
          </div>

          {/* Quick Barcode Tags Chips for testing in field */}
          <div className="pt-2">
            <span className="text-[11px] font-mono text-slate-500 block mb-1.5 uppercase">
              Etiquetas rápidas en inventario:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {products.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleLookup(p.barcode)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-mono text-slate-300 transition-colors"
                >
                  {p.sku} ({p.barcode.slice(-4)})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
