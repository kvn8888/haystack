import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { HomeView } from "./components/HomeView";
import { ArticleView } from "./components/ArticleView";
import { AgentView } from "./components/AgentView";
import { MigrationView } from "./components/MigrationView";
import { ComposeView } from "./components/ComposeView";
import { DashboardView } from "./components/DashboardView";
import { LiveLedger } from "./components/LiveLedger";
import { fetchConfig, fetchDashboard, searchPosts } from "./api";
import type {
  AppConfig,
  DashboardResponse,
  FullPost,
  PostPreview,
  Settlement,
  View,
} from "./types";

function App() {
  const [view, setView] = useState<View>("home");
  const [posts, setPosts] = useState<PostPreview[]>([]);
  const [activePost, setActivePost] = useState<PostPreview | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [ledger, setLedger] = useState<Settlement[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    void refreshIndex();
    void refreshDashboard();
    void fetchConfig().then(setAppConfig).catch(() => undefined);
    const sse = new EventSource("/api/events/settlements");
    sse.onmessage = (e) => {
      const data = JSON.parse(e.data) as {
        tx?: Settlement;
        post_title?: string;
        type?: string;
      };
      if (!data.tx) return;
      const normalized: Settlement = {
        ...data.tx,
        title: data.post_title ?? data.tx.title,
      };
      setLedger((prev) => {
        if (prev.some((row) => row.id === normalized.id)) return prev;
        return [normalized, ...prev].slice(0, 120);
      });
    };
    return () => sse.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshIndex() {
    const { posts } = await searchPosts("");
    setPosts(posts);
  }

  async function refreshDashboard() {
    const data = await fetchDashboard();
    setDashboard(data);
    setLedger((prev) => {
      if (prev.length) return prev;
      const seen = new Set<string>();
      return data.live.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
    });
  }

  const liveTotal = useMemo(
    () => ledger.reduce((s, r) => s + Number(r.amount_usdc || 0), 0),
    [ledger]
  );

  function openPost(p: PostPreview | FullPost) {
    setActivePost({
      id: p.id,
      title: p.title,
      author_id: p.author_id,
      access_policy: p.access_policy,
      price_per_read: p.price_per_read,
      created_at: p.created_at,
      body_preview:
        ("body_preview" in p && p.body_preview) ? p.body_preview : "",
    });
    setView("article");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="hs-app">
      <div className="hs-bg" aria-hidden />
      <Header
        view={view}
        setView={setView}
        liveTotal={liveTotal}
        appConfig={appConfig}
      />

      <main className="hs-main">
        {view === "home" && (
          <div className="layout-with-side">
            <div className="primary-col">
              <HomeView
                posts={posts}
                onOpen={openPost}
                onCta={() => setView("agent")}
              />
            </div>
            <div className="side-col">
              <LiveLedger
                ledger={ledger}
                total={liveTotal}
                transactionCount={dashboard?.totals.transaction_count}
              />
            </div>
          </div>
        )}

        {view === "article" && activePost && (
          <ArticleView
            post={activePost}
            ledger={ledger}
            onBack={() => setView("home")}
          />
        )}

        {view === "agent" && <AgentView />}

        {view === "migration" && (
          <MigrationView
            onAfterImport={() => {
              void refreshIndex();
              void refreshDashboard();
            }}
          />
        )}

        {view === "compose" && (
          <ComposeView
            appConfig={appConfig}
            onPublished={(post) => {
              void refreshIndex();
              void refreshDashboard();
              openPost(post);
            }}
          />
        )}

        {view === "dashboard" && dashboard && (
          <DashboardView
            data={dashboard}
            ledger={ledger}
            onComposeClick={() => setView("compose")}
            onOpenPost={openPost}
            onUpdated={() => void refreshDashboard()}
          />
        )}
      </main>

      <footer className="hs-footer">
        <span>
          HayStack · An honest market between writers and the machines that
          read them.
        </span>
        <span className="foot-mono">arc · USDC · x402</span>
      </footer>
    </div>
  );
}

export default App;
