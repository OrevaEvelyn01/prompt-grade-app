'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSessions, gradeSession, generateResponses } from '@/api/experimentApi'

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

// FIX: helper to safely split comma strings into arrays
function splitList(str) {
  if (!str) return []
  return str.split(',').filter(Boolean)
}

function ScoreDisplay({ avg }) {
  if (!avg) return null
  const color =
    avg >= 7 ? 'text-emerald-400' : avg >= 4 ? 'text-amber-400' : 'text-rose-400'
  return (
    <div className="text-right shrink-0">
      <p className={`font-mono text-3xl font-bold ${color}`}>{avg}</p>
      <p className="font-mono text-xs text-[var(--text-muted)]">avg score</p>
    </div>
  )
}

// FIX: pass handlers down as props so SessionCard can call them
function SessionCard({ session, actionLoading, onGrade, onRegenerate }) {
  const hasScores = !!session.avg_score

  // FIX: parse comma strings into arrays before using them
  const techniques = splitList(session.techniques)
  const domains = splitList(session.domains)
  const modifiers = splitList(session.modifiers)

  const expectedOutputs = techniques.length * domains.length * session.runs * (modifiers.length > 0 ? 2 : 1)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-bright)] transition-all p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Name + score badge inline */}
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="font-bold text-white text-lg truncate">
              {session.session_name}
            </h2>
            {hasScores && (
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                  session.avg_score >= 7
                    ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                    : session.avg_score >= 4
                    ? 'text-amber-400 border-amber-400/30 bg-amber-400/10'
                    : 'text-rose-400 border-rose-400/30 bg-rose-400/10'
                }`}
              >
                {session.avg_score}/10
              </span>
            )}
          </div>

          {/* Meta */}
          <p className="font-mono text-xs text-[var(--text-muted)] mb-3">
            {new Date(session.timestamp).toLocaleString()} &nbsp;·&nbsp;
            {session.total_outputs ?? 0} outputs &nbsp;·&nbsp;
            {session.runs} run{session.runs !== 1 ? 's' : ''}/prompt
          </p>

          {/* Technique + domain tags */}
          <div className="flex flex-wrap gap-2">
            {techniques.map((t) => (
              <span key={t} className="tag text-xs">
                {TECHNIQUE_LABELS[t] || t}
              </span>
            ))}
            {domains.map((d) => (
              <span key={d} className="tag tag-domain text-xs">
                {DOMAIN_LABELS[d] || d}
              </span>
            ))}
          </div>
        </div>

        <ScoreDisplay avg={session.avg_score} />
      </div>

      {/* Action links */}
      <div className="flex gap-3 mt-4 pt-4 border-t border-[var(--border)] flex-wrap">
        <Link
          href={`/outputs/${session.id}`}
          className="px-4 py-2 rounded-lg border border-[var(--border-bright)] text-[var(--text-secondary)] font-mono text-xs hover:border-cyan-400 hover:text-cyan-400 transition-all"
        >
          View Outputs
        </Link>
        {session.total_outputs > 0 && session.avg_score == null && (
          <button
            onClick={() => onGrade(session.id)}
            disabled={actionLoading === session.id}
            className="px-4 py-2 rounded-lg border border-cyan-400/30 text-cyan-400 font-mono text-xs hover:bg-cyan-400/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {actionLoading === session.id ? 'Working...' : 'Grade'}
          </button>
        )}
        <button
          onClick={() => onRegenerate(session.id)}
          disabled={actionLoading === session.id}
          className="px-4 py-2 rounded-lg border border-[var(--border-bright)] text-[var(--text-secondary)] font-mono text-xs hover:border-cyan-400 hover:text-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {session.total_outputs === 0
            ? 'Generate outputs'
            : session.total_outputs < expectedOutputs
            ? 'Resume generation'
            : 'Regenerate outputs'}
        </button>
        {hasScores && (
          <Link
            href={`/dashboard/${session.id}`}
            className="px-4 py-2 rounded-lg border border-cyan-400/30 text-cyan-400 font-mono text-xs hover:bg-cyan-400/10 transition-all"
          >
            Dashboard →
          </Link>
        )}
      </div>
    </div>
  )
}

export default function SessionHistoryPage() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  const loadSessions = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getSessions()
      setSessions(data)
    } catch {
      setError('Failed to load sessions. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleRegenerateSession = async (sessionId) => {
    setActionLoading(sessionId)
    setError('')
    try {
      await generateResponses(sessionId)
      await loadSessions()
    } catch (err) {
      setError(err.message || 'Regeneration failed. Is the backend running?')
    } finally {
      setActionLoading(null)
    }
  }

  const handleGradeSession = async (sessionId) => {
    setActionLoading(sessionId)
    setError('')
    try {
      await gradeSession(sessionId)
      await loadSessions()
    } catch (err) {
      setError(err.message || 'Grading failed. Is the backend running?')
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = sessions
    .filter((s) =>
      s.session_name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.timestamp) - new Date(a.timestamp)
      if (sortBy === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp)
      if (sortBy === 'score') return (b.avg_score ?? 0) - (a.avg_score ?? 0)
      return 0
    })

  return (
    <div className="min-h-screen bg-[#04080f] grid-bg pb-20">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-xs text-cyan-400 tracking-widest mb-2">
              EXPERIMENT HISTORY
            </p>
            <h1 className="text-3xl font-extrabold text-white">All Sessions</h1>
          </div>
          <Link
            href="/setup"
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 text-black font-bold font-mono text-sm hover:shadow-[0_0_20px_rgba(0,212,255,0.35)] transition-all self-start md:self-auto"
          >
            + New Experiment
          </Link>
        </div>

        {/* Search + Sort bar */}
        <div className="flex gap-3 mb-6 flex-col sm:flex-row">
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] font-mono text-sm outline-none focus:border-cyan-400 transition-colors placeholder:text-[var(--text-muted)]"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] font-mono text-sm outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score">Highest score</option>
          </select>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-sm font-mono">
            {error}
          </div>
        )}

        {/* Summary strip */}
        {sessions.length > 0 && (
          <div className="flex gap-6 mb-6 px-4 py-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
            {[
              { label: 'Total Sessions', value: sessions.length },
              {
                label: 'Total Outputs',
                value: sessions.reduce((s, x) => s + (x.total_outputs ?? 0), 0),
              },
              {
                label: 'Graded Sessions',
                value: sessions.filter((s) => s.avg_score).length,
              },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-mono text-xs text-[var(--text-muted)]">{stat.label}</p>
                <p className="font-mono text-lg font-bold text-cyan-400">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🧪</p>
            <p className="text-[var(--text-muted)] font-mono text-sm mb-6">
              {search ? 'No sessions match your search.' : 'No sessions yet.'}
            </p>
            {!search && (
              <Link
                href="/setup"
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 text-black font-bold font-mono text-sm"
              >
                Start your first experiment
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                actionLoading={actionLoading}
                onGrade={handleGradeSession}
                onRegenerate={handleRegenerateSession}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}