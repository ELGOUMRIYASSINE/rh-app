"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@yghr/ui";
import { ConfirmHost } from "./confirm";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } } }));
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={250}>
        {children}
        <ConfirmHost />
        <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)", borderRadius: 12 } }} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
