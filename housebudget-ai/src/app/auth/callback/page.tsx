'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = supabaseBrowser()
    // Intercambia el ?code= de Supabase por una sesión válida
    supabase.auth.exchangeCodeForSession(window.location.href)
      .then(({ error }) => {
        // Ignora los errores suaves de “already signed in” para evitar pantallas raras
        if (error && !/already/i.test(error.message)) {
          console.error('exchangeCodeForSession error:', error.message)
        }
      })
      .finally(() => {
        // Redirige a la home (o donde prefieras)
        router.replace('/')
      })
  }, [router])

  return (
    <div className="max-w-md mx-auto p-6">
      <p>Confirmando tu acceso…</p>
    </div>
  )
}
