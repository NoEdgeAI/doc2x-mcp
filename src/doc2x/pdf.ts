import fsp from "node:fs/promises";
import path from "node:path";

import { CONFIG } from "../config.js";
import { ToolError } from "../errors.js";
import { jitteredBackoffMs, sleep } from "../utils.js";
import { doc2xRequestJson, putToSignedUrl } from "./client.js";

function mergePagesToText(result: any, joinWith: string): string {
  const pages = Array.isArray(result?.pages) ? result.pages.slice() : [];
  pages.sort((a: any, b: any) => (a.page_idx ?? 0) - (b.page_idx ?? 0));
  return pages.map((p: any) => String(p.md || "")).join(joinWith);
}

async function preuploadPdfWithRetry(): Promise<{ uid: string; url: string }> {
  let attempt = 0;
  while (true) {
    try {
      const data = await doc2xRequestJson("POST", "/api/v2/parse/preupload");
      return { uid: String(data.uid), url: String(data.url) };
    } catch (e) {
      if (e instanceof ToolError && e.retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw e;
    }
  }
}

export async function parsePdfSubmit(pdfPath: string): Promise<{ uid: string }> {
  const p = path.resolve(pdfPath);
  if (!p.toLowerCase().endsWith(".pdf")) throw new ToolError({ code: "invalid_argument", message: "pdf_path must end with .pdf", retryable: false });
  await fsp.access(p);

  let data = await preuploadPdfWithRetry();
  try {
    await putToSignedUrl(String(data.url), p);
  } catch {
    data = await preuploadPdfWithRetry();
    await putToSignedUrl(String(data.url), p);
  }
  return { uid: String(data.uid) };
}

export async function parsePdfStatus(uid: string) {
  const data = await doc2xRequestJson("GET", "/api/v2/parse/status", { query: { uid } });
  return { uid, status: String(data.status), progress: Number(data.progress ?? 0), detail: String(data.detail || ""), result: data.result ?? null };
}

export async function parsePdfWaitTextByUid(args: { uid: string; poll_interval_ms?: number; max_wait_ms?: number; join_with?: string }) {
  const pollInterval = args.poll_interval_ms ?? CONFIG.pollIntervalMs;
  const maxWait = args.max_wait_ms ?? CONFIG.maxWaitMs;
  const joinWith = args.join_with ?? "\n\n---\n\n";

  const uid = String(args.uid || "").trim();
  if (!uid) throw new ToolError({ code: "invalid_argument", message: "uid is required", retryable: false });

  const start = Date.now();
  let attempt = 0;
  while (true) {
    if (Date.now() - start > maxWait) throw new ToolError({ code: "timeout", message: `wait timeout after ${maxWait}ms`, retryable: true, uid });
    let st: Awaited<ReturnType<typeof parsePdfStatus>>;
    try {
      st = await parsePdfStatus(uid);
      attempt = 0;
    } catch (e) {
      if (e instanceof ToolError && e.retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw e;
    }
    if (st.status === "success") return { uid, status: "success", text: mergePagesToText(st.result, joinWith) };
    if (st.status === "failed") throw new ToolError({ code: "parse_failed", message: st.detail || "parse failed", retryable: true, uid });
    await sleep(pollInterval);
  }
}

export async function parsePdfWaitText(args: { uid?: string; pdf_path?: string; poll_interval_ms?: number; max_wait_ms?: number; join_with?: string }) {
  const uid = String(args.uid || "").trim();
  if (uid) {
    return parsePdfWaitTextByUid({ uid, poll_interval_ms: args.poll_interval_ms, max_wait_ms: args.max_wait_ms, join_with: args.join_with });
  }

  const pdfPath = String(args.pdf_path || "").trim();
  if (!pdfPath) {
    throw new ToolError({ code: "invalid_argument", message: "Either uid or pdf_path is required", retryable: false });
  }
  const { uid: newUid } = await parsePdfSubmit(pdfPath);
  return parsePdfWaitTextByUid({ uid: newUid, poll_interval_ms: args.poll_interval_ms, max_wait_ms: args.max_wait_ms, join_with: args.join_with });
}
