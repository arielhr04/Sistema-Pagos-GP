import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { FileText, Lock, Mail, Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Por favor complete todos los campos');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success('Bienvenido al sistema');
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.detail || 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={{ 
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.7)), url('https://images.unsplash.com/photo-1595217379975-e55331cf97e8?crop=entropy&cs=srgb&fm=jpg&q=85')` 
      }}
    >
      <div className="w-full max-w-md animate-fade-in">
        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-16 h-16 bg-red-600 rounded-xl flex items-center justify-center shadow-lg">
              <FileText className="w-9 h-9 text-white" strokeWidth={1.5} />
            </div>
            <CardTitle className="text-2xl font-black font-[Chivo] tracking-tight text-zinc-900">
              Sistema de Facturas
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Control Financiero Empresarial
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-700 font-medium">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="correo@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 border-zinc-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    data-testid="login-email-input"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-700 font-medium">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 border-zinc-300 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide text-sm shadow-lg"
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Iniciando sesión...
                  </div>
                ) : (
                  'Iniciar sesión'
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-zinc-200">
              <p className="text-xs text-center text-zinc-500">
                Sistema seguro con autenticación JWT
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center mt-6 text-white/70 text-sm">
          © 2025 Control Financiero. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
