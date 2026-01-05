import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { CONFIG, isHostAllowedByAllowlist, parseDownloadUrlAllowlist } from "../config.js";
import { ToolError } from "../errors.js";
import { normalizeUrl } from "./client.js";

export async function downloadUrlToFile(args: { url: string; output_path: string }) {
  const outPath = path.resolve(args.output_path);
  await fsp.mkdir(path.dirname(outPath), { recursive: true });

  const normalizedUrl = normalizeUrl(args.url);
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new ToolError({ code: "invalid_url", message: "download failed: invalid url", retryable: false });
  }
  if (parsed.protocol !== "https:") {
    throw new ToolError({ code: "unsafe_url", message: `download blocked: only https URLs are allowed (${parsed.protocol})`, retryable: false });
  }
  const allowlist = parseDownloadUrlAllowlist();
  if (!isHostAllowedByAllowlist(parsed.hostname, allowlist)) {
    throw new ToolError({
      code: "unsafe_url",
      message: `download blocked: host not allowed (${parsed.hostname}); set DOC2X_DOWNLOAD_URL_ALLOWLIST=\"*\" to allow any host, or provide a comma-separated allowlist`,
      retryable: false
    });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.httpTimeoutMs);
  try {
    const res = await fetch(normalizedUrl, { method: "GET", signal: ctrl.signal });
    if (!res.ok) {
      throw new ToolError({
        code: `http_${res.status}`,
        message: `download failed: ${res.status} ${res.statusText}`,
        retryable: res.status >= 500 || res.status === 408 || res.status === 429
      });
    }
    if (!res.body) throw new ToolError({ code: "empty_body", message: "download failed: empty body", retryable: true });

    const file = fs.createWriteStream(outPath);
    await new Promise<void>((resolve, reject) => {
      file.on("error", reject);
      file.on("finish", resolve);
      Readable.fromWeb(res.body as any).on("error", reject).pipe(file);
    });
    const stat = await fsp.stat(outPath);
    return { output_path: outPath, bytes_written: stat.size };
  } finally {
    clearTimeout(t);
  }
}

