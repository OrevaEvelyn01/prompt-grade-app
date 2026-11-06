'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts'
import { getSession, downloadExport } from '@/api/experimentApi'

const TECHNIQUE_LABELS = {
  zero_shot: 'Zero-shot',
  few_shot: 'Few-shot',
  zero_shot_cot: 'ZS-CoT',
  few_shot_cot: 'FS-CoT',
  self_consistency: 'Self-Cons.',
  tree_of_thought: 'ToT',
  step_back: 'Step-back',
  react: 'ReAct',
}

const DOMAIN_LABELS = {
  math: 'Math',
  logic: 'Logic',
  coding: 'Coding',
  conceptual: 'Conceptual',
}

const METRICS = ['accuracy', 'relevance', 'coherence', 'consistency']
const METRIC_COLORS = ['#00d4ff', '#00e5a0', '#ffb020', '#ff4d6d']

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0d1524',
    border: '1px solid #1a2a42',
    borderRadius: 8,
    fontFamily: 'Space Mono, monospace',
    fontSize: 11,
  },
  labelStyle: { color: '#e8f0fe' },
  itemStyle: { color: '#7a9cc0' },
}

const AXIS_TICK = { fill: '#7a9cc0', fontSize: 10, fontFamily: 'Space Mono, monospace' }

function StatCard({ label, value, unit = '', color = 'text-white', small = false }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <p className="font-mono text-xs text-[var(--text-muted)] tracking-widest mb-3">
        {label.toUpperCase()}
      </p>
      <p className={`font-mono font-bold ${small ? 'text-xl' : 'text-3xl'} ${color}`}>
        {value}
        {unit && <span className="text-[var(--text-muted)] text-base">{unit}</span>}
      </p>
    </div>
  )
}

// Aggregate outputs by a key field, averaging all metric scores
function aggregateBy(outputs, key, labelMap) {
  const keys = [...new Set(outputs.map((o) => o[key]))]
  return keys.map((k) => {
    const group = outputs.filter((o) => o[key] === k)
    const entry = { name: labelMap[k] || k }
    METRICS.forEach((m) => {
      entry[m] = parseFloat(
        (group.reduce((s, o) => s + o.scores[m], 0) / group.length).toFixed(2)
      )
    })
    entry.overall = parseFloat(
      (METRICS.reduce((s, m) => s + entry[m], 0) / METRICS.length).toFixed(2)
    )
    return entry
  })
}

function aggregateByTechniqueModifier(outputs) {
  const groups = {}
  outputs.forEach((o) => {
    const key = `${o.technique}||${o.is_modified}`
    if (!groups[key]) {
      groups[key] = {
        technique: o.technique,
        is_modified: o.is_modified,
        counts: 0,
        metrics: {
          accuracy: 0,
          relevance: 0,
          coherence: 0,
          consistency: 0,
        },
      }
    }
    groups[key].counts += 1
    METRICS.forEach((m) => {
      groups[key].metrics[m] += o.scores[m]
    })
  })

  return Object.values(groups).map((group) => {
    const label = `${TECHNIQUE_LABELS[group.technique] || group.technique} ${group.is_modified === 'yes' ? '(With Modifier)' : '(Without Modifier)'}`
    const entry = {
      name: label,
      technique: group.technique,
      is_modified: group.is_modified,
    }
    METRICS.forEach((m) => {
      entry[m] = parseFloat((group.metrics[m] / group.counts).toFixed(2))
    })
    entry.overall = parseFloat(
      (METRICS.reduce((s, m) => s + entry[m], 0) / METRICS.length).toFixed(2)
    )
    return entry
  })
}

