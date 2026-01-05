import fsp from "node:fs/promises";
import path from "node:path";

import { CONFIG } from "../config.js";
import { ToolError } from "../errors.js";
import { jitteredBackoffMs, sleep } from "../utils.js";
import { doc2xHeaders, doc2xRequestJson, isRetryableDoc2xBusinessCode } from "./client.js";

async function readFileChecked(filePath: string, maxBytes: number): Promise<Buffer> {
  const p = path.resolve(filePath);
  const st = await fsp.stat(p);
  if (st.size > maxBytes) throw new ToolError({ code: "file_too_large", message: `file too large: ${st.size} bytes`, retryable: false });
  return await fsp.readFile(p);
}

export async function parseImageLayoutSync(imagePath: string) {
  const buf = await readFileChecked(imagePath, 7 * 1024 * 1024);
  const url = CONFIG.baseUrl + "/api/v2/parse/img/layout";

  let attempt = 0;
  while (true) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONFIG.httpTimeoutMs);
    try {
      const res = await fetch(url, { method: "POST", headers: doc2xHeaders(), body: new Uint8Array(buf), signal: ctrl.signal });
      if (res.status === 429) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) throw new ToolError({ code: `http_${res.status}`, message: `Doc2x HTTP error: ${res.status}`, retryable: res.status >= 500 || res.status === 429 });
      if (!json || json.code !== "success") {
        const code = String(json?.code || "doc2x_error");
        const retryable = isRetryableDoc2xBusinessCode(code);
        if (retryable) {
          await sleep(jitteredBackoffMs(attempt++));
          continue;
        }
        throw new ToolError({ code, message: String(json?.msg || "Doc2x error"), retryable });
      }
      return { uid: String(json.data.uid), result: json.data.result, convert_zip: json.data.convert_zip ?? null };
    } finally {
      clearTimeout(t);
    }
  }
}

export async function parseImageLayoutSubmit(imagePath: string) {
  const buf = await readFileChecked(imagePath, 7 * 1024 * 1024);
  const url = CONFIG.baseUrl + "/api/v2/async/parse/img/layout";

  let attempt = 0;
  while (true) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONFIG.httpTimeoutMs);
    try {
      const res = await fetch(url, { method: "POST", headers: doc2xHeaders(), body: new Uint8Array(buf), signal: ctrl.signal });
      if (res.status === 429) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) throw new ToolError({ code: `http_${res.status}`, message: `Doc2x HTTP error: ${res.status}`, retryable: res.status >= 500 || res.status === 429 });
      if (!json || json.code !== "success") {
        const code = String(json?.code || "doc2x_error");
        const retryable = isRetryableDoc2xBusinessCode(code);
        if (retryable) {
          await sleep(jitteredBackoffMs(attempt++));
          continue;
        }
        throw new ToolError({ code, message: String(json?.msg || "Doc2x error"), retryable });
      }
      return { uid: String(json.data.uid) };
    } finally {
      clearTimeout(t);
    }
  }
}

export async function parseImageLayoutStatus(uid: string) {
  const data = await doc2xRequestJson("GET", "/api/v2/parse/img/layout/status", { query: { uid } });
  return { uid, status: String(data.status), result: data.result ?? null, convert_zip: data.convert_zip ?? null };
}

export async function parseImageLayoutWaitTextByUid(args: { uid: string; poll_interval_ms?: number; max_wait_ms?: number }) {
  const pollInterval = args.poll_interval_ms ?? CONFIG.pollIntervalMs;
  const maxWait = args.max_wait_ms ?? Math.min(CONFIG.maxWaitMs, 300_000);
  const uid = String(args.uid || "").trim();
  if (!uid) throw new ToolError({ code: "invalid_argument", message: "uid is required", retryable: false });

  const start = Date.now();
  let attempt = 0;
  while (true) {
    if (Date.now() - start > maxWait) throw new ToolError({ code: "timeout", message: `wait timeout after ${maxWait}ms`, retryable: true, uid });
    let st: Awaited<ReturnType<typeof parseImageLayoutStatus>>;
    try {
      st = await parseImageLayoutStatus(uid);
      attempt = 0;
    } catch (e) {
      if (e instanceof ToolError && e.retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw e;
    }
    if (st.status === "success") {
      const md = String(st?.result?.pages?.[0]?.md || "");
      return { uid, status: "success", text: md };
    }
    if (st.status === "failed") throw new ToolError({ code: "parse_failed", message: "parse failed", retryable: true, uid });
    await sleep(pollInterval);
  }
}

export async function parseImageLayoutWaitText(args: {
  uid?: string;
  image_path?: string;
  async?: boolean;
  poll_interval_ms?: number;
  max_wait_ms?: number;
}) {
  const uid = String(args.uid || "").trim();
  if (uid) {
    return parseImageLayoutWaitTextByUid({ uid, poll_interval_ms: args.poll_interval_ms, max_wait_ms: args.max_wait_ms });
  }

  const imagePath = String(args.image_path || "").trim();
  if (!imagePath) throw new ToolError({ code: "invalid_argument", message: "Either uid or image_path is required", retryable: false });

  const pollInterval = args.poll_interval_ms ?? CONFIG.pollIntervalMs;
  const maxWait = args.max_wait_ms ?? Math.min(CONFIG.maxWaitMs, 300_000);
  const useAsyncMode = args.async !== false;

  if (!useAsyncMode) {
    const data = await parseImageLayoutSync(imagePath);
    const md = String(data?.result?.pages?.[0]?.md || "");
    return { uid: data.uid, status: "success", text: md };
  }

  const { uid: newUid } = await parseImageLayoutSubmit(imagePath);
  return parseImageLayoutWaitTextByUid({ uid: newUid, poll_interval_ms: pollInterval, max_wait_ms: maxWait });
}
