import type { PostPreview } from "../types";
import {
  authorFor,
  fmtShortDate,
  readingTime,
  stripPreviewTail,
} from "../utils";
import { AccessBadge } from "./AccessBadge";

interface Props {
  posts: PostPreview[];
  onOpen: (p: PostPreview) => void;
  onCta: () => void;
}

export function HomeView({ posts, onOpen, onCta }: Props) {
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="home">
      <section className="hero">
        <span className="eyebrow">A publishing platform priced for machines</span>
        <h1 className="hero-title">
          Writing for humans.
          <br />
          <em>Indexed by agents.</em>
          <br />
          Settled in real time.
        </h1>
        <p className="hero-sub">
          HayStack is the first place where the model reading you owes you a
          fraction of a cent — and pays it before the next paragraph.
        </p>
        <div className="hero-cta">
          <button
            className="btn btn-primary"
            onClick={() => (featured ? onOpen(featured) : onCta())}
          >
            Read what AI is paying for
          </button>
          <button className="btn btn-ghost" onClick={onCta}>
            Try the agent playground
          </button>
        </div>
        <div className="hero-marquee">
          <span>x402 native</span>
          <span>·</span>
          <span>USDC-settled on Arc</span>
          <span>·</span>
          <span>Sub-cent reads</span>
          <span>·</span>
          <span>RSS-importable</span>
        </div>
      </section>

      {featured && (
        <article
          className="featured"
          onClick={() => onOpen(featured)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen(featured);
          }}
        >
          <div className="featured-meta">
            <span>Editor's pick</span>
            <span>·</span>
            <span>{fmtShortDate(featured.created_at)}</span>
          </div>
          <h2 className="featured-title">{featured.title}</h2>
          <p className="featured-preview">
            {stripPreviewTail(featured.body_preview)}
          </p>
          <div className="featured-foot">
            <span className="byline">By {authorFor(featured.author_id).name}</span>
            <span>·</span>
            <span>{readingTime(featured.body_preview)}</span>
            <AccessBadge
              policy={featured.access_policy}
              price={featured.price_per_read}
            />
          </div>
        </article>
      )}

      <section id="feed" className="feed">
        <h3 className="feed-head">Recent on HayStack</h3>
        <div className="feed-grid">
          {rest.map((post) => (
            <article
              key={post.id}
              className="card"
              onClick={() => onOpen(post)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen(post);
              }}
            >
              <div className="card-meta">
                <span>{authorFor(post.author_id).name}</span>
                <span>·</span>
                <span>{fmtShortDate(post.created_at)}</span>
              </div>
              <h4 className="card-title">{post.title}</h4>
              <p className="card-preview">
                {stripPreviewTail(post.body_preview).slice(0, 180)}…
              </p>
              <div className="card-foot">
                <AccessBadge
                  policy={post.access_policy}
                  price={post.price_per_read}
                />
                <span>{readingTime(post.body_preview)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
