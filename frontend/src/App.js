import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TourProvider } from "./context/TourContext";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const KanbanPage = lazy(() => import("./pages/KanbanPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const AreasPage = lazy(() => import("./pages/AreasPage"));
const SupervisorKanbanPage = lazy(() => import("./pages/SupervisorKanbanPage"));
const Layout = lazy(() => import("./components/Layout"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-zinc-100">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
  </div>
);

const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (roles && !roles.includes(user.rol)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function AppRoutes() {
  const { user } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="kanban" element={
          <ProtectedRoute roles={["Administrador", "Tesorero"]}>
            <KanbanPage />
          </ProtectedRoute>
        } />
        <Route path="users" element={
          <ProtectedRoute roles={["Administrador"]}>
            <UsersPage />
          </ProtectedRoute>
        } />
        <Route path="areas" element={
          <ProtectedRoute roles={["Administrador"]}>
            <AreasPage />
          </ProtectedRoute>
        } />
        <Route path="supervisor-kanban" element={
          <ProtectedRoute roles={["Supervisor"]}>
            <SupervisorKanbanPage />
          </ProtectedRoute>
        } />
        <Route path="audit" element={
          <ProtectedRoute roles={["Administrador"]}>
            <AuditPage />
          </ProtectedRoute>
        } />
      </Route>
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TourProvider>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
          <Toaster position="top-right" richColors />
        </TourProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
