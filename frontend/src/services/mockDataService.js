/**
 * Mock Data Service
 * Carga datos locales cuando el tour está activo para una experiencia fluida sin latencia de API
 */

let mockDataCache = null;

// Cargar todos los mocks en memoria (una sola vez)
async function loadMockData() {
  if (mockDataCache) return mockDataCache;

  try {
    const [invoicesRes, areasRes, usersRes] = await Promise.all([
      fetch('/mockData/invoices.json'),
      fetch('/mockData/areas.json'),
      fetch('/mockData/users.json'),
    ]);

    const invoices = await invoicesRes.json();
    const areas = await areasRes.json();
    const users = await usersRes.json();

    mockDataCache = {
      invoices,
      areas,
      users,
      // Generar logs de auditoría simulados basados en facturas
      auditLogs: generateAuditLogs(invoices.items),
      // Generar logs de login simulados
      loginLogs: generateLoginLogs(),
    };

    return mockDataCache;
  } catch (error) {
    console.error('Error loading mock data:', error);
    throw error;
  }
}

/**
 * Generar logs de auditoría simulados para facturas
 */
function generateAuditLogs(invoices) {
  const logs = [];
  
  invoices.forEach((invoice) => {
    // Crear 2-3 movimientos por factura
    const movements = [
      {
        id: `mov-${invoice.id}-1`,
        factura_id: invoice.id,
        factura_folio: invoice.folio_fiscal,
        usuario_id: invoice.created_by,
        usuario_nombre: invoice.created_by_nombre,
        estatus_anterior: '',
        estatus_nuevo: 'Capturada',
        fecha_cambio: new Date(invoice.created_at).toISOString(),
      },
    ];

    // Agregar movimientos adicionales según el estatus actual
    if (invoice.estatus !== 'Capturada') {
      movements.push({
        id: `mov-${invoice.id}-2`,
        factura_id: invoice.id,
        factura_folio: invoice.folio_fiscal,
        usuario_id: '550e8400-e29b-41d4-a716-446655440206',
        usuario_nombre: 'Laura Gómez',
        estatus_anterior: 'Capturada',
        estatus_nuevo: invoice.estatus === 'En revisión' ? 'En revisión' : invoice.estatus,
        fecha_cambio: new Date(invoice.updated_at).toISOString(),
      });
    }

    if (invoice.estatus === 'Pagada') {
      movements.push({
        id: `mov-${invoice.id}-3`,
        factura_id: invoice.id,
        factura_folio: invoice.folio_fiscal,
        usuario_id: '550e8400-e29b-41d4-a716-446655440205',
        usuario_nombre: 'Roberto Sánchez',
        estatus_anterior: 'Programada',
        estatus_nuevo: 'Pagada',
        fecha_cambio: new Date(invoice.fecha_pago_real || new Date()).toISOString(),
      });
    }

    logs.push(...movements);
  });

  return logs.sort((a, b) => new Date(b.fecha_cambio) - new Date(a.fecha_cambio));
}

/**
 * Generar logs de login simulados
 */
function generateLoginLogs() {
  const users = [
    { id: '550e8400-e29b-41d4-a716-446655440201', nombre: 'Juan García' },
    { id: '550e8400-e29b-41d4-a716-446655440205', nombre: 'Roberto Sánchez' },
    { id: '550e8400-e29b-41d4-a716-446655440206', nombre: 'Laura Gómez' },
  ];

  const events = ['login_exitoso', 'cambio_password'];
  const logs = [];
  let date = new Date();

  for (let i = 0; i < 20; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const event = events[Math.floor(Math.random() * events.length)];
    
    logs.push({
      id: `login-${i}`,
      usuario_id: user.id,
      usuario_nombre: user.nombre,
      evento: event,
      timestamp: date.toISOString(),
      detalles: event === 'login_exitoso' ? 'Acceso permitido' : 'Contraseña actualizada',
    });

    date = new Date(date.getTime() - Math.random() * 86400000); // Restar hasta 24h
  }

  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Obtener facturas mock (simula GET /api/invoices)
 */
export async function getMockInvoices(params = {}) {
  const data = await loadMockData();
  let result = [...data.invoices.items];

  // Aplicar filtros básicos si vienen en params
  if (params.search) {
    const search = params.search.toLowerCase();
    result = result.filter(
      (inv) =>
        inv.nombre_proveedor.toLowerCase().includes(search) ||
        inv.folio_fiscal.toLowerCase().includes(search) ||
        inv.descripcion_factura.toLowerCase().includes(search)
    );
  }

  if (params.estatus) {
    result = result.filter((inv) => inv.estatus === params.estatus);
  }

  if (params.area) {
    result = result.filter((inv) => inv.area_procedencia === params.area);
  }

  // Paginación
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const paginatedResult = result.slice(offset, offset + limit);

  return {
    items: paginatedResult,
    total: result.length,
    page,
    limit,
    total_pages: Math.ceil(result.length / limit),
  };
}

/**
 * Obtener áreas mock (simula GET /api/areas)
 */
export async function getMockAreas() {
  const data = await loadMockData();
  return data.areas;
}

/**
 * Obtener usuarios mock (simula GET /api/users)
 */
export async function getMockUsers(params = {}) {
  const data = await loadMockData();
  let result = [...data.users.items];

  // Filtro por rol si se especifica
  if (params.rol) {
    result = result.filter((user) => user.rol === params.rol);
  }

  // Paginación
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const paginatedResult = result.slice(offset, offset + limit);

  return {
    items: paginatedResult,
    total: result.length,
    page,
    limit,
    total_pages: Math.ceil(result.length / limit),
  };
}

/**
 * Obtener una factura mock por ID
 */
export async function getMockInvoiceById(id) {
  const data = await loadMockData();
  return data.invoices.items.find((inv) => inv.id === id) || null;
}

/**
 * Obtener dashbaord stats mock (simula GET /api/dashboard/stats)
 */
export async function getMockDashboardStats() {
  const data = await loadMockData();
  const invoices = data.invoices.items;

  const pendientes = invoices.filter(
    (inv) => inv.estatus === 'Capturada' || inv.estatus === 'En revisión'
  );
  const pagadas = invoices.filter((inv) => inv.estatus === 'Pagada');
  const vencidas = invoices.filter(
    (inv) =>
      new Date(inv.fecha_vencimiento) < new Date() &&
      inv.estatus !== 'Pagada'
  );

  const totalPendiente = pendientes.reduce((sum, inv) => sum + inv.monto, 0);
  const totalPagado = pagadas.reduce((sum, inv) => sum + inv.monto, 0);
  const totalVencido = vencidas.reduce((sum, inv) => sum + inv.monto, 0);

  return {
    facturas_pendientes: pendientes.length,
    facturas_pagadas: pagadas.length,
    facturas_vencidas: vencidas.length,
    monto_total_pendiente: totalPendiente,
    monto_total_pagado: totalPagado,
    monto_total_vencido: totalVencido,
  };
}

/**
 * Obtener logs de auditoría de facturas
 */
export async function getMockAuditLogs() {
  const data = await loadMockData();
  return data.auditLogs;
}

/**
 * Obtener logs de login
 */
export async function getMockLoginLogs() {
  const data = await loadMockData();
  return data.loginLogs;
}

export default {
  getMockInvoices,
  getMockAreas,
  getMockUsers,
  getMockInvoiceById,
  getMockDashboardStats,
  getMockAuditLogs,
  getMockLoginLogs,
};
