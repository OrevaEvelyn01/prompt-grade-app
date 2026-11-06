"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, generateResponses } from "@/api/experimentApi";

const TECHNIQUES = [
  {
    id: "zero_shot",
    label: "Zero-shot",
    desc: "No examples, direct instruction",
    placeholder:
      "Type your zero-shot prompt here e.g. A bacteria colony doubles every 3 hours...",
  },
  {
    id: "few_shot",
    label: "Few-shot",
    desc: "Provide examples before task",
    placeholder:
      "Type your few-shot prompt here including your own relevant examples...",
  },
  {
    id: "zero_shot_cot",
    label: "Zero-shot CoT",
    desc: '"Think step by step" suffix',
    placeholder:
      'Type your question here with "think step by step" instruction...',
  },
  {
    id: "few_shot_cot",
    label: "Few-shot CoT",
    desc: "Examples with reasoning chains",
    placeholder:
      "Type your few-shot CoT prompt with step-by-step reasoning examples...",
  },
  {
    id: "self_consistency",
    label: "Self-Consistency",
    desc: "Same prompt sent multiple times, consistency scored",
    placeholder: "Type your self-consistency prompt here...",
  },
  {
    id: "tree_of_thought",
    label: "Tree-of-Thought",
    desc: "Explore branching reasoning trees",
    placeholder: "Type your Tree-of-Thought prompt with branch structure...",
  },
  {
    id: "step_back",
    label: "Step-back Prompting",
    desc: "Abstract before solving",
    placeholder:
      "Type your step-back prompt asking for general principles first...",
  },
  {
    id: "react",
    label: "ReAct",
    desc: "Reasoning + Acting interleaved",
    placeholder:
      "Type your ReAct prompt with Thought-Action-Observation format...",
  },
];

const DOMAINS = [
  { id: "math", label: "Math", icon: "∑" },
  { id: "logic", label: "Logic", icon: "⊢" },
  { id: "coding", label: "Coding", icon: "</>" },
  { id: "conceptual", label: "Conceptual", icon: "◎" },
];

const MODIFIERS = [
  {
    id: "role",
    label: "Role-Based",
    desc: "Assigns the model a specific identity or expertise",
    placeholder:
      "e.g. You are a university professor specializing in computer science",
  },
  {
    id: "audience",
    label: "Audience",
    desc: "Tells the model who it is writing for",
    placeholder:
      "e.g. Explain this to a grade 5 student with no prior knowledge",
  },
  {
    id: "constraint",
    label: "Constraint",
    desc: "Limits response length or restricts output",
    placeholder:
      "e.g. Answer in no more than 5 sentences. Be direct and concise.",
  },
  {
    id: "output_format",
    label: "Output Format",
    desc: "Specifies the structure of the response",
    placeholder:
      "e.g. Structure your response with clear headings and bullet points",
  },
  {
    id: "tone_style",
    label: "Tone & Style",
    desc: "Sets the register or style of the response",
    placeholder: "e.g. Use a formal academic tone throughout your response",
  },
];

