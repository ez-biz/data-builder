import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ConnectorsPage } from "./pages/ConnectorsPage";
import { CatalogPage } from "./pages/CatalogPage";
import { PipelineListPage } from "./pages/PipelineListPage";
import { CDCPage } from "./pages/CDCPage";
import { MonitoringPage } from "./pages/MonitoringPage";

const PipelineEditorPage = lazy(() =>
  import("./pages/PipelineEditorPage").then((m) => ({
    default: m.PipelineEditorPage,
  })),
);

function RouteLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/connectors" element={<ConnectorsPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/pipelines" element={<PipelineListPage />} />
        <Route path="/cdc" element={<CDCPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
      </Route>
      <Route
        path="/pipelines/new"
        element={
          <Suspense fallback={<RouteLoader />}>
            <PipelineEditorPage />
          </Suspense>
        }
      />
      <Route
        path="/pipelines/:id"
        element={
          <Suspense fallback={<RouteLoader />}>
            <PipelineEditorPage />
          </Suspense>
        }
      />
    </Routes>
  );
}
