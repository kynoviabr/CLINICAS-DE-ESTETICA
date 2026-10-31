import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ClinicLayout from "./components/layouts/ClinicLayout";
import PatientPortalLayout from "./components/layouts/PatientPortalLayout";
import NotFound from "./pages/NotFound";
import { PageLoader } from "./components/PageLoader";

const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const ClinicDashboard = lazy(() => import("./pages/clinic/DashboardPage"));
const CrmPage = lazy(() => import("./pages/clinic/CrmPage"));
const PatientsPage = lazy(() => import("./pages/clinic/PatientsPage"));
const PatientDetailPage = lazy(() => import("./pages/clinic/PatientDetailPage"));
const TreatmentsPage = lazy(() => import("./pages/clinic/TreatmentsPage"));
const ProposalsPage = lazy(() => import("./pages/clinic/ProposalsPage"));
const ContractsPage = lazy(() => import("./pages/clinic/ContractsPage"));
const FinanceContractsPage = lazy(() => import("./pages/clinic/FinanceContractsPage"));
const AppointmentsPage = lazy(() => import("./pages/clinic/AppointmentsPage"));
const SessionsPage = lazy(() => import("./pages/clinic/SessionsPage"));
const FeedbackPage = lazy(() => import("./pages/clinic/FeedbackPage"));
const EvolutionPage = lazy(() => import("./pages/clinic/EvolutionPage"));
const PhotosPage = lazy(() => import("./pages/clinic/PhotosPage"));
const ReportsPage = lazy(() => import("./pages/clinic/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/clinic/SettingsPage"));
const WhatsAppAiPage = lazy(() => import("./pages/clinic/WhatsAppAiPage"));
const GoalsTrackingPage = lazy(() => import("./pages/clinic/GoalsTrackingPage"));
const PortalHomePage = lazy(() => import("./pages/portal/PortalHomePage"));
const PortalContractPage = lazy(() => import("./pages/portal/PortalContractPage"));
const PortalPaymentsPage = lazy(() => import("./pages/portal/PortalPaymentsPage"));
const PortalSessionsPage = lazy(() => import("./pages/portal/PortalSessionsPage"));
const PortalEvolutionPage = lazy(() => import("./pages/portal/PortalEvolutionPage"));
const PortalPhotosPage = lazy(() => import("./pages/portal/PortalPhotosPage"));
const PortalFeedbackPage = lazy(() => import("./pages/portal/PortalFeedbackPage"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/onboarding" element={
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              } />

              {/* Clinic internal — staff only */}
              <Route path="/clinic" element={
                <ProtectedRoute allowedRoles={['admin', 'receptionist', 'professional', 'sales']}>
                  <ClinicLayout />
                </ProtectedRoute>
              }>
                <Route index element={<ClinicDashboard />} />
                <Route path="crm" element={<CrmPage />} />
                <Route path="whatsapp-ai" element={<WhatsAppAiPage />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="patients/:id" element={<PatientDetailPage />} />
                <Route path="treatments" element={<TreatmentsPage readOnly />} />
                <Route path="proposals" element={<ProposalsPage />} />
                <Route path="contracts" element={<ContractsPage />} />
                <Route path="payments" element={<Navigate to="/clinic/finance/contracts" replace />} />
                <Route path="finance/contracts" element={<FinanceContractsPage />} />
                <Route path="appointments" element={<AppointmentsPage />} />
                <Route path="sessions" element={<SessionsPage />} />
                <Route path="evolution" element={<EvolutionPage />} />
                <Route path="photos" element={<PhotosPage />} />
                <Route path="feedback" element={<FeedbackPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="metas/acompanhamento" element={<GoalsTrackingPage />} />
                <Route path="metas/minha-meta" element={<GoalsTrackingPage />} />
                <Route path="metas/equipe" element={<GoalsTrackingPage />} />
              </Route>

              {/* Patient portal */}
              <Route path="/portal" element={
                <ProtectedRoute allowedRoles={['patient']}>
                  <PatientPortalLayout />
                </ProtectedRoute>
              }>
                <Route index element={<PortalHomePage />} />
                <Route path="contract" element={<PortalContractPage />} />
                <Route path="payments" element={<PortalPaymentsPage />} />
                <Route path="sessions" element={<PortalSessionsPage />} />
                <Route path="evolution" element={<PortalEvolutionPage />} />
                <Route path="photos" element={<PortalPhotosPage />} />
                <Route path="feedback" element={<PortalFeedbackPage />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
