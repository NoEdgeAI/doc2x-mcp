import fs from 'node:fs';
import fsp from 'node:fs/promises';

import { CONFIG } from '#config';
import { ToolError } from '#errors';
import {
  TOOL_ERROR_CODE_INVALID_JSON,
  TOOL_ERROR_CODE_MISSING_API_KEY,
  httpErrorCode,
  putFailedCode,
} from '#errorCodes';
import { jitteredBackoffMs, sleep } from '#utils';
import { DOC2X_API_CODE_SUCCESS } from '#doc2x/constants';
import { HTTP_METHOD_PUT, type HttpMethod } from '#doc2x/http';

async function fetchJson(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { res, text, json };
  } finally {
    clearTimeout(t);
  }
}

export function normalizeUrl(u: string): string {
  return String(u).replace(/\\u0026/g, '&');
}

export function isRetryableDoc2xBusinessCode(code: string): boolean {
  switch (code) {
    case 'parse_error':
    case 'parse_create_task_error':
    case 'parse_task_limit_exceeded':
    case 'parse_concurrency_limit':
    case 'parse_status_not_found':
      return true;
    default:
      return false;
  }
}

export function doc2xHeaders(extra?: Record<string, string>) {
  if (!CONFIG.apiKey) {
    throw new ToolError({
      code: TOOL_ERROR_CODE_MISSING_API_KEY,
      message:
        'Doc2x API key is not configured (set INLINE_DOC2X_API_KEY in src/config.ts or provide DOC2X_API_KEY env).',
      retryable: false,
    });
  }
  return {
    Authorization: `Bearer ${CONFIG.apiKey}`,
    ...(extra || {}),
  };
}

type Doc2xRequestOpts = {
  query?: Record<string, string>;
  body?: any;
  raw_body?: BodyInit;
  headers?: Record<string, string>;
};

export async function doc2xRequestJson(
  method: HttpMethod,
  pathname: string,
  opts?: Doc2xRequestOpts,
) {
  const url = new URL(CONFIG.baseUrl + pathname);
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }

  const init: RequestInit = { method, headers: doc2xHeaders(opts?.headers) };
  if (opts?.raw_body != null) {
    init.body = opts.raw_body;
  } else if (opts?.body != null) {
    init.headers = doc2xHeaders({ ...(opts.headers || {}), 'Content-Type': 'application/json' });
    init.body = JSON.stringify(opts.body);
  }

  let attempt = 0;
  while (true) {
    const { res, json, text } = await fetchJson(url.toString(), init, CONFIG.httpTimeoutMs);
    if (res.status === 429) {
      await sleep(jitteredBackoffMs(attempt++));
      continue;
    }
    if (!res.ok) {
      const snippet = text ? text.slice(0, 300) : '';
      throw new ToolError({
        code: httpErrorCode(res.status),
        message: `Doc2x HTTP error: ${res.status} ${res.statusText}${snippet ? `; body=${JSON.stringify(snippet)}` : ''}`,
        retryable: res.status >= 500 || res.status === 408 || res.status === 429,
      });
    }
    if (!json) {
      throw new ToolError({
        code: TOOL_ERROR_CODE_INVALID_JSON,
        message: `Doc2x returned non-JSON: ${text.slice(0, 200)}`,
        retryable: false,
      });
    }
    if (json.code !== DOC2X_API_CODE_SUCCESS) {
      const code = String(json.code || 'doc2x_error');
      const retryable = isRetryableDoc2xBusinessCode(code);
      if (retryable) {
        await sleep(jitteredBackoffMs(attempt++));
        continue;
      }
      throw new ToolError({ code, message: String(json.msg || 'Doc2x error'), retryable });
    }
    return json.data;
  }
}

export async function putToSignedUrl(signedUrl: string, filePath: string) {
  const stat = await fsp.stat(filePath);
  const body = fs.createReadStream(filePath);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.httpTimeoutMs);
  try {
    const res = await fetch(signedUrl, {
      method: HTTP_METHOD_PUT,
      body: body as any,
      duplex: 'half' as any,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(stat.size),
      },
      signal: ctrl.signal,
    } as any);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new ToolError({
        code: putFailedCode(res.status),
        message: `PUT to signed url failed: ${res.status} ${res.statusText} ${txt.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 408,
      });
    }
  } finally {
    clearTimeout(t);
  }
}
