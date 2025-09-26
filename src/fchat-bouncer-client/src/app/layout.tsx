import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import CredentialDialogProvider from '@/components/CredentialDialogProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'F-Chat Bouncer',
  description: 'A modern bouncer for F-Chat with persistent connections and logging',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  
  return (
    <html lang="en">
      <body className={inter.className}>
        <CredentialDialogProvider>
          {children}
        </CredentialDialogProvider>
      </body>
    </html>
  )
}