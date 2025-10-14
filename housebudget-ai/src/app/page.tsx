# HouseBudget AI — Fix build (Next.js con `/src`)

A continuación tienes **tres archivos separados** para que el build en Vercel funcione. Tu proyecto usa `src/`, así que coloca cada archivo exactamente en la ruta indicada.

---

## 1) `src/lib/supabase.ts`
```ts
// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createBrowserClient(url, anon)
}
```

---

## 2) `src/app/login/page.tsx`
```tsx
// src/app/login/page.tsx
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
      options: { emailRedirectTo: `${location.origin}/` }
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
          <input className="border rounded w-full p-2" type="email" required placeholder="tu@email"
            value={email} onChange={(e)=>setEmail(e.target.value)} />
          <button className="px-3 py-2 rounded bg-black text-white w-full">Enviar enlace</button>
        </form>
      )}
    </div>
  )
}
```

---

## 3) `src/app/page.tsx`
```tsx
// src/app/page.tsx
'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, Download, RefreshCw, LogIn, LogOut, Upload } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { supabaseBrowser } from '@/lib/supabase'

// -----------------------------
// Types & helpers
// -----------------------------
type Entry = {
  id: string
  type: 'income' | 'expense'
  name: string
  amount: number // monthly amount in EUR
  category: string
}

function currency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function uid() { return Math.random().toString(36).slice(2, 9) }

const DEFAULT_INCOMES: Entry[] = [
  { id: uid(), type: 'income', name: 'Nómina 1', amount: 1800, category: 'Salario' },
  { id: uid(), type: 'income', name: 'Nómina 2', amount: 1200, category: 'Salario' },
]

const DEFAULT_EXPENSES: Entry[] = [
  { id: uid(), type: 'expense', name: 'Hipoteca', amount: 850, category: 'Vivienda' },
  { id: uid(), type: 'expense', name: 'Luz', amount: 90, category: 'Suministros' },
  { id: uid(), type: 'expense', name: 'Comida', amount: 400, category: 'Alimentación' },
]

const STORAGE_KEY = 'housebudget_mvp_state_v1'

type PersistedState = {
  entries: Entry[]
  inflationPct: number // % mensual esperado en gastos
  horizonMonths: number
  startingBalance: number
}

const defaultState: PersistedState = {
  entries: [...DEFAULT_INCOMES, ...DEFAULT_EXPENSES],
  inflationPct: 0.2,
  horizonMonths: 12,
  startingBalance: 0,
}

// Forecast calculator
function computeForecast(
  monthlyIncome: number,
  monthlyExpense: number,
  inflationPct: number,
  horizonMonths: number,
  startingBalance: number
) {
  const rows: { month: string; income: number; expense: number; net: number; balance: number }[] = []
  let expense = monthlyExpense
  let balance = startingBalance
  const now = new Date()
  for (let i = 0; i < Math.max(1, horizonMonths); i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const label = d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
    const income = monthlyIncome
    const net = income - expense
    balance += net
    rows.push({ month: label, income, expense, net, balance })
    expense = expense * (1 + inflationPct / 100)
  }
  return rows
}

// CSV generator
function generateCSV(state: PersistedState, forecast: { month: string; income: number; expense: number; net: number; balance: number }[]) {
  const header = ['Tipo', 'Nombre', 'Categoría', 'Importe mensual (€)']
  const lines = state.entries.map(e => [e.type, e.name, e.category, e.amount].join(','))
  const forecastHeader = ['Mes', 'Ingresos', 'Gastos', 'Neto', 'Saldo acumulado']
  const forecastLines = forecast.map(r => [r.month, r.income.toFixed(2), r.expense.toFixed(2), r.net.toFixed(2), r.balance.toFixed(2)].join(','))
  const csv = [
    'Entradas',
    header.join(','),
    lines.join('\n'),
    '',
    'Previsión',
    forecastHeader.join(','),
    forecastLines.join('\n'),
  ].join('\n')
  return csv
}

export default function HouseBudgetApp() {
  const [state, setState] = useState<PersistedState>(defaultState)
  const [newEntry, setNewEntry] = useState<Omit<Entry, 'id'>>({ type: 'expense', name: '', amount: 0, category: 'General' })
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = supabaseBrowser()

  // Auth state
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) setUserId(data.user?.id ?? null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [supabase])

  // Load entries (Supabase if logged, else local)
  const loadEntries = useCallback(async () => {
    if (userId) {
      const { data, error } = await supabase
        .from('entries')
        .select('id, type, name, category, amount')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (!error && data) {
        setState(s => ({
          ...s,
          entries: data.map(r => ({ id: String(r.id), type: r.type as 'income'|'expense', name: String(r.name), category: String(r.category ?? 'General'), amount: Number(r.amount) }))
        }))
        return
      }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setState(JSON.parse(raw) as PersistedState)
    } catch {}
  }, [userId, supabase])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Persist local only for guests
  useEffect(() => {
    if (!userId) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
    }
  }, [state, userId])

  // Derived
  const incomes = useMemo(() => state.entries.filter(e => e.type === 'income'), [state.entries])
  const expenses = useMemo(() => state.entries.filter(e => e.type === 'expense'), [state.entries])
  const monthlyIncome = useMemo(() => incomes.reduce((s, e) => s + (e.amount || 0), 0), [incomes])
  const monthlyExpense = useMemo(() => expenses.reduce((s, e) => s + (e.amount || 0), 0), [expenses])
  const monthlyNet = monthlyIncome - monthlyExpense
  const forecast = useMemo(() => computeForecast(monthlyIncome, monthlyExpense, state.inflationPct, state.horizonMonths, state.startingBalance), [monthlyIncome, monthlyExpense, state.inflationPct, state.horizonMonths, state.startingBalance])
  const total12mNet = useMemo(() => forecast.reduce((s, r) => s + r.net, 0), [forecast])
  const breakEvenMonth = useMemo(() => forecast.findIndex(r => r.balance < 0), [forecast])

  // CRUD
  async function addEntry() {
    if (!newEntry.name || !isFinite(newEntry.amount)) return
    if (userId) {
      const { error } = await supabase.from('entries').insert({ user_id: userId, type: newEntry.type, name: newEntry.name, category: newEntry.category, amount: newEntry.amount })
      if (!error) { setNewEntry({ ...newEntry, name: '', amount: 0 }); await loadEntries() }
    } else {
      setState(s => ({ ...s, entries: [...s.entries, { ...newEntry, id: uid(), amount: Math.max(0, Number(newEntry.amount)) }] }))
      setNewEntry({ ...newEntry, name: '', amount: 0 })
    }
  }

  async function removeEntry(id: string) {
    if (userId) {
      const { error } = await supabase.from('entries').delete().eq('id', id).eq('user_id', userId)
      if (!error) await loadEntries()
    } else {
      setState(s => ({ ...s, entries: s.entries.filter(e => e.id !== id) }))
    }
  }

  function resetAll() { setState(defaultState) }

  function downloadCSV() {
    const csv = generateCSV(state, forecast)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'housebudget_forecast.csv'; a.click(); URL.revokeObjectURL(url)
  }

  function tooltipCurrencyFormatter(value: ValueType): string {
    const num = typeof value === 'number' ? value : Number(value)
    return currency(num)
  }

  const importFromLocal = async () => {
    if (!userId) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as PersistedState
      if (!saved?.entries?.length) return
      const rows = saved.entries.map(e => ({ user_id: userId, type: e.type, name: e.name, category: e.category, amount: e.amount }))
      const { error } = await supabase.from('entries').insert(rows)
      if (!error) await loadEntries()
    } catch {}
  }

  return (
    <div className="min-h-screen w-full bg-white px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">HouseBudget AI — MVP</h1>
          <div className="flex gap-2 items-center">
            {userId ? (
              <>
                <Button variant="outline" onClick={importFromLocal} title="Importar datos locales a mi cuenta">
                  <Upload className="w-4 h-4 mr-2"/> Importar locales
                </Button>
                <Button variant="outline" onClick={async()=>{ await supabase.auth.signOut(); }}>
                  <LogOut className="w-4 h-4 mr-2"/> Salir
                </Button>
              </>
            ) : (
              <Button asChild variant="default">
                <Link href="/login"><LogIn className="w-4 h-4 mr-2"/> Entrar</Link>
              </Button>
            )}
            <Button variant="outline" onClick={resetAll}>
              <RefreshCw className="w-4 h-4 mr-2" /> Reset
            </Button>
            <Button variant="outline" onClick={downloadCSV}>
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Entradas mensuales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={newEntry.type} onValueChange={(v: string) => setNewEntry(n => ({ ...n, type: v as 'income' | 'expense' }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Ingreso</SelectItem>
                      <SelectItem value="expense">Gasto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Nombre</Label>
                  <Input value={newEntry.name} onChange={e => setNewEntry(n => ({ ...n, name: e.target.value }))} placeholder="Ej. Hipoteca / Nómina" />
                </div>
                <div>
                  <Label>Categoría</Label>
                  <Input value={newEntry.category} onChange={e => setNewEntry(n => ({ ...n, category: e.target.value }))} placeholder="Ej. Vivienda" />
                </div>
                <div>
                  <Label>Importe (€)</Label>
                  <Input type="number" inputMode="decimal" value={newEntry.amount} onChange={e => setNewEntry(n => ({ ...n, amount: Number(e.target.value) }))} />
                </div>
                <div className="md:col-span-5">
                  <Button className="w-full" onClick={addEntry}>
                    <Plus className="w-4 h-4 mr-2" /> Añadir
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {state.entries.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aún no hay entradas. Añade ingresos y gastos para comenzar.</p>
                )}
                {state.entries.map(e => (
                  <div key={e.id} className="grid grid-cols-12 gap-2 items-center border rounded-xl p-3">
                    <div className="col-span-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${e.type === 'income' ? 'bg-green-100' : 'bg-red-100'}`}>
                        {e.type === 'income' ? 'Ingreso' : 'Gasto'}
                      </span>
                    </div>
                    <div className="col-span-4 font-medium">{e.name}</div>
                    <div className="col-span-3 text-sm text-muted-foreground">{e.category}</div>
                    <div className="col-span-2 text-right font-semibold">{currency(e.amount)}</div>
                    <div className="col-span-1 text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeEntry(e.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parámetros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Saldo inicial (€)</Label>
                <Input type="number" inputMode="decimal" value={state.startingBalance} onChange={e => setState(s => ({ ...s, startingBalance: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Inflación mensual esperada en gastos (%)</Label>
                <Input type="number" inputMode="decimal" step={0.1} value={state.inflationPct} onChange={e => setState(s => ({ ...s, inflationPct: Number(e.target.value) }))} />
                <p className="text-xs text-muted-foreground">0.2% ≈ 2.4% anual.</p>
              </div>
              <div className="space-y-2">
                <Label>Horizonte (meses)</Label>
                <Input type="number" inputMode="numeric" value={state.horizonMonths} onChange={e => setState(s => ({ ...s, horizonMonths: Math.max(1, Number(e.target.value)) }))} />
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Ingresos/mes</span><strong>{currency(monthlyIncome)}</strong></div>
                <div className="flex justify-between"><span>Gastos/mes</span><strong>{currency(monthlyExpense)}</strong></div>
                <div className="flex justify-between"><span>Neto/mes</span><strong className={monthlyNet>=0?'text-green-700':'text-red-700'}>{currency(monthlyNet)}</strong></div>
                <div className="flex justify-between"><span>Neto 12 meses</span><strong className={total12mNet>=0?'text-green-700':'text-red-700'}>{currency(total12mNet)}</strong></div>
                {breakEvenMonth >= 0 && (
                  <div className="flex justify-between"><span>Mes en que el saldo cae <span className="italic">por debajo de 0</span></span><strong>{breakEvenMonth + 1}</strong></div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Previsión (saldo acumulado)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#374151" />
                  <YAxis tickFormatter={(v) => v.toLocaleString('es-ES')} stroke="#374151" />
                  <Tooltip formatter={tooltipCurrencyFormatter} />
                  <Legend />
                  <Line type="monotone" dataKey="income" name="Ingresos" strokeWidth={2} dot={false} stroke="#10b981" />
                  <Line type="monotone" dataKey="expense" name="Gastos" strokeWidth={2} dot={false} stroke="#ef4444" />
                  <Line type="monotone" dataKey="balance" name="Saldo" strokeWidth={3} dot={false} stroke="#3b82f6" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen inteligente (explicación en lenguaje natural)</CardTitle>
          </CardHeader>
          <CardContent>
            <SmartSummary forecast={forecast} monthlyIncome={monthlyIncome} monthlyExpense={monthlyExpense} inflationPct={state.inflationPct} />
          </CardContent>
        </Card>

        <footer className="text-xs text-center text-muted-foreground pt-4">
          Hecho con ❤️ por Héctor. Datos guardados {userId ? 'en la nube (Supabase)' : 'en este navegador' }.
        </footer>
      </div>
    </div>
  )
}

function SmartSummary({ forecast, monthlyIncome, monthlyExpense, inflationPct }: {
  forecast: { month: string; income: number; expense: number; net: number; balance: number }[]
  monthlyIncome: number
  monthlyExpense: number
  inflationPct: number
}) {
  const first = forecast[0]
  const last = forecast[forecast.length - 1]
  const trend = last.balance >= 0
    ? `Tu saldo acumulado se mantiene positivo tras ${forecast.length} meses.`
    : `Ojo: tu saldo caería por debajo de 0 tras ${forecast.findIndex(r => r.balance < 0) + 1} meses.`
  return (
    <div className="space-y-2">
      <p>
        Ingresos mensuales actuales: <strong>{currency(monthlyIncome)}</strong>. Gastos mensuales actuales: <strong>{currency(monthlyExpense)}</strong>.
        Se ha aplicado una inflación mensual del <strong>{inflationPct}%</strong> a los gastos.
      </p>
      <p>
        {trend} El saldo pasaría de <strong>{currency(first.balance)}</strong> a <strong>{currency(last.balance)}</strong>.
      </p>
      <ul className="list-disc ml-6 text-sm">
        <li>Si tus gastos suben por encima de lo previsto, ajusta la inflación mensual.</li>
        <li>Registra gastos variables como suscripciones, ocio y transporte.</li>
        <li>Configura un saldo inicial realista (ahorros en cuenta).</li>
      </ul>
    </div>
  )
}
```

---

### Importante
- **Crea/actualiza exactamente estos 3 archivos en esas rutas.**
- El warning de ESLint por `_name` ya no debería salir porque he eliminado ese parámetro.
- Si tu proyecto no tiene los componentes de shadcn, recuerda añadirlos:
  ```bash
  npx shadcn@latest init
  npx shadcn@latest add button card input label select
  ```
- Asegúrate de que tus variables de entorno ya están puestas en Vercel (Development/Preview/Production) y haz **Redeploy**.
