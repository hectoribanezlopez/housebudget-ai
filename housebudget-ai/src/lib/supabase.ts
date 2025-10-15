// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!url || !anon) {
    console.error('⚠️ Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
    console.log("✅ SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log("✅ SUPABASE KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 8))

  }
  return createBrowserClient(url, anon)
}
