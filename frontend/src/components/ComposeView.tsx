import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createPost } from "../api";
import type { AccessPolicy, AppConfig, FullPost } from "../types";
import { accessLabel, authorFor, fmtUsd, readingTime } from "../utils";

interface Props {
  appConfig: AppConfig | null;
  onPublished: (post: FullPost) => void;
}

const POLICIES: { id: AccessPolicy; tagline: string }[] = [
  { id: "open", tagline: "Free for humans and machines. Best for evergreen pieces you want maximum reach on." },
  { id: "ai_metered", tagline: "Free for humans, paid per read for AI. The default. Zero downside, immediate AI revenue." },
  { id: "gated", tagline: "Subscribers read free, AI pays per read. For paid newsletters." },
  { id: "premium", tagline: "Subscribers + AI pay. For original analysis, data, or proprietary research." },
];

const STARTER = `The internet was written by humans. AI profits from it.

Most platforms force you to choose: open everything (and get scraped) or paywall everything (and lose discovery). HayStack offers a third path. Keep your preview public and Google-indexable. Charge agents per read. Settlement happens on Arc in real time.

Replace this with your post. Each blank line starts a new paragraph.`;

export function ComposeView({ appConfig, onPublished }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(STARTER);
  const [policy, setPolicy] = useState<AccessPolicy>("ai_metered");
  const [price, setPrice] = useState(0.001);
  const [humanPriceOn, setHumanPriceOn] = useState(false);
  const [humanPrice, setHumanPrice] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const author = authorFor(appConfig?.default_author_id);
  const wordCount = useMemo(
    () => body.trim().split(/\s+/).filter(Boolean).length,
    [body]
  );
  const previewParagraphs = useMemo(
    () =>
      body
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
    [body]
  );

  const projectedAt100Reads = (price * 100).toFixed(3);
  const projectedAt1k = (price * 1000).toFixed(2);

  async function publish(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the piece a title.");
      return;
    }
    if (wordCount < 30) {
      setError("Write at least 30 words so there's a real preview.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { post } = await createPost({
        title,
        body_full: body,
        access_policy: policy,
        price_per_read: price,
        human_price: humanPriceOn ? humanPrice : null,
        author_id: appConfig?.default_author_id,
      });
      onPublished(post);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to publish.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="compose">
      <header className="compose-head">
        <span className="eyebrow">Compose · {author.name}</span>
        <h1>
          Write once. Get paid by every reader — <em>human or otherwise.</em>
        </h1>
        <p className="compose-sub">
          Draft on the left. Set the paywall on the right. Publish, and HayStack
          gives this piece its own Arc wallet so agents can start paying you per
          read immediately.
        </p>
      </header>

      <form className="compose-grid" onSubmit={publish}>
        <div className="compose-editor">
          <input
            className="compose-title"
            placeholder="A title that reads well in a model's context window…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="compose-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            placeholder="Write your piece. Use blank lines between paragraphs."
          />
          <div className="compose-stats">
            <span>{wordCount} words</span>
            <span>·</span>
            <span>{readingTime(body)}</span>
            <span>·</span>
            <span>~20% will be the open preview</span>
          </div>

          <section className="compose-preview">
            <header className="card-head">Preview · how it will appear</header>
            <h2 className="preview-title">{title || "Untitled draft"}</h2>
            <p className="preview-sub">{author.bio}</p>
            <div className="preview-body">
              {previewParagraphs.length === 0 && (
                <p className="muted">Start typing to see your post laid out.</p>
              )}
              {previewParagraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        </div>

        <aside className="compose-side">
          <section className="side-block">
            <h3>Paywall</h3>
            <p className="side-help">
              Pick how this piece is monetized. You can change it any time from
              the dashboard.
            </p>
            <div className="policy-grid">
              {POLICIES.map((opt) => (
                <label
                  key={opt.id}
                  className={`policy-option ${policy === opt.id ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="policy"
                    value={opt.id}
                    checked={policy === opt.id}
                    onChange={() => setPolicy(opt.id)}
                  />
                  <div>
                    <strong>{accessLabel(opt.id)}</strong>
                    <span>{opt.tagline}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section className="side-block">
            <h3>AI price per read</h3>
            <div className="price-row">
              <input
                type="range"
                min={0.0005}
                max={0.05}
                step={0.0005}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
              <span className="price-val">{fmtUsd(price)}</span>
            </div>
            <ul className="price-projections">
              <li>
                <span>100 agent reads</span>
                <span className="mono">${projectedAt100Reads}</span>
              </li>
              <li>
                <span>1,000 agent reads</span>
                <span className="mono">${projectedAt1k}</span>
              </li>
            </ul>
          </section>

          {(policy === "gated" || policy === "premium") && (
            <section className="side-block">
              <h3>Human subscription</h3>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={humanPriceOn}
                  onChange={(e) => setHumanPriceOn(e.target.checked)}
                />
                <span>Charge a monthly subscription for human readers</span>
              </label>
              {humanPriceOn && (
                <div className="human-price">
                  <span>$</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={humanPrice}
                    onChange={(e) => setHumanPrice(Number(e.target.value))}
                  />
                  <span>/ month</span>
                </div>
              )}
            </section>
          )}

          <section className="side-block summary">
            <h3>Receipt at publish</h3>
            <ul className="summary-list">
              <li>
                <span>Author</span>
                <span>{author.handle}</span>
              </li>
              <li>
                <span>Policy</span>
                <span>{accessLabel(policy)}</span>
              </li>
              <li>
                <span>AI read price</span>
                <span className="mono">{fmtUsd(price)} USDC</span>
              </li>
              <li>
                <span>Settlement</span>
                <span>Arc · USDC</span>
              </li>
              <li>
                <span>Wallet</span>
                <span className="mono small">auto-provisioned</span>
              </li>
            </ul>
          </section>

          {error && <p className="compose-error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
          >
            {busy ? "Provisioning wallet & publishing…" : "Publish to HayStack"}
          </button>
          <p className="muted small fineprint">
            Publishing creates a post, an Arc wallet, and an x402 endpoint —
            crawlers can find the preview the moment it goes live.
          </p>
        </aside>
      </form>
    </section>
  );
}
