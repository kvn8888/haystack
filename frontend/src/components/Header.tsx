import type { AppConfig, View } from "../types";
import { fmtUsd } from "../utils";

interface Props {
  view: View;
  liveTotal: number;
  setView: (v: View) => void;
  appConfig: AppConfig | null;
}

export function Header({ view, liveTotal, setView, appConfig }: Props) {
  const link = (id: View, label: string) => (
    <button
      key={id}
      className={`nav-link ${view === id ? "active" : ""}`}
      onClick={() => setView(id)}
    >
      {label}
    </button>
  );

  const integrations = appConfig?.integrations;

  return (
    <header className="hs-header">
      <button className="brand" onClick={() => setView("home")}>
        <span className="brand-mark" aria-hidden>
          ▲
        </span>
        <span className="brand-name">HayStack</span>
        <span className="brand-tag">Pay-per-word for the AI web</span>
      </button>
      <nav className="hs-nav">
        {link("home", "Discover")}
        {link("agent", "Agent")}
        {link("compose", "Write")}
        {link("migration", "Import")}
        {link("dashboard", "Dashboard")}
      </nav>
      <div className="hs-status">
        {integrations && (
          <div
            className="hs-integrations"
            title="Live = real provider call. Mock = local simulation. Configure in backend/.env"
          >
            <span
              className={`int-pill ${integrations.gemini.live ? "live" : "mock"}`}
              title={`Gemini · ${integrations.gemini.detail}`}
            >
              <span className="int-dot" />
              Gemini
            </span>
            <span
              className={`int-pill ${integrations.circle.live ? "live" : "mock"}`}
              title={`Circle · ${integrations.circle.detail}`}
            >
              <span className="int-dot" />
              Circle
            </span>
            <span
              className={`int-pill ${integrations.arc.live ? "live" : "mock"}`}
              title={`Arc · ${integrations.arc.detail}`}
            >
              <span className="int-dot" />
              Arc
            </span>
          </div>
        )}
        <div className="hs-meter" title="Live AI revenue this session">
          <span className="dot" />
          <span className="meter-value">{fmtUsd(liveTotal)}</span>
          <span className="meter-label">paid live</span>
        </div>
      </div>
    </header>
  );
}
