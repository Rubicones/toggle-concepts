import type { Metadata } from "next";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import { StudioShell } from "@/components/studio/studio-shell";
import "./globals.css";
import "@/components/ui/controls.css";

export const metadata: Metadata = {
  title: "Toggle Studio — AI Marketing Studio",
  description: "Your creative workspace. From the first idea to every version.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body><StudioShell>{children}</StudioShell></body>
    </html>
  );
}
