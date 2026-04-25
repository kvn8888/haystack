import { useState } from "react";
import { runAgent } from "../api";
import { DEMO_KEY, fmtUsd } from "../utils";
import type { AgentResponse } from "../types";

const STAGES = [
  { key: "search", label: "Search index", tag: "free" },
  { key: "evaluate", label: "Evaluate budget", tag: "Gemini Pro" },
  { key: "pay", label: "Pay & read", tag: "x402 / Arc" },
  { key: "synth", label: "Synthesize answer", tag: "Gemini Pro" },
] as const;

type StageKey = (typeof STAGES)[number]["key"] | "" | "done";

export function AgentView() {
  const [query, setQuery] = useState(
    "How does Arc make HTTP 402 viable for AI retrieval?"
  );
  const [budget, setBudget] = useState(0.01);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<StageKey>("");
  const [response, setResponse] = useState<AgentResponse | null>(null);

  async function go() {
    setRunning(true);
    setResponse(null);
    setStage("search");
    await new Promise((r) => setTimeout(r, 350));
    setStage("evaluate");
    await new Promise((r) => setTimeout(r, 350));
    setStage("pay");
    const data = await runAgent(query, budget, DEMO_KEY);
    setStage("synth");
    await new Promise((r) => setTimeout(r, 250));
    setResponse(data);
    setStage("done");
    setRunning(false);
  }

  function stageClass(idx: number) {
    const order = ["search", "evaluate", "pay", "synth"];
    if (stage === "done") return "done";
    if (stage === "") return "";
    const currentIdx = order.indexOf(stage);
    if (currentIdx === idx) return "active";
    if (currentIdx > idx) return "done";
    return "";
  }

  return (
    <section className="agent">
      <header className="agent-head">
        <span className="eyebrow">Agent playground</span>
        <h1>
          Watch an agent <em>buy a thought.</em>
        </h1>
        <p className="agent-sub">
          A budgeted Gemini-style loop searches HayStack for free, evaluates
          relevance against cost, and pays only for what it reads. Each
          purchased read fires a real x402-shaped settlement.
        </p>
      </header>

      <div className="agent-grid">
        <div className="agent-input">
          <label>Question for the agent</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={4}
          />
          <div className="budget-row">
            <label>Budget</label>
            <input
              type="range"
              min={0.001}
              max={0.05}
              step={0.001}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
            <span className="budget-val">{fmtUsd(budget)}</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={go}
            disabled={running}
          >
            {running ? "Agent thinking…" : "Run the agent"}
          </button>
          <div className="agent-pipe">
            {STAGES.map((s, i) => (
              <div key={s.key} className={`pipe-step ${stageClass(i)}`}>
                <span className="pipe-num">{i + 1}</span>
                <span>{s.label}</span>
                <span className="pipe-tag">{s.tag}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="agent-output">
          {!response && (
            <div className="agent-empty">
              <p className="muted">
                The agent's reads, settlement events, and synthesis will land
                here.
              </p>
            </div>
          )}
          {response && (
            <>
              <div className="agent-summary">
                <span>
                  Spent {fmtUsd(response.spent_usdc)} of{" "}
                  {fmtUsd(response.budget_usdc)}
                </span>
                <span>·</span>
                <span>{response.reads.length} sources purchased</span>
                <span>·</span>
                <span>API key: hs_demo_gemini</span>
              </div>
              <h3 className="agent-answer-head">Answer</h3>
              <p className="agent-answer">{response.answer}</p>
              <h3 className="agent-cite-head">Sources purchased</h3>
              <ul className="cite-list">
                {response.reads.length === 0 && (
                  <li>
                    <p className="muted small">
                      No sources purchased within budget. Increase the budget
                      slider and rerun.
                    </p>
                  </li>
                )}
                {response.reads.map((r) => (
                  <li key={r.post_id}>
                    <div>
                      <strong>{r.title}</strong>
                      <p className="muted small">{r.excerpt}</p>
                    </div>
                    <span className="cite-amt">−{fmtUsd(r.amount_usdc)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
