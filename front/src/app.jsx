// front/src/app.jsx
import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./layout.jsx";
import PrivateRoute from "./components/privateRoute.jsx";
const AdminRoute = lazy(() => import("./components/adminRoute.jsx"));

const Dashboard = lazy(() => import("./pages/dashboard.jsx"));
const Clients = lazy(() => import("./pages/clients.jsx"));
const Posts = lazy(() => import("./pages/posts.jsx"));
const PostCreate = lazy(() => import("./pages/post-create.jsx"));
const PostEdit = lazy(() => import("./pages/post-edit.jsx"));
const Tasks = lazy(() => import("./pages/tasks.jsx"));
const Financeiro = lazy(() => import("./pages/financeiro.jsx"));
const Team = lazy(() => import("./pages/team.jsx"));
const Biblioteca = lazy(() => import("./pages/biblioteca.jsx"));
const Metrics = lazy(() => import("./pages/metrics.jsx"));
const Competitors = lazy(() => import("./pages/competitors.jsx"));
const Integrations = lazy(() => import("./pages/integrations.jsx"));
const Ga4Integration = lazy(() => import("./pages/integrations/ga4.jsx"));
const Settings = lazy(() => import("./pages/settings.jsx"));
const ReportsHome = lazy(() => import("./pages/reports/ReportsHome.jsx"));
const ReportsTemplates = lazy(() => import("./pages/reports/ReportsTemplates.jsx"));
const ReportsTemplateBuilder = lazy(() => import("./pages/reports/ReportsTemplateBuilder.jsx"));
const ReportsWizard = lazy(() => import("./pages/reports/ReportsWizard.jsx"));
const ReportViewer = lazy(() => import("./pages/reports/ReportViewer.jsx"));
const DashboardsHome = lazy(() => import("./pages/reports/DashboardsHome.jsx"));
const DashboardViewer = lazy(() => import("./pages/reports/DashboardViewer.jsx"));
const DashboardBuilder = lazy(() => import("./pages/reports/DashboardBuilder.jsx"));
const ReportsV2Home = lazy(() => import("./pages/reportsV2/ReportsV2Home.jsx"));
const ReportsV2Templates = lazy(() =>
  import("./pages/reportsV2/ReportsV2Templates.jsx")
);
const ReportsV2Viewer = lazy(() => import("./pages/reportsV2/ReportsV2Viewer.jsx"));
const ReportsV2Editor = lazy(() => import("./pages/reportsV2/ReportsV2Editor.jsx"));
const AnalyticsDashboards = lazy(() => import("./pages/analytics/dashboards.jsx"));
const AnalyticsDashboardBuilder = lazy(() =>
  import("./pages/analytics/dashboardBuilder.jsx")
);

const Home = lazy(() => import("./pages/home.jsx"));
const Checkout = lazy(() => import("./pages/checkout.jsx"));
const Login = lazy(() => import("./pages/login.jsx"));
const Register = lazy(() => import("./pages/register.jsx"));
const Onboarding = lazy(() => import("./pages/onboarding.jsx"));

const ClientLogin = lazy(() => import("./pages/clientlogin.jsx"));
const ClientPortalLayout = lazy(() => import("./pages/clientportal.jsx"));
const ClientHomePage = lazy(() =>
  import("./pages/clientportal.jsx").then((m) => ({ default: m.ClientHomePage })),
);
const ClientPostsPage = lazy(() =>
  import("./pages/clientportal.jsx").then((m) => ({ default: m.ClientPostsPage })),
);
const ClientMetricsPage = lazy(() =>
  import("./pages/clientportal.jsx").then((m) => ({ default: m.ClientMetricsPage })),
);

