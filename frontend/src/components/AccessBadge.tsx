import type { AccessPolicy } from "../types";
import { accessLabel, fmtUsd } from "../utils";

interface Props {
  policy: AccessPolicy;
  price: number;
}

export function AccessBadge({ policy, price }: Props) {
  return (
    <span className={`badge badge-${policy}`}>
      <span className="badge-dot" />
      {accessLabel(policy)}
      <span className="badge-price">{fmtUsd(price)}</span>
    </span>
  );
}
