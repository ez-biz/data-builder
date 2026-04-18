import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main id="main-content" className="flex-1 overflow-auto bg-background">
          <RouteContent />
        </main>
      </div>
    </div>
  );
}

/**
 * The Pipeline editor needs the full viewport width for its canvas; every
 * other page caps at 1280px and gets consistent padding.
 */
function RouteContent() {
  const location = useLocation();
  const isEditor = /^\/pipelines\/[^/]+$/.test(location.pathname);
  if (isEditor) {
    return <Outlet />;
  }
  return (
    <div className="mx-auto max-w-[1280px] px-8 py-6">
      <Outlet />
    </div>
  );
}
