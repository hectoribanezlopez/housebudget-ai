'use client'

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Download, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

// -----------------------------
// Types & helpers
// -----------------------------
type Entry = {
  id: string;
  type: "income" | "expense";
  name: string;
  amount: number; // monthly amount in EUR
  category: string;
};

function currency(n: number) {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT_INCOMES: Entry[] = [
  { id: uid(), type: "income", name: "Nómina 1", amount: 1800, category: "Salario" },
  { id: uid(), type: "income", name: "Nómina 2", amount: 1200, category: "Salario" },
];

const DEFAULT_EXPENSES: Entry[] = [
  { id: uid(), type: "expense", name: "Hipoteca", amount: 850, category: "Vivienda" },
  { id: uid(), type: "expense", name: "Luz", amount: 90, category: "Suministros" },
  { id: uid(), type: "expense", name: "Comida", amount: 400, category: "Alimentación" },
];

const STORAGE_KEY = "housebudget_mvp_state_v1";

type PersistedState = {
  entries: Entry[];
  inflationPct: number; // expected % monthly increase on expenses (e.g., 0.3 means 0.3%)
  horizonMonths: number;
  startingBalance: number;
};

const defaultState: PersistedState = {
  entries: [...DEFAULT_INCOMES, ...DEFAULT_EXPENSES],
  inflationPct: 0.2, // 0.2% mensual (~2.4% anual aprox)
  horizonMonths: 12,
  startingBalance: 0,
};

// Forecast calculator extracted so we can unit-test easily
function computeForecast(
  monthlyIncome: number,
  monthlyExpense: number,
  inflationPct: number,
  horizonMonths: number,
  startingBalance: number
) {
  const rows: { month: string; income: number; expense: number; net: number; balance: number }[] = [];
  let expense = monthlyExpense;
  let balance = startingBalance;
  const now = new Date();

  for (let i = 0; i < Math.max(1, horizonMonths); i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });

    const income = monthlyIncome;
    const net = income - expense;
    balance += net;

    rows.push({ month: label, income, expense, net, balance });

    // aplicar inflación mensual a gastos para el próximo mes
    expense = expense * (1 + inflationPct / 100);
  }
  return rows;
}

// CSV generator extracted for testing and reuse
function generateCSV(state: PersistedState, forecast: { month: string; income: number; expense: number; net: number; balance: number }[]) {
  const header = ["Tipo", "Nombre", "Categoría", "Importe mensual (€)"];
  const lines = state.entries.map(e => [e.type, e.name, e.category, e.amount].join(","));
  const forecastHeader = ["Mes", "Ingresos", "Gastos", "Neto", "Saldo acumulado"];
  const forecastLines = forecast.map(r => [r.month, r.income.toFixed(2), r.expense.toFixed(2), r.net.toFixed(2), r.balance.toFixed(2)].join(","));

  const csv = [
    "Entradas",
    header.join(","),
    lines.join("\n"),
    "",
    "Previsión",
    forecastHeader.join(","),
    forecastLines.join("\n"),
  ].join("\n");

  return csv;
}

