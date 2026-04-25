import { useState } from "react";
import type { FormEvent } from "react";
import { importRss } from "../api";
import type { FullPost } from "../types";

interface Props {
  onAfterImport: () => void;
}

export function MigrationView({ onAfterImport }: Props) {
  const [rssUrl, setRssUrl] = useState("https://example.substack.com/feed");
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<FullPost[]>([]);

  async function go(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setImported([]);
    try {
      const data = await importRss(rssUrl);
      setImported(data.posts);
      onAfterImport();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="migrate">
      <header className="migrate-head">
        <span className="eyebrow">Migrate in 60 seconds</span>
        <h1>
          Bring your newsletter. Keep your readers. Add a payment address.
        </h1>
        <p className="migrate-sub">
          Paste an RSS feed from Substack, Ghost, WordPress, or anywhere. Each
          post gets an Arc wallet, a per-read price, and an open preview that
          stays Google-indexable.
        </p>
      </header>

      <form className="migrate-form" onSubmit={go}>
        <input
          value={rssUrl}
          onChange={(e) => setRssUrl(e.target.value)}
          placeholder="https://yournewsletter.substack.com/feed"
          aria-label="RSS feed URL"
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Provisioning wallets…" : "Import feed"}
        </button>
      </form>

      <div className="migrate-status">
        <ul className="migrate-checks">
          <li>
            <span className="dot ok" /> Default policy: AI-Metered ($0.001 /
            read)
          </li>
          <li>
            <span className="dot ok" /> Open preview keeps you Google-indexable
          </li>
          <li>
            <span className="dot ok" /> Wallet provisioned per post on Arc
          </li>
        </ul>
      </div>

      {imported.length > 0 && (
        <div className="migrate-grid">
          {imported.map((p, i) => (
            <article
              key={p.id}
              className="migrate-card"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="migrate-card-head">
                <span className="migrate-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="provisioned">◎ wallet provisioned</span>
              </div>
              <h4>{p.title}</h4>
              <p className="muted small">
                ${Number(p.price_per_read).toFixed(3)} per AI read · ai-metered
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
