import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
  const [exporting, setExporting] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nombre: '',
    rol: 'Usuario Área',
    area_id: '',
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingUser) {
        const updateData = {
          nombre: formData.nombre,
          rol: formData.rol,
          area_id: formData.area_id || null,
        };
        await axios.put(`${API_URL}/api/users/${editingUser.id}`, updateData, getAuthHeader());
        toast.success('Usuario actualizado');
      } else {
        await axios.post(`${API_URL}/api/users`, formData, getAuthHeader());
        toast.success('Usuario creado');
      }
      setDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error(error.response?.data?.detail || 'Error al guardar usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      nombre: user.nombre,
      rol: user.rol,
      area_id: user.area_id || '',
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
      area_id: '',
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
            <DialogContent className="max-w-md">
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

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area">Área (opcional)</Label>
                  <Select
                    value={formData.area_id || "none"}
                    onValueChange={(value) => setFormData({ ...formData, area_id: value === "none" ? "" : value })}
                  >
                    <SelectTrigger data-testid="user-area-select">
                      <SelectValue placeholder="Seleccionar área" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin área</SelectItem>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={submitting}
                    data-testid="user-submit-btn"
                  >
                    {submitting ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
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
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
            </div>
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
                    <TableHead className="font-bold">Área</TableHead>
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
                      <TableCell>{user.area_nombre || '-'}</TableCell>
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
