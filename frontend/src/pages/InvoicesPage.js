import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { 
  Search, 
  FileText, 
  Filter,
  X,
  History
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_STYLES = {
  'Capturada': 'bg-zinc-100 text-zinc-700 border-zinc-200',
  'En revisión': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Programada': 'bg-blue-100 text-blue-700 border-blue-200',
  'Pagada': 'bg-green-100 text-green-700 border-green-200',
  'Rechazada': 'bg-red-100 text-red-700 border-red-200',
};

const InvoicesPage = () => {
  const { getAuthHeader } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('estatus', statusFilter);
      if (areaFilter) params.append('area', areaFilter);
      
      const response = await axios.get(
        `${API_URL}/api/invoices?${params.toString()}`,
        getAuthHeader()
      );
      setInvoices(response.data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, areaFilter, getAuthHeader]);

  const fetchAreas = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/areas`, getAuthHeader());
      setAreas(response.data);
    } catch (error) {
      console.error('Error fetching areas:', error);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchInvoices();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchInvoices]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setAreaFilter('');
  };

  const formatDate = (dateString) => {
    return dateString ? dateString.slice(0, 10) : '-';
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="invoices-page">
      <div>
        <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
          Histórico de Facturas
        </h1>
        <p className="text-zinc-500 mt-1">Consulta el registro de todas las facturas del sistema</p>
      </div>

      {/* Filters */}
      <Card className="bg-white border border-zinc-200">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="Buscar por proveedor, folio o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="invoice-search-input"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48" data-testid="status-filter-select">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Estatus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Capturada">Capturada</SelectItem>
                <SelectItem value="En revisión">En revisión</SelectItem>
                <SelectItem value="Programada">Programada</SelectItem>
                <SelectItem value="Pagada">Pagada</SelectItem>
                <SelectItem value="Rechazada">Rechazada</SelectItem>
              </SelectContent>
            </Select>

            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-full md:w-48" data-testid="area-filter-select">
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchTerm || statusFilter || areaFilter) && (
              <Button variant="ghost" onClick={clearFilters} className="px-3">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card className="bg-white border border-zinc-200">
        <CardHeader className="border-b border-zinc-100 bg-zinc-50/50">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-red-600" />
            Registro de Facturas
            <Badge variant="secondary" className="ml-2 font-mono">
              {invoices.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <FileText className="w-12 h-12 mb-4 text-zinc-300" />
              <p className="font-medium">No se encontraron facturas</p>
              <p className="text-sm">No hay registros con los filtros aplicados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50">
                    <TableHead className="font-bold w-20">ID</TableHead>
                    <TableHead className="font-bold">Folio Fiscal</TableHead>
                    <TableHead className="font-bold">Proveedor</TableHead>
                    <TableHead className="font-bold">Fecha Vencimiento</TableHead>
                    <TableHead className="font-bold">Fecha Registro</TableHead>
                    <TableHead className="font-bold text-center">Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice, index) => (
                    <TableRow key={invoice.id} className="hover:bg-zinc-50">
                      <TableCell className="font-mono text-sm text-zinc-500">
                        #{index + 1}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        {invoice.folio_fiscal}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900">
                        {invoice.nombre_proveedor}
                      </TableCell>
                      <TableCell className="text-zinc-600">
                        {formatDate(invoice.fecha_vencimiento)}
                      </TableCell>
                      <TableCell className="text-zinc-600">
                        {formatDate(invoice.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline"
                          className={STATUS_STYLES[invoice.estatus]}
                        >
                          {invoice.estatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InvoicesPage;
