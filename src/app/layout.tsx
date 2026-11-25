import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Serif_Display, Manrope } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const serif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-serif-ui", display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans-ui", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono-ui", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Personal Calendar", template: "%s · Personal Calendar" },
  description: "Calendario personal con API para Eddie",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF6EE" },
    { media: "(prefers-color-scheme: dark)", color: "#161412" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
