'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSession, gradeSession, generateResponses, regenerateOutput } from '@/api/experimentApi'

const TECHNIQUE_LABELS = {
  zero_shot: 'Zero-shot',
  few_shot: 'Few-shot',
  zero_shot_cot: 'Zero-shot CoT',
  few_shot_cot: 'Few-shot CoT',
  self_consistency: 'Self-Consistency',
  tree_of_thought: 'Tree-of-Thought',
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

// Helper: backend sometimes returns arrays, sometimes comma strings — handle both
function toList(val) {
  if (!val) return []
  if (Array.isArray(val)) return val.filter(Boolean)
  return val.split(',').filter(Boolean)
}

function ScorePill({ label, value }) {
  const color =
    value >= 7
      ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30'
      : value >= 4
      ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
      : 'bg-rose-400/10 text-rose-400 border-rose-400/30'

  return (
    <span className={`font-mono text-xs px-2 py-0.5 rounded border ${color}`}>
      {label[0].toUpperCase()}: {value}
    </span>
  )
}

function OutputCard({ output, expanded, onToggle, onRegenerate, regenerating }) {
  const scores = output.scores
  const avg = scores
    ? (METRICS.reduce((s, m) => s + scores[m], 0) / METRICS.length).toFixed(1)
    : null
  const avgColor =
    avg >= 7 ? 'text-emerald-400' : avg >= 4 ? 'text-amber-400' : 'text-rose-400'
  const isError =
    !output.response ||
    output.response.toLowerCase().startsWith('generation error:')
  const regenerateLabel = isError ? 'Retry response' : 'Regenerate response'

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
      {/* Run header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs text-[var(--text-muted)]">
            RUN {output.run_number}
          </span>
          {avg && (
            <span className={`font-mono text-xs font-bold ${avgColor}`}>
              AVG {avg}/10
            </span>
          )}
          {scores &&
            METRICS.map((m) => (
              <ScorePill key={m} label={m} value={scores[m]} />
            ))}
        </div>
        <span className="text-[var(--text-muted)] text-xs ml-2 shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {isError && (
              <p className="font-mono text-xs text-rose-400">
                Response missing or errored. You can retry this output.
              </p>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRegenerate(output.id)
              }}
              disabled={regenerating}
              className="self-start sm:self-auto px-3 py-2 rounded-lg border border-[var(--border-bright)] text-[var(--text-secondary)] font-mono text-xs hover:border-cyan-400 hover:text-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {regenerating ? 'Regenerating...' : regenerateLabel}
            </button>
          </div>
          <div>
            <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] mb-2">
              PROMPT
            </p>
            <pre className="text-xs text-[var(--text-secondary)] bg-black/30 rounded-lg p-3 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {output.prompt}
            </pre>
          </div>

          <div>
            <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] mb-2">
              RESPONSE
            </p>
            <pre className="text-sm text-[var(--text-primary)] bg-black/20 rounded-lg p-3 leading-relaxed whitespace-pre-wrap break-words">
              {output.response}
            </pre>
          </div>

          {scores?.justification && (
            <div>
              <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] mb-2">
                JUDGE JUSTIFICATION
              </p>
              <p className="text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 leading-relaxed">
                {scores.justification}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function OutputPage() {
  const { sessionId } = useParams()
  const router = useRouter()

  const [session, setSession] = useState(null)
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(true)
  const [grading, setGrading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regeneratingOutputId, setRegeneratingOutputId] = useState(null)
  const [error, setError] = useState('')
  const [filterTechnique, setFilterTechnique] = useState('all')
  const [filterDomain, setFilterDomain] = useState('all')
  const [filterModified, setFilterModified] = useState('all') // FIX: new modifier filter
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [checking, setChecking] = useState(false)
  const pollRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const loadSession = useCallback(async () => {
    // Guard: don't fire if sessionId is missing
    if (!sessionId || sessionId === 'undefined') {
      setLoading(false)
      return null
    }
    try {
      const data = await getSession(sessionId)
      setSession(data.session)
      setOutputs(data.outputs)
      setError('')
      return data
    } catch {
      setError('Failed to load session. Is the backend running?')
      return null
    } finally {
      setLoading(false)
      setChecking(false)
    }
  }, [sessionId])

  const calcExpected = (sess) => {
    if (!sess) return 0
    return toList(sess.techniques).length *
      toList(sess.domains).length *
      sess.runs *
      (toList(sess.modifiers).length > 0 ? 2 : 1)
  }

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      const data = await loadSession()
      if (!data) return
      if (data.outputs.length >= calcExpected(data.session) && calcExpected(data.session) > 0) {
        stopPolling()
      }
    }, 5000)
  }, [loadSession])

  const handleCheckStatus = async () => {
    setChecking(true)
    await loadSession()
  }

  useEffect(() => {
    loadSession().then((data) => {
      if (!data) return
      const exp = calcExpected(data.session)
      if (data.outputs.length < exp || exp === 0) {
        startPolling()
      }
    })
    return () => stopPolling()
  }, [sessionId])

  const handleGrade = async () => {
    setGrading(true)
    setError('')
    try {
      await gradeSession(sessionId)
      router.push(`/dashboard/${sessionId}`)
    } catch (err) {
      setError(err.message || 'Grading failed. Is the backend running?')
      setGrading(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    setError('')
    try {
      await generateResponses(sessionId)
      setError('Regeneration started in background. Refresh the page after a moment.')
    } catch (err) {
      setError(err.message || 'Regeneration failed. Is the backend running?')
    } finally {
      setRegenerating(false)
    }
  }

  const handleRegenerateOutput = async (outputId) => {
    setRegeneratingOutputId(outputId)
    setError('')
    try {
      await regenerateOutput(outputId)
      await loadSession()
    } catch (err) {
      setError(err.message || 'Output regeneration failed. Is the backend running?')
    } finally {
      setRegeneratingOutputId(null)
    }
  }

  const toggleExpand = (id) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const techniques = [...new Set(outputs.map((o) => o.technique))]
  const domains = [...new Set(outputs.map((o) => o.domain))]
  const hasScores = outputs.some((o) => o.scores)

  // FIX: split comma-separated strings before using .length
  const expectedOutputs = session
    ? toList(session.techniques).length *
      toList(session.domains).length *
      session.runs *
      (toList(session.modifiers).length > 0 ? 2 : 1)
    : 0

  const generationInProgress = session && outputs.length > 0 && outputs.length < expectedOutputs

  // FIX: also filter by is_modified
  const filtered = outputs.filter((o) => {
    if (filterTechnique !== 'all' && o.technique !== filterTechnique) return false
    if (filterDomain !== 'all' && o.domain !== filterDomain) return false
    if (filterModified !== 'all') {
      const modVal = o.is_modified || 'no'
      if (filterModified === 'yes' && modVal !== 'yes') return false
      if (filterModified === 'no' && modVal !== 'no') return false
    }
    return true
  })

  // FIX: Group: technique → domain → modifier_key → runs[]
  const grouped = filtered.reduce((acc, o) => {
    const modKey = (o.is_modified || 'no') === 'yes' ? 'with_modifier' : 'no_modifier'
    if (!acc[o.technique]) acc[o.technique] = {}
    if (!acc[o.technique][o.domain]) acc[o.technique][o.domain] = {}
    if (!acc[o.technique][o.domain][modKey]) acc[o.technique][o.domain][modKey] = []
    acc[o.technique][o.domain][modKey].push(o)
    return acc
  }, {})

  // Check if this session uses modifiers at all (to decide whether to show the modifier filter)
  const sessionHasModifiers = session &&
    session.modifiers &&
    toList(session.modifiers).length > 0

  if (loading) {
    return (
      <div className="min-h-screen bg-[#04080f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-mono text-sm text-[var(--text-secondary)]">Loading session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#04080f] grid-bg pb-20">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-xs text-cyan-400 tracking-widest mb-2">
              GENERATED OUTPUTS
            </p>
            <h1 className="text-3xl font-extrabold text-white mb-1">
              {session?.session_name || 'Session'}
            </h1>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {outputs.length} outputs · {techniques.length} techniques · {domains.length} domains
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            {hasScores && (
              <Link
                href={`/dashboard/${sessionId}`}
                className="px-5 py-2.5 rounded-lg border border-[var(--border-bright)] text-[var(--text-secondary)] font-mono text-sm hover:border-cyan-400 hover:text-cyan-400 transition-all"
              >
                View Dashboard →
              </Link>
            )}
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="px-5 py-2.5 rounded-lg border border-[var(--border-bright)] text-[var(--text-secondary)] font-mono text-sm hover:border-cyan-400 hover:text-cyan-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {checking ? 'Checking...' : 'Check Status'}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-5 py-2.5 rounded-lg border border-[var(--border-bright)] text-[var(--text-secondary)] font-mono text-sm hover:border-cyan-400 hover:text-cyan-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {regenerating
                ? 'Regenerating...'
                : outputs.length === 0
                ? 'Generate outputs'
                : generationInProgress
                ? 'Resume generation'
                : 'Regenerate outputs'}
            </button>
            <button
              onClick={handleGrade}
              disabled={grading || outputs.length === 0 || generationInProgress}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 text-black font-bold font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(0,212,255,0.35)] transition-all"
            >
              {grading ? 'Grading...' : `Grade with Gemini (${outputs.length})`}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-sm font-mono">
            {error}
          </div>
        )}

        {outputs.length === 0 && !loading && (
          <div className="mb-6 p-4 rounded-lg bg-cyan-400/5 border border-cyan-400/30 text-cyan-400 text-sm font-mono flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Generating prompts and responses... This may take a few minutes.</span>
          </div>
        )}

        {generationInProgress && outputs.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-cyan-400/5 border border-cyan-400/30 text-cyan-400 text-sm font-mono flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>
                Generation in progress: {outputs.length}/{expectedOutputs} outputs completed.
              </span>
            </div>
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="px-3 py-1 rounded border border-cyan-400/50 text-cyan-400 text-xs hover:bg-cyan-400/10 disabled:opacity-40 transition-all"
            >
              {checking ? 'Checking...' : 'Check now'}
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8 items-center">
          <span className="font-mono text-xs text-[var(--text-muted)] tracking-widest">
            FILTER:
          </span>

          <select
            value={filterTechnique}
            onChange={(e) => setFilterTechnique(e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] font-mono outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="all">All Techniques</option>
            {techniques.map((t) => (
              <option key={t} value={t}>
                {TECHNIQUE_LABELS[t] || t}
              </option>
            ))}
          </select>

          <select
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] font-mono outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="all">All Domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABELS[d] || d}
              </option>
            ))}
          </select>

          {/* FIX: modifier filter — only shows if session uses modifiers */}
          {sessionHasModifiers && (
            <select
              value={filterModified}
              onChange={(e) => setFilterModified(e.target.value)}
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] font-mono outline-none focus:border-cyan-400 transition-colors"
            >
              <option value="all">With &amp; Without Modifier</option>
              <option value="no">No Modifier Only</option>
              <option value="yes">With Modifier Only</option>
            </select>
          )}

          <button
            onClick={() => setExpandedIds(new Set(filtered.map((o) => o.id)))}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] font-mono text-xs hover:border-cyan-400 hover:text-cyan-400 transition-all"
          >
            Expand All
          </button>
          <button
            onClick={() => setExpandedIds(new Set())}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] font-mono text-xs hover:border-cyan-400 hover:text-cyan-400 transition-all"
          >
            Collapse All
          </button>

          <span className="font-mono text-xs text-[var(--text-muted)] ml-auto">
            {filtered.length} outputs shown
          </span>
        </div>

        {/* Grouped output tree */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 font-mono text-sm text-[var(--text-muted)]">
            No outputs match the selected filters.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([technique, domainMap]) => (
              <div
                key={technique}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
              >
                {/* Technique header */}
                <div className="px-5 py-3 border-b border-[var(--border)] bg-cyan-400/5 flex items-center gap-3">
                  <span className="tag">{TECHNIQUE_LABELS[technique] || technique}</span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {Object.values(domainMap).flatMap((m) => Object.values(m).flat()).length} outputs
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-5">
                  {Object.entries(domainMap).map(([domain, modifierMap]) => (
                    <div key={domain}>
                      {/* Domain label */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="tag tag-domain">
                          {DOMAIN_LABELS[domain] || domain}
                        </span>
                      </div>

                      {/* FIX: split by modifier key inside each domain */}
                      <div className="flex flex-col gap-4 pl-3 border-l border-[var(--border)]">
                        {Object.entries(modifierMap).map(([modKey, runs]) => (
                          <div key={modKey}>
                            {/* Modifier badge */}
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`font-mono text-xs px-2 py-0.5 rounded border ${
                                  modKey === 'with_modifier'
                                    ? 'bg-amber-400/10 text-amber-400 border-amber-400/30'
                                    : 'bg-slate-400/10 text-slate-400 border-slate-400/30'
                                }`}
                              >
                                {modKey === 'with_modifier' ? 'WITH MODIFIER' : 'NO MODIFIER'}
                              </span>
                              <span className="font-mono text-xs text-[var(--text-muted)]">
                                {runs.length} run{runs.length !== 1 ? 's' : ''}
                              </span>
                            </div>

                            {/* Run cards */}
                            <div className="flex flex-col gap-2">
                              {[...runs]
                                .sort((a, b) => a.run_number - b.run_number)
                                .map((output) => (
                                  <OutputCard
                                    key={output.id}
                                    output={output}
                                    expanded={expandedIds.has(output.id)}
                                    onToggle={() => toggleExpand(output.id)}
                                    onRegenerate={handleRegenerateOutput}
                                    regenerating={regeneratingOutputId === output.id}
                                  />
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}