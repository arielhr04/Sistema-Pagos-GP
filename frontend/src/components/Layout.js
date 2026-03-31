import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { 
  LayoutDashboard, 
  FileText, 
  Columns3, 
  Users, 
  History, 
  LogOut, 
  Menu, 
  X,
  Building2,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import NotificationBell from './NotificationBell';
import AppTour from './AppTour';

const Layout = () => {
  const { user, logout } = useAuth();
  const { startTour } = useTour();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['Administrador', 'Tesorero', 'Usuario Área', 'Supervisor'] },
    { to: '/invoices', icon: FileText, label: 'Facturas', roles: ['Administrador', 'Tesorero', 'Usuario Área', 'Supervisor'] },
    // Kanban solo visible en desktop (tablets y pantallas grandes)
    { to: '/kanban', icon: Columns3, label: 'Panel Kanban', roles: ['Administrador', 'Tesorero'], mobileOnly: false, desktopOnly: true },
    { to: '/supervisor-kanban', icon: Columns3, label: 'Panel Empresas', roles: ['Supervisor'], desktopOnly: true },
    { to: '/users', icon: Users, label: 'Usuarios', roles: ['Administrador'] },
    { to: '/areas', icon: Building2, label: 'Empresas', roles: ['Administrador'] },
    { to: '/audit', icon: History, label: 'Auditoría', roles: ['Administrador'] },
  ];

  // Filtrar items: por rol Y excluir Kanban si es móvil
  const filteredNavItems = navItems.filter(item => {
    const hasAccess = item.roles.includes(user?.rol);
    const isVisible = !item.desktopOnly || !isMobile;
    return hasAccess && isVisible;
  });

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 z-50 h-screen w-64 bg-zinc-950 text-white transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo y Título */}
          <div className="flex items-center justify-center px-4 sm:px-4 py-4 sm:py-4 border-b border-zinc-800 flex-shrink-0">
            {/* Mobile: Logo grande centrado sin texto */}
            <div className="lg:hidden flex flex-col items-center w-full">
              <img 
                src="/images/Logo-GGP.png"
                alt="Logo" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/images/logo.png';
                }}
                className="w-20 h-20 object-contain"
              />
            </div>
            
            {/* Desktop: Logo + Título lado a lado */}
            <div className="hidden lg:flex lg:items-center lg:gap-4 lg:w-full">
              <img 
                src="/images/Logo-GGP.png"
                alt="Logo" 
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/images/logo.png';
                }}
                className="w-20 h-20 object-contain flex-shrink-0"
              />
              <div>
                <h1 className="font-bold text-white text-lg leading-tight">Sistema de Administración</h1>
                <p className="text-xs text-zinc-400">de Facturas</p>
              </div>
            </div>
            
            {/* Botón cerrar mobile */}
            <button 
              className="lg:hidden absolute top-6 right-4 text-zinc-400 hover:text-white p-1 flex-shrink-0"
              onClick={() => setSidebarOpen(false)}
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation - scrollable en mobile */}
          <nav className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto" data-tour="sidebar-nav">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-md transition-all duration-200 group min-h-touch ${
                    isActive
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
                <span className="font-medium text-sm sm:text-base truncate">{item.label}</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hidden sm:block" />
              </NavLink>
            ))}
          </nav>

          {/* Tour help button */}
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 flex-shrink-0">
            <button
              onClick={startTour}
              className="flex items-center gap-3 w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all duration-200 group text-sm sm:text-base min-h-touch"
              data-tour="help-btn"
              aria-label="Iniciar recorrido guiado"
            >
              <HelpCircle className="w-5 h-5 flex-shrink-0" strokeWidth={1.5} />
              <span className="font-medium truncate">Recorrido</span>
            </button>
          </div>

          {/* User info - optimizado para mobile */}
          <div className="p-3 sm:p-4 border-t border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-3 p-2 sm:p-3 rounded-md bg-zinc-900 min-h-touch">
              <Avatar className="h-8 w-8 sm:h-10 sm:w-10 bg-red-600 flex-shrink-0">
                <AvatarFallback className="bg-red-600 text-white font-bold text-xs sm:text-sm">
                  {getInitials(user?.nombre)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium truncate">{user?.nombre}</p>
                <p className="text-xs text-zinc-400 truncate">{user?.rol}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header - responsive */}
        <header className="sticky top-0 z-30 bg-white border-b border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between px-3 sm:px-4 md:px-8 h-14 sm:h-16 min-h-touch">
            <button
              className="lg:hidden p-2 rounded-md hover:bg-zinc-100 flex-shrink-0 -ml-2"
              onClick={() => setSidebarOpen(true)}
              data-testid="mobile-menu-btn"
              aria-label="Abrir menú"
            >
              <Menu className="w-6 h-6 text-zinc-700" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-1 sm:gap-2">
              <NotificationBell />

              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-10 px-2 sm:px-4 min-h-touch" data-testid="user-menu-btn">
                  <Avatar className="h-8 w-8 bg-red-600 flex-shrink-0">
                    <AvatarFallback className="bg-red-600 text-white text-xs sm:text-sm font-bold">
                      {getInitials(user?.nombre)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm font-medium max-w-[150px] truncate">{user?.nombre}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-zinc-500 cursor-default text-xs sm:text-sm">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-red-600 focus:text-red-600 cursor-pointer text-xs sm:text-sm"
                  data-testid="logout-btn"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content - responsive padding */}
        <main className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-8xl mx-auto">
          <Outlet />
        </main>
      </div>

      <AppTour />
    </div>
  );
};

export default Layout;
