import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';
import mockDataService from '../services/mockDataService';
import apiClient from '../lib/apiClient';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const TourContext = createContext(null);

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
};

// ─── Tour steps per role ───────────────────────────────────────
// Each step targets a `[data-tour="<target>"]` selector.
// `page` = the route where the element lives (used for guidance).

const STEPS_USUARIO_AREA = [
  {
    target: '[data-tour="sidebar-nav"]',
    content: 'Este es tu menú de navegación. Tienes acceso a Dashboard y Facturas.',
    page: '/dashboard',
    disableBeacon: true,
  },
  {
    target: '[data-tour="invoice-form"]',
    content: 'Aquí registras tus facturas. Todos los campos marcados con * son obligatorios.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="input-folio"]',
    content: 'El folio fiscal debe ser único. Si ya existe, el sistema rechazará la factura.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="upload-pdf"]',
    content: 'Sube el PDF de la factura (obligatorio) y opcionalmente el XML CFDI. Si subes el XML, los datos se llenarán automáticamente.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="btn-registrar"]',
    content: 'Una vez que completes todos los campos y subas el PDF, haz clic aquí para registrar la factura.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="mis-facturas"]',
    content: 'Aquí verás tus facturas recientes y su estatus actual. Haz clic en una para ver detalles.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="notifications"]',
    content: 'La campana te avisa cuando tu factura cambia de estatus (ej: revisada o pagada).',
    page: '/dashboard',
  },
];

const STEPS_TESORERO = [
  {
    target: '[data-tour="sidebar-nav"]',
    content: 'Menú principal. Tienes acceso a Dashboard, Facturas y Panel Kanban.',
    page: '/dashboard',
    disableBeacon: true,
  },
  {
    target: '[data-tour="stats-grid"]',
    content: 'Vista rápida: facturas pendientes, por vencer, vencidas y pagadas.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="monto-total"]',
    content: 'El monto total comprometido. Incluye todas las facturas activas pendientes de pago.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="invoices-search"]',
    content: 'Busca facturas por proveedor, folio fiscal o descripción.',
    page: '/invoices',
  },
  {
    target: '[data-tour="invoices-status-filter"]',
    content: 'Filtra por estatus para ver solo las que te interesan.',
    page: '/invoices',
  },
  {
    target: '[data-tour="invoices-export"]',
    content: 'Exporta la tabla actual a Excel con los filtros aplicados.',
    page: '/invoices',
  },
  {
    target: '[data-tour="kanban-summary"]',
    content: 'Estos chips muestran cuántas facturas hay por columna. Las columnas se cargan automáticamente: puedes arrastrar facturas entre ellas para cambiar su estatus.',
    page: '/kanban',
  },
  {
    target: '[data-tour="notifications"]',
    content: 'La campana muestra cambios recientes de otros usuarios en las facturas.',
    page: '/dashboard',
  },
];

const STEPS_ADMINISTRADOR = [
  {
    target: '[data-tour="sidebar-nav"]',
    content: 'Menú completo: Dashboard, Facturas, Kanban, Usuarios, Áreas y Auditoría.',
    page: '/dashboard',
    disableBeacon: true,
  },
  {
    target: '[data-tour="stats-grid"]',
    content: 'Resumen ejecutivo: pendientes, por vencer, vencidas y pagadas.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="charts"]',
    content: 'Gráficas de tendencia: monto por mes, distribución por estatus y por área.',
    page: '/dashboard',
  },
  {
    target: '[data-tour="invoices-search"]',
    content: 'Busca facturas por proveedor, folio o descripción.',
    page: '/invoices',
  },
  {
    target: '[data-tour="invoices-advanced"]',
    content: 'Filtros avanzados: rango de monto y rango de fecha de vencimiento.',
    page: '/invoices',
  },
  {
    target: '[data-tour="invoices-table"]',
    content: 'Haz clic en una fila para ver detalle completo y cambiar estatus.',
    page: '/invoices',
  },
  {
    target: '[data-tour="kanban-columns"]',
    content: 'Arrastra facturas entre columnas para cambiar estatus. Funciona con mouse y teclado.',
    page: '/kanban',
  },
  {
    target: '[data-tour="btn-new-user"]',
    content: 'Crea usuarios aquí. Asigna rol y área. La contraseña debe tener 8+ caracteres con mayúscula, minúscula y número.',
    page: '/users',
  },
  {
    target: '[data-tour="users-table"]',
    content: 'Activa/desactiva usuarios, edita datos o cambia contraseñas desde los botones de acción.',
    page: '/users',
  },
  {
    target: '[data-tour="btn-new-area"]',
    content: 'Crea áreas organizacionales. Las facturas y usuarios se vinculan a un área.',
    page: '/areas',
  },
  {
    target: '[data-tour="audit-table"]',
    content: 'Registro completo de todos los cambios de estatus. Quién, cuándo y qué cambió.',
    page: '/audit',
  },
  {
    target: '[data-tour="notifications"]',
    content: 'La campana muestra cambios recientes de otros usuarios en las facturas.',
    page: '/dashboard',
  },
];

const ROLE_STEPS = {
  'Usuario Área': STEPS_USUARIO_AREA,
  'Tesorero': STEPS_TESORERO,
  'Administrador': STEPS_ADMINISTRADOR,
};

// ─── Provider ──────────────────────────────────────────────────

export const TourProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [tourActive, setTourActive] = useState(false);
  const [tourKey, setTourKey] = useState(0); // forces Joyride remount
  const [demoMode, setDemoModeState] = useState(false); // Demo mode para datos mock
  const [demoData, setDemoData] = useState(null); // Cache de datos demo

  const steps = ROLE_STEPS[user?.rol] || [];

  const needsTour = user && !user.tour_completed;

  // Sincronizar demo mode con API client
  useEffect(() => {
    apiClient.setDemoMode(demoMode, demoData);
  }, [demoMode, demoData]);

  const startTour = useCallback(async () => {
    setTourKey((k) => k + 1);
    setTourActive(true);

    // Precargar datos mock en paralelo PRIMERO
    try {
      const [invoices, areas, users, stats, auditLogs, loginLogs] = await Promise.all([
        mockDataService.getMockInvoices(),
        mockDataService.getMockAreas(),
        mockDataService.getMockUsers(),
        mockDataService.getMockDashboardStats(),
        mockDataService.getMockAuditLogs(),
        mockDataService.getMockLoginLogs(),
      ]);

      // Establecer datos primero
      setDemoData({
        invoices,
        areas,
        users,
        stats,
        auditLogs,
        loginLogs,
      });

      // LUEGO activar demo mode (así cuando KanbanPage vea demoMode=true, demoData ya está listo)
      setDemoModeState(true);
    } catch (err) {
      console.error('Error preloading demo data:', err);
      setDemoModeState(true); // Activar de todas formas pero sin datos
    }
  }, []);

  const completeTour = useCallback(async () => {
    setTourActive(false);
    setDemoModeState(false);
    setDemoData(null);

    if (!token) return;
    try {
      await axios.post(
        `${API_URL}/api/auth/tour-completed`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Update user object locally so needsTour becomes false
      if (user) user.tour_completed = true;
    } catch (err) {
      console.error('Error marking tour completed:', err);
    }
  }, [token, user]);

  const skipTour = useCallback(() => {
    setTourActive(false);
    setDemoModeState(false);
    setDemoData(null);
  }, []);

  return (
    <TourContext.Provider
      value={{
        tourActive,
        tourKey,
        steps,
        needsTour,
        startTour,
        completeTour,
        skipTour,
        demoMode,
        demoData,
      }}
    >
      {children}
    </TourContext.Provider>
  );
};
