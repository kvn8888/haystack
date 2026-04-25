import { useEffect, useMemo, useState } from "react";
import type { FullPost, PostPreview, Settlement } from "../types";
import {
  DEMO_KEY,
  authorFor,
  fmtClock,
  fmtShortDate,
  fmtUsd,
  readingTime,
  stripPreviewTail,
} from "../utils";
import { fetchPostPaid, fetchPostPreview } from "../api";
import { AccessBadge } from "./AccessBadge";

interface Props {
  post: PostPreview;
  ledger: Settlement[];
  onBack: () => void;
}

export function ArticleView({ post, ledger, onBack }: Props) {
  const [unlocked, setUnlocked] = useState<FullPost | null>(null);
  const [previewBody, setPreviewBody] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setUnlocked(null);
    setPreviewBody("");
    let alive = true;
    setLoading(true);
    fetchPostPreview(post.id).then(({ status, preview }) => {
      if (!alive) return;
      setLoading(false);
      if (status === 200 && preview.body_full) {
        setUnlocked(preview as FullPost);
      } else {
        setPreviewBody(
          (preview.body_preview as string) || post.body_preview || ""
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [post.id, post.body_preview]);

  const author = authorFor(post.author_id || unlocked?.author_id);

  const onChainReads = useMemo(
    () => ledger.filter((l) => l.post_id === post.id).slice(0, 6),
    [ledger, post.id]
  );

  async function handlePay() {
    setPaying(true);
    try {
      const data = await fetchPostPaid(post.id, DEMO_KEY, "Reader-Web");
      setUnlocked(data);
    } finally {
      setPaying(false);
    }
  }

  const body = unlocked?.body_full ?? previewBody;
  const paragraphs = stripPreviewTail(body)
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <article className="article">
      <button className="back-link" onClick={onBack}>
        ← Back to discover
      </button>

      <header className="article-head">
        <AccessBadge policy={post.access_policy} price={post.price_per_read} />
        <h1 className="article-title">{post.title}</h1>
        <p className="article-sub">{author.bio}</p>
        <div className="article-meta">
          <div className="article-author">
            <div className="avatar" aria-hidden>
              {author.name.slice(0, 1)}
            </div>
            <div>
              <div className="author-name">{author.name}</div>
              <div className="author-handle">
                {author.handle} · {fmtShortDate(post.created_at)} ·{" "}
                {readingTime(body || post.body_preview)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="article-grid">
        <div className="article-body">
          {loading && <p className="muted">Loading post…</p>}
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {!unlocked && !loading && (
            <div className="paywall">
              <div className="paywall-inner">
                <div className="paywall-icon">◎</div>
                <h3>This is where the post normally ends.</h3>
                <p>
                  Humans subscribe. Agents pay {fmtUsd(post.price_per_read)} per
                  read via x402. Try it like an agent — one click, one
                  nanopayment, full post unlocks and a settlement event lands in
                  the live ledger.
                </p>
                <div className="paywall-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handlePay}
                    disabled={paying}
                  >
                    {paying
                      ? "Settling on Arc…"
                      : `Read as agent · pay ${fmtUsd(post.price_per_read)}`}
                  </button>
                  <button className="btn btn-ghost">
                    Subscribe to {author.name}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="article-side">
          <section className="side-card">
            <header className="side-head">
              <span className="pulse" />
              AI reads on this post
            </header>
            {onChainReads.length === 0 ? (
              <p className="muted small">
                No agent reads yet for this post. Click "Read as agent" to be
                the first.
              </p>
            ) : (
              <ul className="receipts-list">
                {onChainReads.map((r) => (
                  <li key={r.id}>
                    <span className="receipt-agent">{r.agent_identifier}</span>
                    <span className="receipt-amt">
                      +{fmtUsd(r.amount_usdc)}
                    </span>
                    <span className="receipt-time">
                      {fmtClock(r.settled_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="side-card promote">
            <h4>Subscribe to {author.name}</h4>
            <p>Get new essays in your inbox. {author.handle}.</p>
            <div className="sub-row">
              <input placeholder="you@example.com" />
              <button className="btn btn-primary small">Subscribe</button>
            </div>
            <p className="fineprint">
              Free tier for now. Premium $10/mo when published.
            </p>
          </section>
        </aside>
      </div>
    </article>
  );
}
