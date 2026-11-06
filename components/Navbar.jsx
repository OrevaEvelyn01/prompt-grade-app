"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { label: "New Experiment", path: "/setup" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-[rgba(4,8,15,0.85)] backdrop-blur-md border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-slate-700 text-black font-bold text-xs">
            PE
          </div>

          <span className="text-xs tracking-[0.2em] font-mono text-gray-400">
            PROMPT_EVAL
          </span>
        </Link>

        {/* Links */}
        <div className="flex gap-1">
          {navLinks.map((link) => {
            const active = pathname === link.path;

            return (
              <Link
                key={link.path}
                href={link.path}
                className={`
                  px-4 py-1.5 rounded-md text-xs font-mono tracking-wide transition
                  border
                  ${
                    active
                      ? "text-cyan-400 bg-cyan-400/10 border-cyan-400/20"
                      : "text-gray-400 border-transparent hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}