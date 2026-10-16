import React from 'react';
import { ShoppingCart, Package, ClipboardList, Users, BarChart3, Settings } from 'lucide-react';

export type ActiveTab = 'pos' | 'inventory' | 'orders' | 'customers' | 'reports' | 'settings';

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  pendingOrdersCount?: number;
  lowStockCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  pendingOrdersCount = 0,
  lowStockCount = 0
}) => {
  const tabs = [
    {
      id: 'pos' as ActiveTab,
      label: 'Venta Rápida',
      icon: ShoppingCart,
      badge: null
    },
    {
      id: 'inventory' as ActiveTab,
      label: 'Inventario',
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : null,
      badgeColor: 'bg-rose-500 text-white'
    },
    {
      id: 'orders' as ActiveTab,
      label: 'Pedidos & Notas',
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : null,
      badgeColor: 'bg-amber-500 text-slate-950'
    },
    {
      id: 'customers' as ActiveTab,
      label: 'Clientes',
      icon: Users,
      badge: null
    },
    {
      id: 'reports' as ActiveTab,
      label: 'Cierre de Ruta',
      icon: BarChart3,
      badge: null
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Ajustes & Sync',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <>
      {/* Desktop / Tablet Sub-Navbar */}
      <nav className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto py-2 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== null && (
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-slate-950 text-amber-400' : tab.badgeColor
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/98 border-t border-slate-800 backdrop-blur-md px-2 py-1.5 flex justify-around items-center">
        {tabs.slice(0, 5).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-md transition-colors relative min-w-[58px] ${
                isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {tab.badge !== null && (
                  <span
                    className={`absolute -top-1 -right-2 text-[9px] font-mono font-bold px-1 rounded-full ${tab.badgeColor}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight mt-0.5">
                {tab.id === 'pos' ? 'Venta' : tab.id === 'orders' ? 'Notas' : tab.id === 'reports' ? 'Cierre' : tab.label}
              </span>
            </button>
          );
        })}
        {/* Settings button on mobile */}
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-md transition-colors ${
            activeTab === 'settings' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-0.5">Sync</span>
        </button>
      </div>
    </>
  );
};
