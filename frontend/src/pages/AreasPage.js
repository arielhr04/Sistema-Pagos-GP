import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  Plus, 
  Building2, 
  Trash2,
  Search
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AreasPage = () => {
  const { getAuthHeader } = useAuth();
  const { demoMode, demoData } = useTour();
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
  });

  // Fetch areas con soporte para demo mode
  const fetchAreas = useCallback(async () => {
    // Si estamos en modo tour, usar datos mock
    if (demoMode && demoData?.areas) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setAreas(demoData.areas.items || []);
        setLoading(false);
        return;
      } catch (error) {
        console.error('Error loading demo areas:', error);
        setLoading(false);
        return;
      }
    }

    // Modo normal: usar API
    try {
      const response = await axios.get(`${API_URL}/api/areas`, getAuthHeader());
      setAreas(response.data);
    } catch (error) {
      console.error('Error fetching areas:', error);
      toast.error('Error al cargar áreas');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, demoMode, demoData]);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  const filteredAreas = areas.filter((area) =>
    area.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Bloquear en modo tour
    if (demoMode) {
      toast.error('No puedes crear áreas durante el tour de demostración');
      return;
    }

    setSubmitting(true);

    try {
      await axios.post(`${API_URL}/api/areas`, formData, getAuthHeader());
      toast.success('Área creada exitosamente');
      setDialogOpen(false);
      setFormData({ nombre: '', descripcion: '' });
      fetchAreas();
    } catch (error) {
      console.error('Error creating area:', error);
      toast.error(error.response?.data?.detail || 'Error al crear área');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (areaId) => {
    // Bloquear en modo tour
    if (demoMode) {
      toast.error('No puedes eliminar áreas durante el tour de demostración');
      return;
    }

    if (!window.confirm('¿Está seguro de eliminar esta área?')) return;

    try {
      await axios.delete(`${API_URL}/api/areas/${areaId}`, getAuthHeader());
      toast.success('Área eliminada');
      fetchAreas();
    } catch (error) {
      console.error('Error deleting area:', error);
      toast.error(error.response?.data?.detail || 'Error al eliminar área');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="areas-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
            Áreas
          </h1>
          <p className="text-zinc-500 mt-1">Administración de áreas organizacionales</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide text-sm"
              data-testid="new-area-btn"
              data-tour="btn-new-area"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Área
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold font-[Chivo]">
                Crear Nueva Área
              </DialogTitle>
              <DialogDescription>
                Complete los datos para crear una nueva área organizacional.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del Área *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Finanzas"
                  required
                  data-testid="area-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion">Descripción (opcional)</Label>
                <Textarea
                  id="descripcion"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Descripción del área..."
                  rows={3}
                  data-testid="area-description-input"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={submitting}
                  data-testid="area-submit-btn"
                >
                  {submitting ? 'Creando...' : 'Crear Área'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="bg-white border border-zinc-200">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="area-search-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* Areas Table */}
      <Card className="bg-white border border-zinc-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
            </div>
          ) : filteredAreas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <Building2 className="w-12 h-12 mb-4 text-zinc-300" />
              <p className="font-medium">No se encontraron áreas</p>
              <p className="text-sm">Cree una nueva área para comenzar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50">
                    <TableHead className="font-bold">Nombre</TableHead>
                    <TableHead className="font-bold">Descripción</TableHead>
                    <TableHead className="font-bold text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAreas.map((area) => (
                    <TableRow key={area.id} className="hover:bg-zinc-50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-zinc-400" />
                          {area.nombre}
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-600">
                        {area.descripcion || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(area.id)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`delete-area-${area.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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

export default AreasPage;