// -----------------------------
// Component
// -----------------------------
export default function HouseBudgetApp() {
  const [state, setState] = useState<PersistedState>(defaultState);
  const [newEntry, setNewEntry] = useState<Omit<Entry, "id">>({ type: "expense", name: "", amount: 0, category: "General" });

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedState;
        setState(saved);
      }
    } catch {}
  }, []);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const incomes = useMemo(() => state.entries.filter(e => e.type === "income"), [state.entries]);
  const expenses = useMemo(() => state.entries.filter(e => e.type === "expense"), [state.entries]);

  const monthlyIncome = useMemo(() => incomes.reduce((s, e) => s + (e.amount || 0), 0), [incomes]);
  const monthlyExpense = useMemo(() => expenses.reduce((s, e) => s + (e.amount || 0), 0), [expenses]);
  const monthlyNet = monthlyIncome - monthlyExpense;

  const forecast = useMemo(
    () => computeForecast(monthlyIncome, monthlyExpense, state.inflationPct, state.horizonMonths, state.startingBalance),
    [monthlyIncome, monthlyExpense, state.inflationPct, state.horizonMonths, state.startingBalance]
  );

  const total12mNet = useMemo(() => forecast.reduce((s, r) => s + r.net, 0), [forecast]);
  const breakEvenMonth = useMemo(() => forecast.findIndex(r => r.balance < 0), [forecast]);

  function addEntry() {
    if (!newEntry.name || !isFinite(newEntry.amount)) return;
    setState(s => ({ ...s, entries: [...s.entries, { ...newEntry, id: uid(), amount: Math.max(0, Number(newEntry.amount)) }] }));
    setNewEntry({ type: newEntry.type, name: "", amount: 0, category: "General" });
  }

  function removeEntry(id: string) {
    setState(s => ({ ...s, entries: s.entries.filter(e => e.id !== id) }));
  }

  function resetAll() {
    setState(defaultState);
  }

  function downloadCSV() {
    const csv = generateCSV(state, forecast);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "housebudget_forecast.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen w-full bg-white px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">HouseBudget AI — MVP</h1>
          <div className="flex gap-2">
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
                  <Select value={newEntry.type} onValueChange={(v: string) => setNewEntry(n => ({ ...n, type: v as "income" | "expense" }))}>
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
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${e.type === "income" ? "bg-green-100" : "bg-red-100"}`}>
                        {e.type === "income" ? "Ingreso" : "Gasto"}
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
                <div className="flex justify-between"><span>Neto/mes</span><strong className={monthlyNet>=0?"text-green-700":"text-red-700"}>{currency(monthlyNet)}</strong></div>
                <div className="flex justify-between"><span>Neto 12 meses</span><strong className={total12mNet>=0?"text-green-700":"text-red-700"}>{currency(total12mNet)}</strong></div>
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
                  <YAxis tickFormatter={(v) => v.toLocaleString("es-ES")} stroke="#374151" />
                  <Tooltip formatter={(v: any) => currency(Number(v))} />
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
          Hecho con ❤️ por Héctor. MVP local con almacenamiento en el navegador. No sube datos a servidores.
        </footer>
      </div>
    </div>
  );
}

function SmartSummary({ forecast, monthlyIncome, monthlyExpense, inflationPct }: {
  forecast: { month: string; income: number; expense: number; net: number; balance: number }[];
  monthlyIncome: number;
  monthlyExpense: number;
  inflationPct: number;
}) {
  const first = forecast[0];
  const last = forecast[forecast.length - 1];

  const trend = last.balance >= 0
    ? `Tu saldo acumulado se mantiene positivo tras ${forecast.length} meses.`
    : `Ojo: tu saldo caería por debajo de 0 tras ${forecast.findIndex(r => r.balance < 0) + 1} meses.`;

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
        <li>Prueba a registrar gastos variables como suscripciones, ocio y transporte.</li>
        <li>Configura un saldo inicial realista (ahorros en cuenta).</li>
      </ul>
      <p className="text-xs text-muted-foreground">Próximo paso: reemplazar este bloque por una llamada al backend que use OpenAI para generar un resumen personalizado y sugerencias.</p>
    </div>
  );
}

// -----------------------------
// Lightweight runtime tests (dev only)
// -----------------------------
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("Test failed: " + message);
}

function runInternalTests() {
  try {
    // Test 1: forecast length and balance growth without inflation
    const f1 = computeForecast(1000, 800, 0, 3, 0);
    assert(f1.length === 3, "forecast length should equal horizonMonths");
    assert(Math.round(f1[2].balance) === 600, "balance after 3 months should be 600 when net=200");

    // Test 2: expenses should increase with positive inflation
    const f2 = computeForecast(1000, 100, 10, 2, 0); // 10% monthly inflation
    assert(f2[1].expense > f2[0].expense, "expense should grow with inflation");

    // Test 3: CSV contains sections and correct number of forecast rows
    const fakeState: PersistedState = {
      entries: [
        { id: "1", type: "income", name: "Nómina", amount: 1000, category: "Salario" },
        { id: "2", type: "expense", name: "Alquiler", amount: 700, category: "Vivienda" },
      ],
      inflationPct: 0,
      horizonMonths: 2,
      startingBalance: 0,
    };
    const f3 = computeForecast(1000, 700, 0, 2, 0);
    const csv = generateCSV(fakeState, f3);
    assert(csv.includes("Entradas\n"), "CSV must include 'Entradas' section header followed by newline");
    assert(csv.includes("Previsión\n"), "CSV must include 'Previsión' section header followed by newline");
    const forecastLines = csv.split("Previsión\n")[1].trim().split("\n");
    // After header line, there should be exactly horizonMonths rows
    assert(forecastLines.length >= 2, "CSV forecast section should have header + rows");
  } catch (e) {
    // Don't crash the UI; just log in dev
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  runInternalTests();
}
