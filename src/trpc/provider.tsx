"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "./client";
import { toast } from "sonner";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const qc = new QueryClient();
    qc.setDefaultOptions({
      mutations: {
        onError: (error: unknown) => {
          if (error instanceof Error) {
            toast.error(error.message);
          }
        },
      },
    });
    return qc;
  });

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: "include",
              signal: options?.signal ?? null,
            });
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}