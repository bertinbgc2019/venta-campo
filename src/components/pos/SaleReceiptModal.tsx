import React, { useState } from 'react';
import { X, Printer, Share2, CheckCircle2, Shield, Phone, MapPin, DollarSign, Calendar } from 'lucide-react';
import { TacticalOrder } from '../../types/tactical';

interface SaleReceiptModalProps {
  order: TacticalOrder | null;
  onClose: () => void;
}

export const SaleReceiptModal: React.FC<SaleReceiptModalProps> = ({ order, onClose }) => {
  const [customPhone, setCustomPhone] = useState(order?.customerPhone || '');
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const generateWhatsAppMessage = () => {
    let msg = `*VENTA DE CAMPO - ROPA TÁCTICA* 🛡️\n`;
    msg += `*Nota de Venta:* ${order.folio}\n`;
    msg += `*Fecha:* ${new Date(order.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}\n`;
    msg += `*Cliente:* ${order.customerName}\n`;
    if (order.fieldLocation) {
      msg += `*Punto de Entrega:* ${order.fieldLocation}\n`;
    }
    msg += `--------------------------------\n`;
    msg += `📦 *DETALLE DE EQUIPAMIENTO:*\n`;

    order.items.forEach((item) => {
      msg += `• ${item.quantity}x ${item.name}\n`;
      msg += `  ↳ Talla: *${item.size}* | Color: *${item.color}*\n`;
      msg += `  ↳ $${item.unitPrice.toLocaleString('es-MX')} c/u = *$${(item.quantity * item.unitPrice).toLocaleString('es-MX')}*\n`;
    });

    msg += `--------------------------------\n`;
    if (order.discount > 0) {
      msg += `Subtotal: $${order.subtotal.toLocaleString('es-MX')}\n`;
      msg += `Descuento aplicado: -$${order.discount.toLocaleString('es-MX')}\n`;
    }
    msg += `*TOTAL A PAGAR: $${order.total.toLocaleString('es-MX')} MXN*\n`;
    msg += `*Método de Pago:* ${order.paymentMethod.toUpperCase()}\n`;
    msg += `*Monto Cubierto:* $${order.amountPaid.toLocaleString('es-MX')}\n`;

    if (order.amountPending > 0) {
      msg += `*⚠️ SALDO PENDIENTE:* $${order.amountPending.toLocaleString('es-MX')}\n`;
    } else {
      msg += `*ESTADO:* ✅ LIQUIDADO COMPLETO\n`;
    }

    if (order.notes) {
      msg += `*Notas:* ${order.notes}\n`;
    }

    msg += `--------------------------------\n`;
    msg += `_Equipamiento táctico de alta resistencia y grado operativo._\n`;
    msg += `¡Gracias por su compra en ruta! 🎖️`;

    return encodeURIComponent(msg);
  };

  const handleSendWhatsApp = (phoneToSend?: string) => {
    const targetPhone = phoneToSend || order.customerPhone || customPhone;
    if (!targetPhone) {
      setShowPhonePrompt(true);
      return;
    }

    // Limpiar caracteres no numéricos
    const cleanNumber = targetPhone.replace(/\D/g, '');
    const encoded = generateWhatsAppMessage();
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encoded}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-800/80 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-slate-100 uppercase tracking-wide">
              Nota de Venta Generada
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Ticket Content Container */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          <div
            id="tactical-print-ticket"
            className="bg-slate-950 text-slate-200 p-5 rounded-xl border border-slate-800 font-mono text-xs sm:text-sm shadow-inner"
          >
            {/* Ticket Header */}
            <div className="text-center pb-4 border-b border-dashed border-slate-700">
              <div className="flex items-center justify-center gap-1.5 text-amber-400 font-extrabold text-base tracking-wider uppercase mb-1">
                <Shield className="w-4 h-4 inline" /> VENTA DE CAMPO
              </div>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest">
                Equipamiento & Ropa Táctica
              </p>
              <div className="mt-2 text-xs font-bold text-slate-100 bg-slate-900 py-1 px-2 rounded inline-block border border-slate-800">
                FOLIO: {order.folio}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {new Date(order.date).toLocaleString('es-MX', {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </p>
            </div>

            {/* Client & Field Location */}
            <div className="py-3 border-b border-dashed border-slate-700 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-bold text-slate-100 text-right">{order.customerName}</span>
              </div>
              {order.customerBadge && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Sector:</span>
                  <span className="text-amber-400 font-semibold">{order.customerBadge}</span>
                </div>
              )}
              {order.customerPhone && (
                <div className="flex justify-between">
                  <span className="text-slate-400">WhatsApp:</span>
                  <span className="text-slate-200">{order.customerPhone}</span>
                </div>
              )}
              {order.fieldLocation && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Ubicación Ruta:</span>
                  <span className="text-slate-200">{order.fieldLocation}</span>
                </div>
              )}
            </div>

            {/* Items Breakdown */}
            <div className="py-3 border-b border-dashed border-slate-700">
              <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">Prendas / Equipo:</div>
              <div className="space-y-2">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs">
                    <div className="pr-2">
                      <div className="font-semibold text-slate-100">
                        {item.quantity}x {item.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Talla: <span className="text-amber-400 font-medium">{item.size}</span> | Color: {item.color}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap font-bold text-slate-100">
                      ${(item.quantity * item.unitPrice).toLocaleString('es-MX')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Totals */}
            <div className="py-3 border-b border-dashed border-slate-700 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span>${order.subtotal.toLocaleString('es-MX')}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Descuento aplicado:</span>
                  <span>-${order.discount.toLocaleString('es-MX')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm sm:text-base font-extrabold text-white pt-1">
                <span>TOTAL:</span>
                <span className="text-amber-400">${order.total.toLocaleString('es-MX')} MXN</span>
              </div>
            </div>

            {/* Payment Status */}
            <div className="pt-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Método de pago:</span>
                <span className="font-bold text-slate-100 uppercase">{order.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Monto cubierto:</span>
                <span className="font-bold text-emerald-400">${order.amountPaid.toLocaleString('es-MX')}</span>
              </div>
              {order.amountPending > 0 ? (
                <div className="flex justify-between font-bold text-rose-400 pt-1">
                  <span>Saldo por liquidar:</span>
                  <span>${order.amountPending.toLocaleString('es-MX')}</span>
                </div>
              ) : (
                <div className="text-center font-bold text-emerald-400 pt-1 text-[11px]">
                  ✓ CUENTA TOTALMENTE LIQUIDADA
                </div>
              )}
            </div>

            {/* Ticket Footer */}
            <div className="mt-4 pt-3 text-center text-[10px] text-slate-500 border-t border-slate-800">
              Garantía por defecto de fábrica. Conserve este comprobante digital o físico.
            </div>
          </div>

          {/* Quick Phone Prompt if customer phone was empty */}
          {showPhonePrompt && (
            <div className="mt-3 p-3 bg-slate-800/80 rounded-lg border border-amber-500/30 flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-400 shrink-0" />
              <input
                type="tel"
                placeholder="Ingresa número WhatsApp (10 dígitos)"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs px-2.5 py-1.5 rounded text-white flex-1 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => handleSendWhatsApp(customPhone)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors"
              >
                Enviar
              </button>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button
            onClick={() => handleSendWhatsApp()}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-colors shadow-lg active:scale-98"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir por WhatsApp</span>
          </button>

          <button
            onClick={handlePrint}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-sm border border-slate-700 transition-colors active:scale-98"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Ticket</span>
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-colors active:scale-98"
          >
            Nueva Venta
          </button>
        </div>
      </div>
    </div>
  );
};
