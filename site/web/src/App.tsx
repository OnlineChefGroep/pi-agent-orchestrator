import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { SiteLayout } from "@/components/layout/site-layout";
import { CapabilitiesPage } from "@/pages/capabilities-page";
import { DocsPage } from "@/pages/docs-page";
import { InstallPage } from "@/pages/install-page";
import { LandingPage } from "@/pages/landing-page";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="install" element={<InstallPage />} />
          <Route path="docs" element={<DocsPage />} />
          <Route path="capabilities" element={<CapabilitiesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
