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
// Tipos y helpers
// -----------------------------
type Entry = {
  id: string
  type: 'income' | 'expense'
  name: string
  amount: number
  category: string
}

function currency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

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
  inflationPct: number
  horizonMonths: number
  startingBalance: number
}

const defaultState: PersistedState = {
  entries: [...DEFAULT_INCOMES, ...DEFAULT_EXPENSES],
  inflationPct: 0.2,
  horizonMonths: 12,
  startingBalance: 0,
}

// -----------------------------
// Forecast calculator
// -----------------------------
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

// -----------------------------
// CSV generator
// -----------------------------
function generateCSV(state: PersistedState, forecast: { month: string; income: number; expense: number; net: number; balance: number }[]) {
  const header = ['Tipo', 'Nombre', 'Categoría', 'Importe mensual (€)']
  const lines = state.entries.map(e => [e.type, e.name, e.category, e.amount].join(','))
  const forecastHeader = ['Mes', 'Ingresos', 'Gastos', 'Neto', 'Saldo acumulado']
  const forecastLines = forecast.map(r =>
    [r.month, r.income.toFixed(2), r.expense.toFixed(2), r.net.toFixed(2), r.balance.toFixed(2)].join(',')
  )
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

// -----------------------------
// MAIN COMPONENT
// -----------------------------
export default function HouseBudgetApp() {
  const [state, setState] = useState<PersistedState>(defaultState)
  const [newEntry, setNewEntry] = useState<Omit<Entry, 'id'>>({
    type: 'expense',
    name: '',
    amount: 0,
    category: 'General',
  })
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = supabaseBrowser()

  // --- AUTH ---
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) setUserId(data.user?.id ?? null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  // --- LOAD ---
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
          entries: data.map(r => ({
            id: String(r.id),
            type: r.type as 'income' | 'expense',
            name: String(r.name),
            category: String(r.category ?? 'General'),
            amount: Number(r.amount),
          })),
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

  // --- SAVE LOCAL (guest) ---
  useEffect(() => {
    if (!userId) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
    }
  }, [state, userId])

  // --- DERIVED VALUES ---
  const incomes = useMemo(() => state.entries.filter(e => e.type === 'income'), [state.entries])
  const expenses = useMemo(() => state.entries.filter(e => e.type === 'expense'), [state.entries])
  const monthlyIncome = useMemo(() => incomes.reduce((s, e) => s + (e.amount || 0), 0), [incomes])
  const monthlyExpense = useMemo(() => expenses.reduce((s, e) => s + (e.amount || 0), 0), [expenses])
  const monthlyNet = monthlyIncome - monthlyExpense
  const forecast = useMemo(
    () => computeForecast(monthlyIncome, monthlyExpense, state.inflationPct, state.horizonMonths, state.startingBalance),
    [monthlyIncome, monthlyExpense, state.inflationPct, state.horizonMonths, state.startingBalance]
  )
  const total12mNet = useMemo(() => forecast.reduce((s, r) => s + r.net, 0), [forecast])
  const breakEvenMonth = useMemo(() => forecast.findIndex(r => r.balance < 0), [forecast])

  // --- CRUD ---
  async function addEntry() {
    if (!newEntry.name || !isFinite(newEntry.amount)) return
    if (userId) {
      const { error } = await supabase
        .from('entries')
        .insert({ user_id: userId, type: newEntry.type, name: newEntry.name, category: newEntry.category, amount: newEntry.amount })
      if (!error) {
        setNewEntry({ ...newEntry, name: '', amount: 0 })
        await loadEntries()
      }
    } else {
      setState(s => ({
        ...s,
        entries: [...s.entries, { ...newEntry, id: uid(), amount: Math.max(0, Number(newEntry.amount)) }],
      }))
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
    a.href = url
    a.download = 'housebudget_forecast.csv'
    a.click()
    URL.revokeObjectURL(url)
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

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <div className="min-h-screen w-full bg-white px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">HouseBudget AI — MVP</h1>
          <div className="flex gap-2 items-center">
            {userId ? (
              <>
                <Button variant="outline" onClick={importFromLocal}>
                  <Upload className="w-4 h-4 mr-2" /> Importar locales
                </Button>
                <Button variant="outline" onClick={async () => { await supabase.auth.signOut() }}>
                  <LogOut className="w-4 h-4 mr-2" /> Salir
                </Button>
              </>
            ) : (
              <Button asChild variant="default">
                <Link href="/login"><LogIn className="w-4 h-4 mr-2" /> Entrar</Link>
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

        {/* Contenido principal (entradas, parámetros, gráfico, resumen) */}
        {/* ... */}
      </div>
    </div>
  )
}
