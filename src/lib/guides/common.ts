import type { Source } from "../types";

export const CHECKED = "2026-10-28";

export const composioSource: Source = {
  id: "composio",
  title: "Composio — Managed OAuth apps directory",
  url: "https://docs.composio.dev/toolkits/managed-auth",
  kind: "official",
  accessed: CHECKED,
};

export const probeSource: Source = {
  id: "probe",
  title: "Live HTTP probes run by the agent (dummy client_id, no credentials)",
  url: "",
  kind: "probe",
  accessed: CHECKED,
};

export function src(id: string, title: string, url: string, kind: Source["kind"] = "official"): Source {
  return { id, title, url, kind, accessed: CHECKED };
}
