"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { generatePlan } from "@/lib/workout-engine";
import type { Profile, ParsedLog, WorkoutSession } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// Sample profile for testing the chat logger before we have a database.
// Uses full_gym + experienced so the plan has the widest variety of
// matchable exercises (lat pulldown, bench, squat, etc.) — useful for
// trying weird machine names like "Free Motion Epic".
// ────────────────────────────────────────────────────────────────────────────
const TEST_PROFILE: Profile = {
  sex: "male",
  age: "38",
  heightFt: "5",
  heightIn: "10",
  weightLb: "210",
  waistIn: "",
  hipIn: "",
  chestIn: "",
  armIn: "",
  thighIn: "",
  glpDrug: "tirzepatide",
  glpDoseMg: "5",
  glpInjectionDay: "sunday",
  glpStartDate: "",
  experience: "3plus",
  daysPerWeek: "3",
  equipment: "full_gym",
  injuries: "",
  primaryGoal: "preserve_muscle",
  targetWeightLb: "180",
  goalNotes: "",
};

interface ChatMessage {
  role: "user" | "app";
  text: string;
  parsed?: ParsedLog;
  errorRaw?: string;
}

export default function LogPage() {
  // Generate a sample plan, take Day 1 as "today".
  const plan = generatePlan(TEST_PROFILE);
  const todaySession: WorkoutSession = plan.sessions[0];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "app",
      text:
        "Here's today's plan above. Tell me what you did — type it like you'd text a trainer. Specific machines are fine; I'll match them up.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to latest message.
  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/parse-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          plannedSession: {
            templateName: todaySession.templateName,
            exercises: todaySession.exercises.map((e) => ({
              name: e.exercise.name,
              pattern: e.exercise.pattern,
            })),
          },
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setMessages((m) => [
          ...m,
          { role: "app", text: "Logged ✓", parsed: data.parsed as ParsedLog },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "app",
            text: data.error || "Something went wrong parsing that.",
            errorRaw: data.raw,
          },
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "app",
          text:
            "Network error reaching /api/parse-log. Is the dev server still running?",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <main className="min-h-screen bg-[#0b1015] text-white flex flex-col">
      {/* Top bar */}
      <div className="border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Home
        </Link>
        <div className="text-xs text-slate-500">
          /log · sample profile · {todaySession.templateName}
        </div>
      </div>

      {/* Plan card */}
      <div className="px-6 pt-5 pb-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-3xl mx-auto">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
            Today&apos;s plan
          </div>
          <div className="space-y-1.5">
            {todaySession.exercises.map((p, i) => (
              <div
                key={i}
                className="text-sm flex justify-between gap-3 text-slate-200"
              >
                <span className="truncate">
                  <span className="text-slate-500 font-mono mr-2">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {p.exercise.name}
                </span>
                <span className="text-teal-300 tabular-nums shrink-0">
                  {p.sets} × {p.repRange} · {p.targetRpe}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat scroller */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} />
          ))}
          {pending && (
            <div className="flex">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-400">
                <span className="inline-flex gap-1">
                  <Dot delay={0} />
                  <Dot delay={150} />
                  <Dot delay={300} />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='e.g. "3x8 goblet squats @ 30, RPE 7. Then incline DB press 3x10 @ 35, last set felt hard."'
            rows={2}
            className="flex-1 bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition"
          />
          <button
            onClick={send}
            disabled={pending || !input.trim()}
            className="bg-teal-400 text-slate-900 font-bold px-5 py-3 rounded-xl hover:bg-teal-300 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
          >
            Send
          </button>
        </div>
        <p className="text-[11px] text-slate-600 mt-2 max-w-3xl mx-auto">
          Try specifics: &quot;Free Motion Epic for vertical pulls, 3x10 stack
          15, RPE 7.&quot; Try side-effects: &quot;feeling nauseous, skipped
          the rest.&quot; Try a kg user: &quot;bench 4x6 at 80 kg.&quot;
        </p>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CHAT BUBBLE
// ────────────────────────────────────────────────────────────────────────────
function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-teal-400 text-slate-900 rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium max-w-[80%] whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-slate-200 max-w-[88%] w-full">
        <div className="font-medium">{message.text}</div>

        {message.parsed && <ParsedView parsed={message.parsed} />}

        {message.errorRaw && (
          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer">Raw response</summary>
            <pre className="mt-2 bg-slate-950 border border-slate-800 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap text-[11px]">
              {message.errorRaw}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function ParsedView({ parsed }: { parsed: ParsedLog }) {
  return (
    <div className="mt-3 space-y-2">
      {parsed.exercises.map((ex, i) => {
        const unmatched = !ex.matched_to;
        return (
          <div
            key={i}
            className={`rounded-lg border p-3 ${
              unmatched
                ? "bg-amber-400/5 border-amber-400/30"
                : "bg-slate-950 border-slate-800"
            }`}
          >
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-white">
                  {ex.matched_to || ex.unmatched_name || "Exercise"}
                  {unmatched && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-300">
                      not in plan
                    </span>
                  )}
                </div>
                {ex.notes && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {ex.notes}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-teal-300 font-semibold tabular-nums text-sm">
                  {ex.sets} × {ex.reps}
                  {ex.weight_lb > 0 && (
                    <span className="text-slate-400 font-normal">
                      {" @ "}
                      {ex.weight_lb} lb
                    </span>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                  RPE {ex.rpe}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {parsed.side_effects && (
        <div className="rounded-lg border border-orange-400/30 bg-orange-400/5 p-3 text-sm text-orange-200">
          <div className="text-[10px] uppercase tracking-wider text-orange-300 mb-1">
            Side effect noted
          </div>
          {parsed.side_effects}
        </div>
      )}

      {parsed.warnings && parsed.warnings.length > 0 && (
        <ul className="text-[11px] text-slate-500 space-y-0.5 mt-2">
          {parsed.warnings.map((w, i) => (
            <li key={i}>· {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
