import Providers from "@/components/Providers";
import "./globals.css";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { Metadata } from "next/types";
import { VersionProvider } from "@/contexts/VersionContext";


export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ConfirmProvider>
          <VersionProvider>
            <Providers>
              {children}
            </Providers>
          </VersionProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}