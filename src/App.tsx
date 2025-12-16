import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import SubmitDeal from "./pages/SubmitDeal";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import '@/i18n/config';
import AuthCallback from "./pages/AuthCallback";
import DealDetail from "./pages/DealDetail";
import WorkflowLogs from "./pages/WorkflowLogs";
import Admin from "./pages/Admin";
import ClaimDeal from "./pages/ClaimDeal";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/claim-deal" element={<ClaimDeal />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Dashboard />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/submit"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <SubmitDeal />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/deal/:id"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <DealDetail />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/deal/:dealId/workflow"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <WorkflowLogs />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Profile />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Admin />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
