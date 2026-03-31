/**
 * API Client Wrapper with Demo Mode Support
 * When demoMode is active, retorna datos mock sin hacer llamadas a la API
 * Esto mantiene el tour fluido y sin latencia
 */

import axios from 'axios';
import { resolveApiBaseUrl } from './apiBase';

const API_URL = resolveApiBaseUrl();

// Estado global de demo mode (será seteado desde TourContext)
let globalDemoMode = false;
let globalDemoData = null;

export function setDemoMode(active, demoData) {
  globalDemoMode = active;
  globalDemoData = demoData;
}

/**
 * GET /api/invoices - con soporte para demo mode
 */
export async function getInvoices(params = {}, authHeader = {}) {
  if (globalDemoMode && globalDemoData) {
    // Simular latencia mínima (150ms) para que la UX se sienta real
    await new Promise((resolve) => setTimeout(resolve, 150));
    return globalDemoData.invoices;
  }

  try {
    const response = await axios.get(`${API_URL}/api/invoices`, {
      params,
      headers: authHeader,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw error;
  }
}

/**
 * GET /api/invoices/{id} - con soporte para demo mode
 */
export async function getInvoiceById(id, authHeader = {}) {
  if (globalDemoMode && globalDemoData) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const invoice = globalDemoData.invoices.items.find((inv) => inv.id === id);
    return invoice || null;
  }

  try {
    const response = await axios.get(`${API_URL}/api/invoices/${id}`, {
      headers: authHeader,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching invoice:', error);
    throw error;
  }
}

/**
 * GET /api/areas - con soporte para demo mode
 */
export async function getAreas(authHeader = {}) {
  if (globalDemoMode && globalDemoData) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return globalDemoData.areas;
  }

  try {
    const response = await axios.get(`${API_URL}/api/areas`, {
      headers: authHeader,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching areas:', error);
    throw error;
  }
}

/**
 * GET /api/users - con soporte para demo mode
 */
export async function getUsers(params = {}, authHeader = {}) {
  if (globalDemoMode && globalDemoData) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return globalDemoData.users;
  }

  try {
    const response = await axios.get(`${API_URL}/api/users`, {
      params,
      headers: authHeader,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

/**
 * GET /api/dashboard/stats - con soporte para demo mode
 */
export async function getDashboardStats(authHeader = {}) {
  if (globalDemoMode && globalDemoData) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return globalDemoData.stats;
  }

  try {
    const response = await axios.get(`${API_URL}/api/dashboard/stats`, {
      headers: authHeader,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
}

/**
 * POST /api/invoices - no usar mock (no se puede en demo)
 */
export async function createInvoice(formData, authHeader = {}) {
  if (globalDemoMode) {
    throw new Error('No puedes crear datos durante el tour de demostración.');
  }

  try {
    const response = await axios.post(`${API_URL}/api/invoices`, formData, {
      headers: authHeader,
    });
    return response.data;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

/**
 * PUT /api/invoices/{id} - no usar mock (no se puede en demo)
 */
export async function updateInvoice(id, data, authHeader = {}) {
  if (globalDemoMode) {
    throw new Error('No puedes modificar datos durante el tour de demostración.');
  }

  try {
    const response = await axios.put(`${API_URL}/api/invoices/${id}`, data, {
      headers: authHeader,
    });
    return response.data;
  } catch (error) {
    console.error('Error updating invoice:', error);
    throw error;
  }
}

export default {
  setDemoMode,
  getInvoices,
  getInvoiceById,
  getAreas,
  getUsers,
  getDashboardStats,
  createInvoice,
  updateInvoice,
};
