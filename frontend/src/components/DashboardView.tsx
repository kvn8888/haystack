import { useEffect, useMemo, useState } from "react";
import type { AccessPolicy, DashboardResponse, Settlement } from "../types";
import { accessLabel, fmtClock, fmtUsd } from "../utils";
import { updatePostSettings } from "../api";

interface Props {
  data: DashboardResponse;
  ledger: Settlement[];
  onComposeClick: () => void;
  onUpdated: () => void;
}

const POLICIES: AccessPolicy[] = ["open", "ai_metered", "gated", "premium"];

interface RowProps {
  post: DashboardResponse["totals"]["post_settings"][number];
  onUpdated: () => void;
}

function PostSettingsRow({ post, onUpdated }: RowProps) {
  const [policy, setPolicy] = useState<AccessPolicy>(post.access_policy);
  const [price, setPrice] = useState<number>(post.price_per_read);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => setPolicy(post.access_policy), [post.access_policy]);
  useEffect(() => setPrice(post.price_per_read), [post.price_per_read]);

  const dirty =
    policy !== post.access_policy || Number(price) !== Number(post.price_per_read);

  useEffect(() => {
    if (!dirty) return;
    setSaving("saving");
    const t = window.setTimeout(async () => {
      await updatePostSettings(post.id, {
        access_policy: policy,
        price_per_read: Number(price),
      });
      setSaving("saved");
      onUpdated();
      window.setTimeout(() => setSaving("idle"), 1200);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy, price]);

  return (
    <li className="settings-row">
      <div className="settings-title-col">
        <strong>{post.title}</strong>
        <small>
          {accessLabel(policy)}
          {saving === "saving" && <em className="save-tag"> · saving…</em>}
          {saving === "saved" && <em className="save-tag saved"> · saved ◎</em>}
        </small>
      </div>
      <div className="settings-controls">
        <select
          value={policy}
          onChange={(e) => setPolicy(e.target.value as AccessPolicy)}
        >
          {POLICIES.map((p) => (
            <option key={p} value={p}>
              {accessLabel(p)}
            </option>
          ))}
        </select>
        <div className="price-control">
          <input
            type="range"
            min={0}
            max={0.05}
            step={0.0005}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
          <span className="price-pill">{fmtUsd(price)}</span>
        </div>
      </div>
    </li>
  );
}

export function DashboardView({ data, ledger, onComposeClick, onUpdated }: Props) {
  const { totals } = data;
  const sum = totals.month_human + totals.month_ai;
  const postSettings = useMemo(() => totals.post_settings, [totals.post_settings]);

  return (
    <section className="dash">
      <header className="dash-head">
        <div className="dash-head-row">
          <div>
            <span className="eyebrow">Writer dashboard · Ada Wei</span>
            <h1>
              This month, paragraphs you wrote earned <em>${sum.toFixed(2)}</em>.
            </h1>
          </div>
          <button className="btn btn-primary" onClick={onComposeClick}>
            Write a new post
          </button>
        </div>
      </header>

      <div className="dash-split">
        <div className="dash-tile human">
          <div className="dash-tile-label">Human readers</div>
          <div className="dash-tile-value">${totals.month_human.toFixed(2)}</div>
          <div className="dash-tile-foot">Subscriptions · steady</div>
        </div>
        <div className="dash-tile ai">
          <div className="dash-tile-label">AI reads</div>
          <div className="dash-tile-value">${totals.month_ai.toFixed(3)}</div>
          <div className="dash-tile-foot">Per-read · growing</div>
        </div>
      </div>

      <div className="dash-grid">
        <section className="dash-card">
          <h3>Top AI readers</h3>
          <ul className="dash-table">
            {totals.top_readers.length === 0 && (
              <li className="muted">No reads yet today.</li>
            )}
            {totals.top_readers.map((r) => (
              <li key={r.agent_identifier}>
                <span>{r.agent_identifier}</span>
                <span className="agent-spend">
                  ${Number(r.spend).toFixed(3)}
                </span>
                <span className="agent-reads">{r.reads} reads</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-card">
          <header className="card-head">
            <span className="pulse" /> Live settlement feed
          </header>
          <ul className="dash-feed">
            {ledger.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <span className="t">{fmtClock(entry.settled_at)}</span>
                <span className="a">{entry.agent_identifier}</span>
                <span className="title">
                  "{entry.title || entry.post_title}"
                </span>
                <span className="amt">
                  {entry.arc_explorer_url ? (
                    <a
                      href={entry.arc_explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      title="View on Arc explorer"
                    >
                      +{fmtUsd(entry.amount_usdc)}
                    </a>
                  ) : (
                    <>+{fmtUsd(entry.amount_usdc)}</>
                  )}
                </span>
              </li>
            ))}
            {ledger.length === 0 && (
              <li className="muted">No settlements yet.</li>
            )}
          </ul>
        </section>

        <section className="dash-card dash-card-wide">
          <header className="card-head">
            <span>Per-post paywall</span>
            <span className="muted small">Edits save automatically</span>
          </header>
          <ul className="dash-settings">
            {postSettings.map((p) => (
              <PostSettingsRow key={p.id} post={p} onUpdated={onUpdated} />
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
