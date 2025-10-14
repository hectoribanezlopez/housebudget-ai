'use client'

import { useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const supabase = supabaseBrowser()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
   await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${location.origin}/auth/callback` } // <-- antes era '/'
})
    setSent(true)
  }

  return (
    <div className="max-w-sm mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold">Inicia sesión</h1>
      {sent ? (
        <p>Te hemos enviado un enlace de acceso a <strong>{email}</strong>. Revisa tu correo.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="border rounded w-full p-2"
            type="email"
            required
            placeholder="tu@email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
          />
          <button className="px-3 py-2 rounded bg-black text-white w-full">
            Enviar enlace
          </button>
        </form>
      )}
    </div>
  )
}
