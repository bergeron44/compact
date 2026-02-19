import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { migrateToIndexedDB } from "./lib/storage/migrate";
import { compressor } from "./lib/compression";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import CacheDashboard from "./pages/CacheDashboard";
import CompressionView from "./pages/CompressionView";
import OrgCaching from "./pages/OrgCaching";
import PromptRating from "./pages/PromptRating";
import TestingDashboard from "./pages/TestingDashboard";
import NotFound from "./pages/NotFound";

if (import.meta.env.DEV) {
  import("./lib/storage/tests");
}

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    migrateToIndexedDB().catch(console.error);
    compressor.init().catch(console.error);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/cache" element={<CacheDashboard />} />
            <Route path="/compression" element={<CompressionView />} />
            <Route path="/org-cache" element={<OrgCaching />} />
            <Route path="/prompt-rating" element={<PromptRating />} />
            <Route path="/testing" element={<TestingDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
