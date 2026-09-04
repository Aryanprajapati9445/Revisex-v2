import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api-client";
import { ThemeProvider } from "@/app/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // 4xx are deterministic answers, not transient failures — retrying
            // a 404 or 403 just delays the error state.
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
