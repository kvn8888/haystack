import type { Settlement } from "../types";
import { fmtClock, fmtUsd } from "../utils";

interface Props {
  ledger: Settlement[];
  total: number;
}

export function LiveLedger({ ledger, total }: Props) {
  return (
    <aside className="ledger-card">
      <header className="ledger-head">
        <span className="pulse" />
        Live AI reads
      </header>
      <ul className="ledger-list">
        {ledger.length === 0 && (
          <li className="ledger-empty">Waiting for the next agent to read…</li>
        )}
        {ledger.map((entry) => (
          <li key={entry.id} className="ledger-row">
            <div className="ledger-left">
              <span className="ledger-time">{fmtClock(entry.settled_at)}</span>
              <span className="ledger-agent">{entry.agent_identifier}</span>
            </div>
            <div className="ledger-right">
              <span className="ledger-amt">+{fmtUsd(entry.amount_usdc)}</span>
              <span className="ledger-title">
                {entry.title || entry.post_title || entry.post_id}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <footer className="ledger-foot">
        <span>Session total</span>
        <span className="ledger-total">{fmtUsd(total)}</span>
      </footer>
    </aside>
  );
}
