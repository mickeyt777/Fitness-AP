import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitness AP — Don't lose the muscle with the fat.",
  description:
    "The training and nutrition app built for people on GLP-1 weight-loss drugs. Protect and build muscle while the drug does the fat loss.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