const Pricing = lazy(() => import("./pages/pricing.jsx"));
const ModulesPage = lazy(() => import("./pages/modules.jsx"));
const DemoPage = lazy(() => import("./pages/demo.jsx"));

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin.jsx"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview.jsx"));
const AdminTenants = lazy(() => import("./pages/admin/AdminTenants.jsx"));
const AdminTenantDetails = lazy(() => import("./pages/admin/AdminTenantDetails.jsx"));
const AdminLogs = lazy(() => import("./pages/admin/AdminLogs.jsx"));
const AdminJobs = lazy(() => import("./pages/admin/AdminJobs.jsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.jsx"));
const AdminBilling = lazy(() => import("./pages/admin/AdminBilling.jsx"));
const AdminIntegrations = lazy(() => import("./pages/admin/AdminIntegrations.jsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.jsx"));
const AdminDataConsole = lazy(() => import("./pages/admin/AdminDataConsole.jsx"));
const PublicApproval = lazy(() => import("./pages/publicApproval.jsx"));

// ✅ Novas páginas públicas (Meta exige URLs públicas válidas)
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Carregando...
        </div>
      }
    >
      <Routes>
        {/* Rotas públicas */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/modules" element={<ModulesPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/checkout" element={<Checkout />} />

        {/* ✅ Páginas legais (Meta) */}
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />

        <Route path="/public/approvals/:token" element={<PublicApproval />} />

        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Login / portal do cliente (white-label) */}
        <Route path="/clientlogin" element={<ClientLogin />} />
        <Route path="/client" element={<ClientPortalLayout />}>
          <Route index element={<ClientHomePage />} />
          <Route path="home" element={<ClientHomePage />} />
          <Route path="posts" element={<ClientPostsPage />} />
          <Route path="metrics" element={<ClientMetricsPage />} />
        </Route>
        <Route path="/clientportal/*" element={<Navigate to="/client" replace />} />

        {/* Área autenticada da agência */}
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/posts/new" element={<PostCreate />} />
            <Route path="/posts/:postId" element={<PostEdit />} />
            <Route path="/posts" element={<Posts />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/team" element={<Team />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/reports" element={<ReportsHome />} />
            <Route path="/reports/templates" element={<ReportsTemplates />} />
            <Route path="/reports/templates/new" element={<ReportsTemplateBuilder />} />
            <Route path="/reports/templates/:templateId/edit" element={<ReportsTemplateBuilder />} />
            <Route path="/reports/new" element={<ReportsWizard />} />
            <Route path="/reports/:reportId" element={<ReportViewer />} />
            <Route path="/reports/dashboards" element={<DashboardsHome />} />
            <Route path="/reports/dashboards/new" element={<DashboardBuilder />} />
            <Route
              path="/reports/dashboards/:dashboardId"
              element={<DashboardViewer />}
            />
            <Route
              path="/reports/dashboards/:dashboardId/edit"
              element={<DashboardBuilder />}
            />
            <Route path="/relatorios/v2" element={<ReportsV2Home />} />
            <Route path="/relatorios/v2/templates" element={<ReportsV2Templates />} />
            <Route path="/relatorios/v2/:id" element={<ReportsV2Viewer />} />
            <Route path="/relatorios/v2/:id/edit" element={<ReportsV2Editor />} />
            <Route path="/competitors" element={<Competitors />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/integrations/ga4" element={<Ga4Integration />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/analytics/dashboards" element={<AnalyticsDashboards />} />
            <Route path="/analytics/dashboards/new" element={<AnalyticsDashboardBuilder />} />
            <Route
              path="/analytics/dashboards/:dashboardId"
              element={<AnalyticsDashboardBuilder />}
            />
          </Route>
        </Route>

        {/* Painel mestre */}
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/tenants" element={<AdminTenants />} />
            <Route path="/admin/tenants/:tenantId" element={<AdminTenantDetails />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/integrations" element={<AdminIntegrations />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/logs" element={<AdminLogs />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/data" element={<AdminDataConsole />} />
          </Route>
        </Route>

        {/* Fallback 404 simples */}
        <Route
          path="*"
          element={
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">
                  404 - Página não encontrada
                </h1>
                <p className="text-sm text-gray-600 mb-4">
                  Verifique a URL ou volte para o dashboard.
                </p>
                <a
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-md bg-purple-500 text-white text-sm font-medium hover:bg-purple-600"
                >
                  Ir para o dashboard
                </a>
              </div>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
