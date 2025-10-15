'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = supabaseBrowser()
    supabase.auth.exchangeCodeForSession(window.location.href)
      .catch((e) => console.error('exchangeCodeForSession error:', e))
      .finally(() => router.replace('/'))
  }, [router])

  return <div className="max-w-md mx-auto p-6">Confirmando tu acceso…</div>
}
