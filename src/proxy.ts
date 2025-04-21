// src/proxy.ts

// --- Depends on these helpers in src/b2.ts ---
// export async function authorizeAccount(auth: string): Promise<Account> {...}
// export async function getDownloadAuthorization(apiUrl: string, token: string, bucketId: string, fileName: string, validSeconds?: number): Promise<string> {...}

import { authorizeAccount, getDownloadAuthorization } from "./b2";

// 100 MB size limit for Cloudflare Worker streaming
const MAX_WORKER_SIZE = 100 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("ok", { status: 200 });
    }

    // 1. Serve from Cloudflare cache if possible
    const cache = caches.default;
    let response = await cache.match(request);
    if (response) return response;

    // 2. Authorize with B2
    const account = await authorizeAccount(env.AUTH_HEADER);
    if (!account.ok && account.status === 401) {
      return new Response("Error: AUTH_HEADER is not correctly set", { status: 401 });
    }
    if (!account.downloadUrl || !account.authorizationToken) {
      return new Response("B2 authorization failed", { status: 502 });
    }

    // 3. Build B2 URL
    const b2url = account.downloadUrl + "/file/" + env.BUCKET_NAME + url.pathname;
    const params = { b2CacheControl: env.CACHE_CONTROL };
    const b2urlWithParams = b2url + "?" + new URLSearchParams(params);

    // 4. HEAD request to check object size
    const headResp = await fetch(b2urlWithParams, {
      method: "HEAD",
      headers: { Authorization: account.authorizationToken }
    });
    if (!headResp.ok) {
      return new Response("Not found", { status: 404 });
    }
    const size = parseInt(headResp.headers.get("content-length") || "0");

    // 5. If big, generate signed download URL and redirect
    if (size > MAX_WORKER_SIZE) {
      try {
        const apiUrl = account.apiUrl || account.downloadUrl.replace(/\/file$/, "");
        const bucketId = env.BUCKET_ID;
        // fileName = url.pathname with NO leading slash
        const fileName = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
        const validSecs = 10 * 60; // 10 min
        const dlAuth = await getDownloadAuthorization(apiUrl, account.authorizationToken, bucketId, fileName, validSecs);
        const sep = b2urlWithParams.includes('?') ? '&' : '?';
        const signedUrl = b2urlWithParams + sep + "Authorization=" + encodeURIComponent(dlAuth);
        return Response.redirect(signedUrl, 302);
      } catch (err) {
        return new Response("Failed to generate signed download url: " + (err?.message || err), { status: 500 });
      }
    }

    // 6. Download and cache file from B2 (< 100MB only)
    const b2Resp = await fetch(b2urlWithParams, {
      headers: { Authorization: account.authorizationToken }
    });
    let resp2 = new Response(b2Resp.body, b2Resp);
    resp2.headers.set("Cache-Control", env.CACHE_CONTROL);
    ctx.waitUntil(cache.put(request, resp2.clone()));
    return resp2;
  }
}