export default function DashboardPage() {
  const { sessionId } = useParams()

  const [session, setSession] = useState(null)
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getSession(sessionId)
        setSession(data.session)
        // Only keep outputs that have been graded
        setOutputs(data.outputs.filter((o) => o.scores))
      } catch {
        setError('Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sessionId])

  // ── Derived data ──────────────────────────────────────────────────────────

  const techniqueModifierData = aggregateByTechniqueModifier(outputs).sort(
    (a, b) => b.overall - a.overall
  )
  const domainData = aggregateBy(outputs, 'domain', DOMAIN_LABELS)

  const techniqueKeys = [...new Set(outputs.map((o) => o.technique))]
  const modifierComparisonData = techniqueKeys.map((technique) => {
    const withModifier = techniqueModifierData.find(
      (item) => item.technique === technique && item.is_modified === 'yes'
    )
    const withoutModifier = techniqueModifierData.find(
      (item) => item.technique === technique && item.is_modified !== 'yes'
    )

    return {
      technique: TECHNIQUE_LABELS[technique] || technique,
      withOverall: withModifier?.overall || 0,
      withoutOverall: withoutModifier?.overall || 0,
      withAccuracy: withModifier?.accuracy || 0,
      withoutAccuracy: withoutModifier?.accuracy || 0,
      withRelevance: withModifier?.relevance || 0,
      withoutRelevance: withoutModifier?.relevance || 0,
      withCoherence: withModifier?.coherence || 0,
      withoutCoherence: withoutModifier?.coherence || 0,
      withConsistency: withModifier?.consistency || 0,
      withoutConsistency: withoutModifier?.consistency || 0,
    }
  })

  const bestTechnique = techniqueModifierData[0]
  const bestTechniqueWithModifier = techniqueModifierData.find((item) => item.is_modified === 'yes')
  const bestTechniqueWithoutModifier = techniqueModifierData.find((item) => item.is_modified !== 'yes')
  const mostConsistent = [...techniqueModifierData].sort((a, b) => b.consistency - a.consistency)[0]

  const overallAvg =
    outputs.length > 0
      ? (
          outputs.reduce(
            (s, o) => s + METRICS.reduce((ms, m) => ms + o.scores[m], 0) / METRICS.length,
            0
          ) / outputs.length
        ).toFixed(2)
      : '—'

  const radarData = METRICS.map((m) => ({
    metric: m.charAt(0).toUpperCase() + m.slice(1),
    value: bestTechnique ? bestTechnique[m] : 0,
  }))

  const scoreColor = (v) =>
    v >= 7 ? 'text-emerald-400' : v >= 4 ? 'text-amber-400' : 'text-rose-400'

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#04080f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-mono text-sm text-[var(--text-secondary)]">Building dashboard...</p>
        </div>
      </div>
    )
  }

  if (outputs.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-[#04080f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-[var(--text-muted)] font-mono text-sm mb-6">
            No graded outputs yet.
          </p>
          <Link
            href={`/outputs/${sessionId}`}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 text-black font-bold font-mono text-sm"
          >
            ← Go grade the outputs first
          </Link>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#04080f] grid-bg pb-20">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-xs text-cyan-400 tracking-widest mb-2">
              RESULTS DASHBOARD
            </p>
            <h1 className="text-3xl font-extrabold text-white mb-1">
              {session?.session_name}
            </h1>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {outputs.length} graded outputs
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Link
              href={`/outputs/${sessionId}`}
              className="px-4 py-2 rounded-lg border border-[var(--border-bright)] text-[var(--text-secondary)] font-mono text-sm hover:border-cyan-400 hover:text-cyan-400 transition-all"
            >
              ← Outputs
            </Link>
            <button
              onClick={() => downloadExport(sessionId, 'csv')}
              className="px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-400 font-mono text-sm hover:bg-emerald-400/10 transition-all"
            >
              Export CSV
            </button>
            <button
              onClick={() => downloadExport(sessionId, 'pdf')}
              className="px-4 py-2 rounded-lg border border-amber-500/40 text-amber-400 font-mono text-sm hover:bg-amber-400/10 transition-all"
            >
              Export PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-sm font-mono">
            {error}
          </div>
        )}

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard label="Avg Score" value={overallAvg} unit="/10" color="text-cyan-400" />
          <StatCard label="Total Outputs" value={outputs.length} color="text-white" />
          <StatCard
            label="Best Technique"
            value={bestTechnique?.name || '—'}
            color="text-emerald-400"
            small
          />
          <StatCard
            label="Best With Modifier"
            value={bestTechniqueWithModifier?.name || '—'}
            color="text-purple-400"
            small
          />
          <StatCard
            label="Best Without Modifier"
            value={bestTechniqueWithoutModifier?.name || '—'}
            color="text-amber-400"
            small
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          {/* Technique comparison bar chart */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="font-mono text-xs text-[var(--text-muted)] tracking-widest mb-5">
              TECHNIQUE COMPARISON
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={techniqueModifierData}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2a42" />
                <XAxis dataKey="name" tick={AXIS_TICK} />
                <YAxis domain={[0, 10]} tick={AXIS_TICK} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend
                  wrapperStyle={{ fontFamily: 'Space Mono, monospace', fontSize: 10 }}
                />
                {METRICS.map((m, i) => (
                  <Bar key={m} dataKey={m} fill={METRIC_COLORS[i]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Radar — best technique profile */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <p className="font-mono text-xs text-[var(--text-muted)] tracking-widest mb-1">
              BEST TECHNIQUE PROFILE
            </p>
            <p className="font-mono text-xs text-cyan-400 mb-4">{bestTechnique?.name}</p>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1a2a42" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#7a9cc0', fontSize: 11, fontFamily: 'Space Mono, monospace' }}
                />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#00d4ff"
                  fill="#00d4ff"
                  fillOpacity={0.15}
                />
                <Tooltip {...TOOLTIP_STYLE} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Modifier comparison chart */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-6">
          <p className="font-mono text-xs text-[var(--text-muted)] tracking-widest mb-5">
            MODIFIER IMPACT — OVERALL AVERAGE
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={modifierComparisonData}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2a42" />
              <XAxis dataKey="technique" tick={AXIS_TICK} />
              <YAxis domain={[0, 10]} tick={AXIS_TICK} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend
                wrapperStyle={{ fontFamily: 'Space Mono, monospace', fontSize: 10 }}
              />
              <Bar dataKey="withOverall" name="With Modifier" fill="#00d4ff" radius={[3, 3, 0, 0]} />
              <Bar dataKey="withoutOverall" name="Without Modifier" fill="#ffb020" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Domain performance bar chart */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-6">
          <p className="font-mono text-xs text-[var(--text-muted)] tracking-widest mb-5">
            DOMAIN PERFORMANCE
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={domainData}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2a42" />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis domain={[0, 10]} tick={AXIS_TICK} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend
                wrapperStyle={{ fontFamily: 'Space Mono, monospace', fontSize: 10 }}
              />
              {METRICS.map((m, i) => (
                <Bar key={m} dataKey={m} fill={METRIC_COLORS[i]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Full scores table */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <p className="font-mono text-xs text-[var(--text-muted)] tracking-widest">
              FULL SCORES TABLE
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Technique', 'Domain', 'Run', 'Modifier', 'Accuracy', 'Relevance', 'Coherence', 'Consistency', 'Avg'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] tracking-widest whitespace-nowrap"
                      >
                        {h.toUpperCase()}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {outputs.map((o) => {
                  const avg = (
                    METRICS.reduce((s, m) => s + o.scores[m], 0) / METRICS.length
                  ).toFixed(1)
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-[var(--border)] hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="tag text-xs">
                          {TECHNIQUE_LABELS[o.technique] || o.technique}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="tag tag-domain text-xs">
                          {DOMAIN_LABELS[o.domain] || o.domain}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                        {o.run_number}
                      </td>
                      <td className="px-4 py-3">
                        {o.is_modified === 'yes' ? (
                          <span className="inline-block px-2 py-1 rounded text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            WITH MODIFIER
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            WITHOUT MODIFIER
                          </span>
                        )}
                      </td>
                      {METRICS.map((m) => (
                        <td key={m} className="px-4 py-3 font-mono text-sm text-[var(--text-primary)]">
                          {o.scores[m]}
                        </td>
                      ))}
                      <td className={`px-4 py-3 font-mono text-sm font-bold ${scoreColor(parseFloat(avg))}`}>
                        {avg}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
