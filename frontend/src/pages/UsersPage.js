import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import LoadingState from '../components/LoadingState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
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
import { Switch } from '../components/ui/switch';
import { 
  Plus, 
  Search, 
  Users, 
  Pencil, 
  Trash2,
  UserCheck,
  UserX,
  Download,
  KeyRound,
  Sparkles,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ROLE_STYLES = {
  'Administrador': 'bg-red-100 text-red-700 border-red-200',
  'Tesorero': 'bg-blue-100 text-blue-700 border-blue-200',
  'Usuario Área': 'bg-zinc-100 text-zinc-700 border-zinc-200',
  'Supervisor': 'bg-purple-100 text-purple-700 border-purple-200',
};

const UsersPage = () => {
  const { getAuthHeader, token } = useAuth();
  const { demoMode, demoData } = useTour();
  const [users, setUsers] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingSupervisor, setSavingSupervisor] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [initialEmpresasSupervisadas, setInitialEmpresasSupervisadas] = useState([]); // Estado inicial para detectar cambios

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nombre: '',
    rol: 'Usuario Área',
    empresa_id: '',
    empresas_supervisadas: [], // Nueva: lista de empresas que supervisa
  });

  const fetchUsers = useCallback(async () => {
    // Si estamos en modo tour, usar datos mock
    if (demoMode && demoData?.users) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const usersData = demoData.users.items || [];
        setUsers(usersData);
        setLoading(false);
        return;
      } catch (error) {
        console.error('Error loading demo users:', error);
        setLoading(false);
        return;
      }
    }

    // Modo normal: usar API
    try {
      const response = await axios.get(`${API_URL}/api/users`, getAuthHeader());
      const usersData = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.items)
          ? response.data.items
          : [];
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error(error.response?.data?.detail || 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader, demoMode, demoData]);

  const fetchAreas = useCallback(async () => {
    // Si estamos en modo tour, usar datos mock
    if (demoMode && demoData?.areas) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setAreas(demoData.areas.items || []);
        return;
      } catch (error) {
        console.error('Error loading demo areas:', error);
        return;
      }
    }

    // Modo normal: usar API
    try {
      const response = await axios.get(`${API_URL}/api/areas`, getAuthHeader());
      setAreas(response.data);
    } catch (error) {
      console.error('Error fetching areas:', error);
    }
  }, [getAuthHeader, demoMode, demoData]);

  useEffect(() => {
    fetchUsers();
    fetchAreas();
  }, [fetchUsers, fetchAreas]);

  const filteredUsers = users.filter(
    (user) =>
      user.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Detectar si hay cambios en las empresas supervisadas
  const hasSupervisorChanges = editingUser && 
    formData.rol === 'Supervisor' && 
    JSON.stringify(formData.empresas_supervisadas.sort()) !== JSON.stringify(initialEmpresasSupervisadas.sort());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingUser) {
        const updateData = {
          nombre: formData.nombre,
          rol: formData.rol,
          empresa_id: formData.empresa_id || null,
        };
        console.log('🔵 [UPDATE USER] Sending data:', updateData, 'User ID:', editingUser.id);
        
        const updateResponse = await axios.put(`${API_URL}/api/users/${editingUser.id}`, updateData, getAuthHeader());
        console.log('✅ [UPDATE USER] Response:', updateResponse.data);
        
        // Si es supervisor, también guardar empresas supervisadas si cambiaron
        if (formData.rol === 'Supervisor' && hasSupervisorChanges) {
          console.log('🔵 [SUPERVISOR EMPRESAS] Saving supervisadas:', formData.empresas_supervisadas);
          await axios.post(
            `${API_URL}/api/users/${editingUser.id}/empresas-supervisadas`,
            { empresa_ids: formData.empresas_supervisadas },
            getAuthHeader()
          );
          console.log('✅ [SUPERVISOR EMPRESAS] Saved successfully');
        }
        
        toast.success('Usuario actualizado');
      } else {
        console.log('🔵 [CREATE USER] Sending new user data');
        const response = await axios.post(`${API_URL}/api/users`, formData, getAuthHeader());
        console.log('✅ [CREATE USER] Created with ID:', response.data.id);
        
        // Si es supervisor, asignar empresas supervisadas
        if (formData.rol === 'Supervisor' && formData.empresas_supervisadas.length > 0) {
          const newUserId = response.data.id;
          console.log('🔵 [NEW SUPERVISOR] Assigning empresas:', formData.empresas_supervisadas);
          await axios.post(
            `${API_URL}/api/users/${newUserId}/empresas-supervisadas`,
            { empresa_ids: formData.empresas_supervisadas },
            getAuthHeader()
          );
          console.log('✅ [NEW SUPERVISOR] Empresas assigned');
        }
        
        toast.success('Usuario creado');
      }
      setDialogOpen(false);
      resetForm();
      setInitialEmpresasSupervisadas([]);
      fetchUsers();
    } catch (error) {
      console.error('❌ [SUBMIT ERROR]', error.response?.data || error.message);
      toast.error(error.response?.data?.detail || 'Error al guardar usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (user) => {
    setEditingUser(user);
    const supervisadasIds = [];
    
    // Si es supervisor, cargar sus empresas supervisadas
    if (user.rol === 'Supervisor') {
      try {
        const response = await axios.get(
          `${API_URL}/api/users/${user.id}/empresas-supervisadas`,
          getAuthHeader()
        );
        supervisadasIds.push(...(response.data.empresa_ids || []));
      } catch (error) {
        console.error('Error fetching supervisor empresas:', error);
      }
    }
    
    // Guardar estado inicial para detectar cambios
    setInitialEmpresasSupervisadas(supervisadasIds);
    
    setFormData({
      email: user.email,
      password: '',
      nombre: user.nombre,
      rol: user.rol,
      empresa_id: user.empresa_id || '',
      empresas_supervisadas: supervisadasIds,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('¿Está seguro de eliminar este usuario?')) return;

    try {
      await axios.delete(`${API_URL}/api/users/${userId}`, getAuthHeader());
      toast.success('Usuario eliminado');
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(error.response?.data?.detail || 'Error al eliminar usuario');
    }
  };

  const handleSaveSupervisorAssignments = async () => {
    if (!editingUser || !hasSupervisorChanges) return;
    
    setSavingSupervisor(true);
    try {
      await axios.post(
        `${API_URL}/api/users/${editingUser.id}/empresas-supervisadas`,
        { empresa_ids: formData.empresas_supervisadas },
        getAuthHeader()
      );
      toast.success('Asignaciones de empresas guardadas');
      // Actualizar estado inicial para limpiar el botón de cambios pendientes
      setInitialEmpresasSupervisadas(formData.empresas_supervisadas);
      fetchUsers();
    } catch (error) {
      console.error('Error saving supervisor assignments:', error);
      toast.error(error.response?.data?.detail || 'Error al guardar asignaciones');
    } finally {
      setSavingSupervisor(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await axios.put(
        `${API_URL}/api/users/${user.id}`,
        { activo: !user.activo },
        getAuthHeader()
      );
      toast.success(user.activo ? 'Usuario desactivado' : 'Usuario activado');
      fetchUsers();
    } catch (error) {
      console.error('Error toggling user status:', error);
      toast.error('Error al cambiar estado del usuario');
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API_URL}/api/users/export/excel`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facturas_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Archivo exportado');
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const resetForm = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      nombre: '',
      rol: 'Usuario Área',
      empresa_id: '',
      empresas_supervisadas: [],
    });
  };

  const generatePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = upper + lower + digits + '!@#$%&*';
    // Garantizar al menos 1 de cada tipo requerido
    let pwd = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      digits[Math.floor(Math.random() * digits.length)],
      '!@#$%&*'[Math.floor(Math.random() * 7)],
    ];
    for (let i = 4; i < 12; i++) {
      pwd.push(all[Math.floor(Math.random() * all.length)]);
    }
    // Mezclar
    for (let i = pwd.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }
    const generated = pwd.join('');
    setNewPassword(generated);
    setShowPassword(true);
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(newPassword);
    toast.success('Contraseña copiada al portapapeles');
  };

  const openPasswordDialog = (user) => {
    setPasswordUser(user);
    setNewPassword('');
    setShowPassword(false);
    setPasswordDialogOpen(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordUser) return;
    setChangingPassword(true);
    try {
      await axios.put(
        `${API_URL}/api/users/${passwordUser.id}/password`,
        { new_password: newPassword },
        getAuthHeader()
      );
      toast.success(`Contraseña de ${passwordUser.nombre} actualizada`);
      setPasswordDialogOpen(false);
      setPasswordUser(null);
      setNewPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      const detail = error.response?.data?.detail;
      // Pydantic validation errors come as array
      if (Array.isArray(detail)) {
        toast.error(detail.map((d) => d.msg).join(', '));
      } else {
        toast.error(detail || 'Error al cambiar contraseña');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="users-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-[Chivo] tracking-tight text-zinc-900">
            Usuarios
          </h1>
          <p className="text-zinc-500 mt-1">Administración de usuarios y roles</p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={exporting}
            data-testid="export-excel-btn"
          >
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide text-sm"
                onClick={openCreateDialog}
                data-testid="new-user-btn"
                data-tour="btn-new-user"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Usuario
              </Button>
            </DialogTrigger>
            <DialogContent className={`${formData.rol === 'Supervisor' && editingUser ? "max-w-4xl" : "max-w-md"} max-h-[85vh] flex flex-col`}>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold font-[Chivo]">
                  {editingUser ? 'Editar Usuario' : 'Crear Usuario'}
                </DialogTitle>
                <DialogDescription>
                  {editingUser
                    ? 'Modifique los datos del usuario'
                    : 'Complete los datos para crear un nuevo usuario'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className={`mt-4 ${
                formData.rol === 'Supervisor' && editingUser 
                  ? 'grid grid-cols-2 gap-6' 
                  : 'space-y-4'
              }`}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre Completo *</Label>
                    <Input
                      id="nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Juan Pérez"
                      required
                      data-testid="user-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Correo Electrónico *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="correo@empresa.com"
                      required
                      disabled={!!editingUser}
                      data-testid="user-email-input"
                    />
                  </div>

                  {!editingUser && (
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="••••••••"
                        required
                        data-testid="user-password-input"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="rol">Rol *</Label>
                  <Select
                    value={formData.rol}
                    onValueChange={(value) => setFormData({ ...formData, rol: value })}
                  >
                    <SelectTrigger data-testid="user-role-select">
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Administrador">Administrador</SelectItem>
                      <SelectItem value="Tesorero">Tesorero</SelectItem>
                      <SelectItem value="Usuario Área">Usuario Área</SelectItem>
                      <SelectItem value="Supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area">Empresa (opcional)</Label>
                  <Select
                    value={formData.empresa_id ? formData.empresa_id : "none"}
                    onValueChange={(value) => {
                      const newEmpresaId = value === "none" ? "" : value;
                      console.log('🔵 [SELECT EMPRESA] Changed to:', newEmpresaId, '(display value:', value + ')');
                      setFormData({ ...formData, empresa_id: newEmpresaId });
                    }}
                  >
                    <SelectTrigger data-testid="user-area-select">
                      <SelectValue placeholder="Seleccionar empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin empresa</SelectItem>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                  {/* Botones principales - En columna izquierda */}
                  <div className="flex gap-2 pt-3 border-t mt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      disabled={submitting}
                      data-testid="user-submit-btn"
                    >
                      {submitting ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear'}
                    </Button>
                  </div>
                </div>

                {/* COLUMNA DERECHA: Empresas supervisadas (Solo para supervisores en edición) */}
                {formData.rol === 'Supervisor' && editingUser && (
                  <div className="space-y-3 p-4 bg-purple-50 rounded-lg border border-purple-200 flex flex-col">
                    <Label className="font-semibold text-purple-900">Empresas a Supervisar</Label>
                    <p className="text-sm text-purple-700 mb-2">Selecciona las empresas que este supervisor puede autorizar facturas</p>
                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-300 scrollbar-track-purple-100">
                      {areas.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay empresas disponibles</p>
                      ) : (
                        areas.map((area) => (
                          <div key={area.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`supervisor-area-${area.id}`}
                              checked={formData.empresas_supervisadas.includes(area.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    empresas_supervisadas: [...formData.empresas_supervisadas, area.id]
                              });
                                } else {
                                  setFormData({
                                    ...formData,
                                    empresas_supervisadas: formData.empresas_supervisadas.filter(id => id !== area.id)
                                  });
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-purple-600 cursor-pointer"
                            />
                            <label htmlFor={`supervisor-area-${area.id}`} className="text-sm cursor-pointer">
                              {area.nombre}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                    
                    {/* Botón de guardar cambios - solo aparece si hay cambios pendientes */}
                    {hasSupervisorChanges && (
                      <div className="pt-3 border-t border-purple-200 flex gap-2 flex-col">
                        <Button
                          type="button"
                          onClick={handleSaveSupervisorAssignments}
                          disabled={savingSupervisor}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          {savingSupervisor ? 'Guardando...' : '✓ Guardar Cambios'}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            // Revertir cambios
                            setFormData({
                              ...formData,
                              empresas_supervisadas: initialEmpresasSupervisadas
                            });
                          }}
                          variant="outline"
                          className="w-full"
                        >
                          ✕ Descartar
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {!(formData.rol === 'Supervisor' && editingUser) && (
                  <>
                {formData.rol === 'Supervisor' && !editingUser && (
                  <div className="space-y-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <Label className="font-semibold text-purple-900">Empresas a Supervisar</Label>
                    <p className="text-sm text-purple-700 mb-3">Selecciona las empresas que este supervisor puede autorizar facturas</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {areas.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay empresas disponibles</p>
                      ) : (
                        areas.map((area) => (
                          <div key={area.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`supervisor-area-new-${area.id}`}
                              checked={formData.empresas_supervisadas.includes(area.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    empresas_supervisadas: [...formData.empresas_supervisadas, area.id]
                              });
                                } else {
                                  setFormData({
                                    ...formData,
                                    empresas_supervisadas: formData.empresas_supervisadas.filter(id => id !== area.id)
                                  });
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-purple-600 cursor-pointer"
                            />
                            <label htmlFor={`supervisor-area-new-${area.id}`} className="text-sm cursor-pointer">
                              {area.nombre}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                </>
                )}

              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <Card className="bg-white border border-zinc-200">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              placeholder="Buscar por nombre o correo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="user-search-input"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-white border border-zinc-200" data-tour="users-table">
        <CardContent className="p-0">
          {loading ? (
            <LoadingState sizeClass="h-10 w-10" />
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <Users className="w-12 h-12 mb-4 text-zinc-300" />
              <p className="font-medium">No se encontraron usuarios</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50">
                    <TableHead className="font-bold">Nombre</TableHead>
                    <TableHead className="font-bold">Correo</TableHead>
                    <TableHead className="font-bold">Rol</TableHead>
                    <TableHead className="font-bold">Empresa</TableHead>
                    <TableHead className="font-bold text-center">Estado</TableHead>
                    <TableHead className="font-bold text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className="hover:bg-zinc-50">
                      <TableCell className="font-medium">{user.nombre}</TableCell>
                      <TableCell className="text-zinc-600">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ROLE_STYLES[user.rol]}>
                          {user.rol}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.empresa_nombre || '-'}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {user.activo ? (
                            <UserCheck className="w-4 h-4 text-green-600" />
                          ) : (
                            <UserX className="w-4 h-4 text-red-600" />
                          )}
                          <Switch
                            checked={user.activo}
                            onCheckedChange={() => handleToggleActive(user)}
                            data-testid={`toggle-user-${user.id}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                            data-testid={`edit-user-${user.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPasswordDialog(user)}
                            title="Cambiar contraseña"
                            data-testid={`password-user-${user.id}`}
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(user.id)}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`delete-user-${user.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-[Chivo]">
              Cambiar Contraseña
            </DialogTitle>
            <DialogDescription>
              {passwordUser
                ? `Nueva contraseña para ${passwordUser.nombre} (${passwordUser.email})`
                : 'Ingrese la nueva contraseña'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleChangePassword} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">Nueva Contraseña *</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="pr-20"
                  data-testid="new-password-input"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  {newPassword && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={copyPassword}
                      title="Copiar"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">
                  Mínimo 8 caracteres, 1 mayúscula, 1 minúscula y 1 número
                </p>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 hover:underline"
                >
                  <Sparkles className="w-3 h-3" />
                  Sugerir contraseña
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={changingPassword || newPassword.length < 8}
                data-testid="change-password-submit"
              >
                {changingPassword ? 'Guardando...' : 'Cambiar Contraseña'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
