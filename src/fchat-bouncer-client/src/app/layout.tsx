import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import CredentialDialogProvider from '@/components/CredentialDialogProvider'
import StorageInitializer from '@/components/StorageInitializer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'F-Chat Bouncer',
  description: 'A modern bouncer for F-Chat with persistent connections and logging',
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'F-Chat Bouncer',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="F-Chat Bouncer" />
        <link rel="apple-touch-icon" href="/logo.ico" />
      </head>
      <body className={inter.className}>
        <StorageInitializer />
        <CredentialDialogProvider>
          {children}
        </CredentialDialogProvider>
      </body>
    </html>
  )
}