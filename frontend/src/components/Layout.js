import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import NotificationBell from './NotificationBell';
import AppTour from './AppTour';

const Layout = () => {
  const { user, logout } = useAuth();
  const { needsTour, startTour } = useTour();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Show welcome dialog on first visit
  useEffect(() => {
    if (needsTour) {
      const timer = setTimeout(() => setWelcomeOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [needsTour]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['Administrador', 'Tesorero', 'Usuario Área'] },
    { to: '/invoices', icon: FileText, label: 'Facturas', roles: ['Administrador', 'Tesorero', 'Usuario Área'] },
    { to: '/kanban', icon: Columns3, label: 'Panel Kanban', roles: ['Administrador', 'Tesorero'] },
    { to: '/users', icon: Users, label: 'Usuarios', roles: ['Administrador'] },
    { to: '/areas', icon: Building2, label: 'Áreas', roles: ['Administrador'] },
    { to: '/audit', icon: History, label: 'Auditoría', roles: ['Administrador'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user?.rol));

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
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <img 
                src="/images/logo.png" 
                alt="Logo" 
                className="mx-auto w-30 h-30 object-contain"
              />
            </div>
            <button 
              className="lg:hidden text-zinc-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto" data-tour="sidebar-nav">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 group ${
                    isActive
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5" strokeWidth={1.5} />
                <span className="font-medium">{item.label}</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </NavLink>
            ))}
          </nav>

          {/* Tour help button */}
          <div className="px-4 pb-2">
            <button
              onClick={startTour}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all duration-200 group"
              data-tour="help-btn"
            >
              <HelpCircle className="w-5 h-5" strokeWidth={1.5} />
              <span className="font-medium">Recorrido guiado</span>
            </button>
          </div>

          {/* User info */}
          <div className="p-4 border-t border-zinc-800">
            <div className="flex items-center gap-3 p-3 rounded-md bg-zinc-900">
              <Avatar className="h-10 w-10 bg-red-600">
                <AvatarFallback className="bg-red-600 text-white font-bold">
                  {getInitials(user?.nombre)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.nombre}</p>
                <p className="text-xs text-zinc-400">{user?.rol}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between px-4 md:px-8 h-16">
            <button
              className="lg:hidden p-2 rounded-md hover:bg-zinc-100"
              onClick={() => setSidebarOpen(true)}
              data-testid="mobile-menu-btn"
            >
              <Menu className="w-6 h-6 text-zinc-700" />
            </button>

            <div className="flex-1 lg:flex-none" />

            <div className="flex items-center gap-2">
              <NotificationBell />

              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2" data-testid="user-menu-btn">
                  <Avatar className="h-8 w-8 bg-red-600">
                    <AvatarFallback className="bg-red-600 text-white text-sm font-bold">
                      {getInitials(user?.nombre)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm font-medium">{user?.nombre}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="text-zinc-500 cursor-default">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-red-600 focus:text-red-600 cursor-pointer"
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

        {/* Page content */}
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      {/* Welcome dialog — first visit */}
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-[Chivo]">
              ¡Bienvenido al Sistema de Gestión de Facturas!
            </DialogTitle>
            <DialogDescription>
              Te daremos un recorrido rápido para que conozcas las funciones principales del sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
              onClick={() => {
                setWelcomeOpen(false);
                setTimeout(() => startTour(), 300);
              }}
            >
              Iniciar Recorrido (~2 min)
            </Button>
            <Button
              variant="outline"
              onClick={() => setWelcomeOpen(false)}
            >
              Omitir por ahora
            </Button>
            <p className="text-xs text-zinc-400 text-center">
              Puedes iniciar el recorrido en cualquier momento desde el botón <strong>?</strong> en la barra superior.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AppTour />
    </div>
  );
};

export default Layout;
