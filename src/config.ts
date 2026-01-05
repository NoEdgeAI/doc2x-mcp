type DurationDefaultUnit = "ms" | "s";

const INLINE_DOC2X_API_KEY = "";

function parseDoc2xApiKey(raw: string): string {
  const v = String(raw).trim();
  if (!v) return "";
  // Common misconfig: Alma/Codex passes literal "${DOC2X_API_KEY}" without expansion.
  if (v.includes("${") && v.includes("}")) return "";
  const bearerPrefix = /^bearer\s+/i;
  if (bearerPrefix.test(v)) return v.replace(bearerPrefix, "").trim();
  return v;
}

function resolveApiKey(): { apiKey: string; source: "inline" | "env" | "missing" } {
  const inline = parseDoc2xApiKey(INLINE_DOC2X_API_KEY);
  if (inline) return { apiKey: inline, source: "inline" };
  const env = parseDoc2xApiKey(process.env.DOC2X_API_KEY || "");
  if (env) return { apiKey: env, source: "env" };
  return { apiKey: "", source: "missing" };
}

function getEnvInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid env ${name}: ${raw}`);
  return Math.floor(n);
}

function parsePositiveDurationMs(raw: string, defaultUnit: DurationDefaultUnit): number {
  const v = String(raw).trim().toLowerCase();
  if (!v) throw new Error("empty duration");

  const m = v.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!m) throw new Error(`invalid duration: ${raw}`);

  const num = Number(m[1]);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`invalid duration: ${raw}`);

  const unit = (m[2] as "ms" | "s" | "m" | undefined) ?? defaultUnit;
  const ms = unit === "ms" ? num : unit === "s" ? num * 1000 : num * 60_000;
  if (!Number.isFinite(ms) || ms <= 0) throw new Error(`invalid duration: ${raw}`);
  return Math.floor(ms);
}

function resolveHttpTimeoutMs(): number {
  const msRaw = process.env.DOC2X_HTTP_TIMEOUT_MS;
  if (msRaw != null && String(msRaw).trim() !== "") return parsePositiveDurationMs(msRaw, "ms");

  const raw = process.env.DOC2X_HTTP_TIMEOUT;
  if (raw != null && String(raw).trim() !== "") return parsePositiveDurationMs(raw, "s");

  return 60_000;
}

export const RESOLVED_KEY = resolveApiKey();

export const CONFIG = Object.freeze({
  baseUrl: (process.env.DOC2X_BASE_URL || "https://v2.doc2x.noedgeai.com").replace(/\/+$/, ""),
  apiKey: RESOLVED_KEY.apiKey,
  httpTimeoutMs: resolveHttpTimeoutMs(),
  pollIntervalMs: getEnvInt("DOC2X_POLL_INTERVAL_MS", 2_000),
  maxWaitMs: getEnvInt("DOC2X_MAX_WAIT_MS", 600_000)
});

const DEFAULT_DOWNLOAD_HOST_SUFFIX_ALLOWLIST = Object.freeze([".amazonaws.com.cn", ".aliyuncs.com", ".noedgeai.com"]);

export function parseDownloadUrlAllowlist(): string[] {
  const raw = String(process.env.DOC2X_DOWNLOAD_URL_ALLOWLIST || "").trim();
  if (!raw) return [...DEFAULT_DOWNLOAD_HOST_SUFFIX_ALLOWLIST];
  if (raw === "*") return ["*"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isHostAllowedByAllowlist(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  for (const rule of allowlist) {
    const r = rule.toLowerCase();
    if (r === "*") return true;
    if (r.startsWith(".")) {
      if (host.endsWith(r)) return true;
      continue;
    }
    if (host === r) return true;
    if (host.endsWith("." + r)) return true;
  }
  return false;
}

