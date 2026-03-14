import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/connectors": "Connectors",
  "/catalog": "Catalog Browser",
  "/pipelines": "Pipelines",
};

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Data Builder";

  return (
    <header className="flex h-14 items-center border-b px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}