function SectionLabel({ number, title, subtitle }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-1">
        <span className="font-mono text-xs text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded">
          {number}
        </span>
        <h3 className="font-bold text-base text-white">{title}</h3>
      </div>
      {subtitle && (
        <p className="text-xs text-[var(--text-muted)] ml-11">{subtitle}</p>
      )}
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();

  const [sessionName, setSessionName] = useState("");
  const [selectedTechniques, setSelectedTechniques] = useState([]);
  const [techniquePrompts, setTechniquePrompts] = useState({});
  const [selectedDomains, setSelectedDomains] = useState([]);
  const [useModifiers, setUseModifiers] = useState(false);
  const [selectedModifiers, setSelectedModifiers] = useState([]);
  const [modifierTexts, setModifierTexts] = useState({});
  const [runsPerPrompt, setRunsPerPrompt] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id, list, setList) =>
    setList((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const toggleTechnique = (id) => {
    setSelectedTechniques((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleModifier = (id) => {
    setSelectedModifiers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const updateTechniquePrompt = (id, value) => {
    setTechniquePrompts((prev) => ({ ...prev, [id]: value }));
  };

  const updateModifierText = (id, value) => {
    setModifierTexts((prev) => ({ ...prev, [id]: value }));
  };

  const totalOutputs =
    selectedTechniques.length * selectedDomains.length * runsPerPrompt;
  const totalWithModifiers =
    useModifiers && selectedModifiers.length > 0
      ? totalOutputs * 2
      : totalOutputs;

  const handleSubmit = async () => {
    if (!sessionName.trim()) return setError("Please enter a session name.");
    if (selectedTechniques.length === 0)
      return setError("Select at least one technique.");
    if (selectedDomains.length === 0)
      return setError("Select at least one domain.");

    const missingPrompts = selectedTechniques.filter(
      (id) => !techniquePrompts[id]?.trim(),
    );
    if (missingPrompts.length > 0)
      return setError(
        "Please fill in the prompt for every selected technique.",
      );

    if (useModifiers && selectedModifiers.length > 0) {
      const missing = selectedModifiers.filter(
        (id) => !modifierTexts[id]?.trim(),
      );
      if (missing.length > 0)
        return setError("Please fill in the text for all selected modifiers.");
    }

    setError("");
    setLoading(true);
    try {
      const result = await createSession({
        session_name: sessionName.trim(),
        techniques: selectedTechniques,
        domains: selectedDomains,
        modifiers: useModifiers ? selectedModifiers : [],
        modifier_texts: useModifiers ? modifierTexts : {},
        technique_prompts: techniquePrompts,
        runs: runsPerPrompt,
      });

      await generateResponses(result.session_id)

      router.push(`/outputs/${result.session_id}`);
    } catch (err) {
      setError(
        err.message || "Failed to create session. Is the backend running?",
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#04080f] grid-bg pb-20">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-10">
          <p className="font-mono text-xs text-cyan-400 tracking-widest mb-2">
            EXPERIMENT SETUP
          </p>
          <h1 className="text-3xl font-extrabold text-white">
            Configure Session
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          <div className="flex flex-col gap-5">
            {/* 01 Session Name */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <SectionLabel number="01" title="Session Name" />
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Math Domain - Role-Based Modifier"
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-bright)] text-[var(--text-primary)] font-mono text-sm outline-none focus:border-cyan-400 transition-colors placeholder:text-[var(--text-muted)]"
              />
            </div>

            {/* 02 Techniques + Prompts */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex items-start justify-between mb-4">
                <SectionLabel
                  number="02"
                  title="Prompt Techniques"
                  subtitle="Select techniques and write the full prompt for each one"
                />
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() =>
                      setSelectedTechniques(TECHNIQUES.map((t) => t.id))
                    }
                    className="font-mono text-xs px-3 py-1 rounded border border-[var(--border-bright)] text-[var(--text-muted)] hover:border-cyan-400 hover:text-cyan-400 transition-all"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedTechniques([])}
                    className="font-mono text-xs px-3 py-1 rounded border border-[var(--border-bright)] text-[var(--text-muted)] hover:border-cyan-400 hover:text-cyan-400 transition-all"
                  >
                    None
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {TECHNIQUES.map((t) => {
                  const checked = selectedTechniques.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      className={`rounded-lg border transition-all ${
                        checked
                          ? "border-cyan-400/40 bg-cyan-400/5"
                          : "border-[var(--border)] bg-[var(--bg-secondary)]"
                      }`}
                    >
                      {/* Technique header */}
                      <div
                        onClick={() => toggleTechnique(t.id)}
                        className="flex gap-3 p-3 cursor-pointer"
                      >
                        <div
                          className={`w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center border transition-all ${
                            checked
                              ? "bg-cyan-400 border-cyan-400"
                              : "border-[var(--border-bright)] bg-[var(--bg-primary)]"
                          }`}
                        >
                          {checked && (
                            <svg
                              width="9"
                              height="7"
                              viewBox="0 0 9 7"
                              fill="none"
                            >
                              <path
                                d="M1 3.5L3.2 6L8 1"
                                stroke="#000"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p
                            className={`text-sm font-semibold ${checked ? "text-cyan-400" : "text-[var(--text-primary)]"}`}
                          >
                            {t.label}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {t.desc}
                          </p>
                        </div>
                      </div>

                      {/* Prompt textarea — only shows when technique is selected */}
                      {checked && (
                        <div className="px-3 pb-3">
                          <textarea
                            value={techniquePrompts[t.id] || ""}
                            onChange={(e) =>
                              updateTechniquePrompt(t.id, e.target.value)
                            }
                            placeholder={t.placeholder}
                            rows={5}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-cyan-400/20 text-[var(--text-primary)] text-sm outline-none focus:border-cyan-400 transition-colors placeholder:text-[var(--text-muted)] resize-y font-mono"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 03 Domains */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <SectionLabel
                number="03"
                title="Task Domain"
                subtitle="Choose which domain this experiment belongs to"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DOMAINS.map((d) => {
                  const checked = selectedDomains.includes(d.id);
                  return (
                    <div
                      key={d.id}
                      onClick={() =>
                        toggle(d.id, selectedDomains, setSelectedDomains)
                      }
                      className={`flex flex-col items-center gap-2 py-5 rounded-lg border cursor-pointer transition-all ${
                        checked
                          ? "border-emerald-400/40 bg-emerald-400/5"
                          : "border-[var(--border)] bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <span
                        className={`font-mono text-xl ${checked ? "text-emerald-400" : "text-[var(--text-muted)]"}`}
                      >
                        {d.icon}
                      </span>
                      <span
                        className={`text-sm font-semibold ${checked ? "text-emerald-400" : "text-[var(--text-secondary)]"}`}
                      >
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 04 Modifiers */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex items-center justify-between mb-2">
                <SectionLabel
                  number="04"
                  title="Prompt Modifiers"
                  subtitle={
                    useModifiers
                      ? "Select modifiers and describe exactly how to apply them"
                      : null
                  }
                />
                <button
                  onClick={() => setUseModifiers((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    useModifiers ? "bg-cyan-400" : "bg-[var(--border-bright)]"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${
                      useModifiers ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {useModifiers && (
                <div className="flex flex-col gap-3 mt-4">
                  {MODIFIERS.map((m) => {
                    const checked = selectedModifiers.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`rounded-lg border transition-all ${
                          checked
                            ? "border-amber-400/40 bg-amber-400/5"
                            : "border-[var(--border)] bg-[var(--bg-secondary)]"
                        }`}
                      >
                        <div
                          onClick={() => toggleModifier(m.id)}
                          className="flex gap-3 p-3 cursor-pointer"
                        >
                          <div
                            className={`w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center border transition-all ${
                              checked
                                ? "bg-amber-400 border-amber-400"
                                : "border-[var(--border-bright)] bg-[var(--bg-primary)]"
                            }`}
                          >
                            {checked && (
                              <svg
                                width="9"
                                height="7"
                                viewBox="0 0 9 7"
                                fill="none"
                              >
                                <path
                                  d="M1 3.5L3.2 6L8 1"
                                  stroke="#000"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p
                              className={`text-sm font-semibold ${checked ? "text-amber-400" : "text-[var(--text-primary)]"}`}
                            >
                              {m.label}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {m.desc}
                            </p>
                          </div>
                        </div>

                        {checked && (
                          <div className="px-3 pb-3">
                            <textarea
                              value={modifierTexts[m.id] || ""}
                              onChange={(e) =>
                                updateModifierText(m.id, e.target.value)
                              }
                              placeholder={m.placeholder}
                              rows={2}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-amber-400/20 text-[var(--text-primary)] text-sm outline-none focus:border-amber-400 transition-colors placeholder:text-[var(--text-muted)] resize-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {selectedModifiers.length > 0 && (
                    <div className="p-3 rounded-lg bg-cyan-400/5 border border-cyan-400/20">
                      <p className="text-xs text-cyan-400 font-mono">
                        ℹ️ The experiment will run twice — once without
                        modifiers and once with, so you can compare results.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 05 Runs */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <SectionLabel
                number="05"
                title="Runs Per Prompt"
                subtitle="Multiple runs enable consistency evaluation"
              />
              <div className="flex items-center gap-3 flex-wrap">
                {[1, 2, 3, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRunsPerPrompt(n)}
                    className={`w-12 h-12 rounded-lg border font-mono font-bold text-base transition-all ${
                      runsPerPrompt === n
                        ? "border-cyan-400 bg-cyan-400/10 text-cyan-400"
                        : "border-[var(--border-bright)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-cyan-400/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={runsPerPrompt}
                  onChange={(e) =>
                    setRunsPerPrompt(
                      Math.max(1, Math.min(10, Number(e.target.value))),
                    )
                  }
                  className="w-20 px-3 py-3 text-center rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-bright)] text-[var(--text-primary)] font-mono text-sm outline-none focus:border-cyan-400 transition-colors"
                />
                <span className="text-xs text-[var(--text-muted)]">max 10</span>
              </div>
            </div>
          </div>

          {/* Right: live summary */}
          <div className="lg:sticky lg:top-20">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] p-5">
              <p className="font-mono text-xs text-cyan-400 tracking-widest mb-5">
                LIVE CALCULATION
              </p>

              <div className="flex flex-col gap-4 mb-5">
                {[
                  {
                    label: "Techniques",
                    value: selectedTechniques.length,
                    total: TECHNIQUES.length,
                  },
                  {
                    label: "Domains",
                    value: selectedDomains.length,
                    total: DOMAINS.length,
                  },
                  { label: "Runs", value: runsPerPrompt, total: 10 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {row.label}
                      </span>
                      <span className="font-mono text-xs text-white">
                        {row.value}
                        <span className="text-[var(--text-muted)]">
                          /{row.total}
                        </span>
                      </span>
                    </div>
                    <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                        style={{ width: `${(row.value / row.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-[var(--bg-secondary)] rounded-lg p-4 text-center mb-4">
                <p className="font-mono text-xs text-[var(--text-muted)] mb-1">
                  Total API Calls
                </p>
                <p
                  className={`font-mono text-4xl font-bold transition-all ${totalWithModifiers > 0 ? "text-cyan-400" : "text-[var(--text-muted)]"}`}
                >
                  {totalWithModifiers}
                </p>
                <p className="font-mono text-xs text-[var(--text-muted)] mt-1">
                  {useModifiers && selectedModifiers.length > 0
                    ? `${totalOutputs} base + ${totalOutputs} with modifiers`
                    : `${selectedTechniques.length} × ${selectedDomains.length} × ${runsPerPrompt}`}
                </p>
              </div>

              {error && (
                <div className="mb-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-mono">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || totalWithModifiers === 0}
                className="w-full py-3.5 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 text-black font-bold font-mono text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_25px_rgba(0,212,255,0.35)] transition-all"
              >
                {loading
                  ? "Creating session..."
                  : `Generate Experiment (${totalWithModifiers}) →`}
              </button>

              <p className="font-mono text-xs text-[var(--text-muted)] text-center mt-3">
                Session is saved automatically.
                <br />
                Grade outputs after generation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
