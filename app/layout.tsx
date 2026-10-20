import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "./header";
import { AccountProvider } from "./profile/account-provider";
import { getCurrentAccount } from "./profile/account-data";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Humour Project",
  description: "Turn everyday photos into funny AI-generated captions. Pick your favorite and share it with the campus community.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const account = await getCurrentAccount();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><AccountProvider account={account}><Header />{children}</AccountProvider></body>
    </html>
  );
}
