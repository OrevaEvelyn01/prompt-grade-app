"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const features = [
  {
    icon: "⚡",
    title: "Auto Generation",
    desc: "Gemini API generates responses across all technique × domain combinations automatically.",
  },
  {
    icon: "⚖️",
    title: "LLM-as-a-Judge",
    desc: "Gemini scores every output on Accuracy, Relevance, Coherence and Consistency.",
  },
  {
    icon: "📊",
    title: "Comparative Analytics",
    desc: "Charts and tables reveal which prompting strategies dominate per domain.",
  },
  {
    icon: "📦",
    title: "Export Ready",
    desc: "Download full experiment reports as CSV or PDF for your research.",
  },
];

const techniques = [
  "Zero-shot",
  "Few-shot",
  "CoT",
  "Self-Consistency",
  "Tree-of-Thought",
  "Step-back",
  "ReAct",
  "Few-shot CoT",
];

export default function LandingPage() {
  const router = useRouter();
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
    }));

    let raf;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.alpha})`;
        ctx.fill();
      });

      particles.forEach((a, i) => {
        particles.slice(i + 1).forEach((b) => {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.1 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      raf = requestAnimationFrame(draw);
    };

    draw();

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Grid */}
      <div className="absolute inset-0 grid-bg pointer-events-none" />

      {/* Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(0,212,255,0.06)_0%,transparent_70%)] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-10 py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-slate-700 flex items-center justify-center font-bold text-black text-xs">
            PE
          </div>

          <span className="text-xs tracking-[0.15em] text-gray-400 font-mono">
            PROMPT_EVAL 
          </span>
        </div>

        <button
          onClick={() => router.push("/history")}
          className="px-5 py-2 text-xs border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition"
        >
          Session History →
        </button>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-4xl mx-auto text-center px-10 pt-20">
        <h1 className="text-5xl font-bold mb-6 leading-tight">
          Benchmark Prompting{" "}
          <span className="text-cyan-400 drop-shadow-[0_0_20px_rgba(0,212,255,0.4)]">
            Techniques
          </span>
          <br />
          at Scale
        </h1>

        <p className="text-gray-400 mb-10 leading-relaxed">
          Select techniques, domains, and runs. The platform auto-generates
          responses via Gemini and grades each output with Gemini as LLM-as-a-Judge.
        </p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => router.push("/setup")}
            className="px-8 py-4 bg-cyan-500 text-black font-medium hover:bg-cyan-400 transition"
          >
            Start Experiment →
          </button>

          <button
            onClick={() => router.push("/history")}
            className="px-6 py-4 border border-gray-700 text-gray-300 hover:text-white transition"
          >
            View Past Sessions
          </button>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-10">
          {techniques.map((t) => (
            <span
              key={t}
              className="text-xs px-3 py-1 border border-gray-800 text-gray-400"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-10 py-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {features.map((f) => (
          <div key={f.title} className="p-6 border border-gray-800">
            <div className="text-2xl mb-3">{f.icon}</div>
            <h3 className="font-bold mb-2">{f.title}</h3>
            <p className="text-sm text-gray-400">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}