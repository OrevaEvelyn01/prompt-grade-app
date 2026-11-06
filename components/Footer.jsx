import Link from 'next/link'

const NAV_LINKS = [
  { label: 'New Experiment', href: '/setup' },
  { label: 'History', href: '/history' },
]

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-400 to-cyan-700 flex items-center justify-center font-mono font-bold text-xs text-black shrink-0">
            PE
          </div>
          <div>
            <p className="font-mono text-xs text-[var(--text-secondary)] tracking-widest">
              PROMPT_EVAL
            </p>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              Automated Prompt Engineering Benchmark
            </p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-mono text-xs text-[var(--text-muted)] hover:text-cyan-400 transition-colors tracking-wide"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Powered by */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--text-muted)]">Powered by</span>
          <span className="tag text-xs">Gemini</span>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-[var(--border)] px-6 py-3 text-center">
        <p className="font-mono text-xs text-[var(--text-muted)]">
          Built for reproducible AI prompt engineering research.
        </p>
      </div>
    </footer>
  )
}
