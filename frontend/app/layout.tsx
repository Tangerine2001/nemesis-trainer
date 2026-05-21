import type {Metadata} from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Nemesis Trainer",
  description: "Paste your team and preview the trainer built to beat it."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
