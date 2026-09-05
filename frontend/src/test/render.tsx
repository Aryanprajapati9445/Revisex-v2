import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/app/ThemeProvider";
import { CommandPaletteProvider } from "@/hooks/use-command-palette";

function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Retries turn a deliberate 4xx test into a multi-second hang.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { route = "/", ...options }: RenderOptions & { route?: string } = {}
) {
  const queryClient = makeTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <MemoryRouter initialEntries={[route]}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <CommandPaletteProvider>{children}</CommandPaletteProvider>
            </AuthProvider>
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>
    );
  }
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
