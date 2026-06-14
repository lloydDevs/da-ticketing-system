import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import OfficeSelectorPage from "./pages/user/OfficeSelectorPage";
import TicketFormPage from "./pages/user/TicketFormPage";
import TicketSuccessPage from "./pages/user/TicketSuccessPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTickets from "./pages/admin/AdminTickets";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminReports from "./pages/admin/AdminReports";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-emerald-950 flex items-center justify-center">
      <div className="text-emerald-400 text-lg animate-pulse">Loading...</div>
    </div>
  );
  return user ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OfficeSelectorPage />} />
          <Route path="/submit" element={<TicketFormPage />} />
          <Route path="/success" element={<TicketSuccessPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="reports" element={<AdminReports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
