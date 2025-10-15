// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!url || !anon) {
    // Te ayuda a depurar si faltan envs en runtime
    console.error('⚠️ Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createBrowserClient(url, anon)
}
