interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

const PREFIX = "/api/supabase";
const ALLOWED_ORIGINS = new Set([
  "https://mononokeno-kagi.space",
  "https://www.mononokeno-kagi.space",
  "https://naoki0712.github.io",
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin") ?? "";

  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }

  headers.set("access-control-allow-methods", "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ??
      "authorization, apikey, content-type, x-client-info, prefer, range",
  );
  headers.set("access-control-max-age", "86400");
  return headers;
}

function json(request: Request, body: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (!requestUrl.pathname.startsWith(`${PREFIX}/`)) {
      return json(request, { ok: false, error: "not_found" }, 404);
    }

    if (!env.SUPABASE_URL) {
      return json(request, { ok: false, error: "supabase_url_not_configured" }, 503);
    }

    const upstreamBase = env.SUPABASE_URL.replace(/\/$/, "");
    const upstreamPath = requestUrl.pathname.slice(PREFIX.length);

    // The app currently uses PostgREST/RPC. Keep the public proxy surface narrow.
    if (!upstreamPath.startsWith("/rest/v1/")) {
      return json(request, { ok: false, error: "unsupported_supabase_path" }, 404);
    }

    const upstreamUrl = new URL(`${upstreamBase}${upstreamPath}`);
    upstreamUrl.search = requestUrl.search;

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("origin");
    headers.delete("referer");
    headers.delete("access-control-request-method");
    headers.delete("access-control-request-headers");
    headers.set("accept-encoding", "identity");

    if (env.SUPABASE_PUBLISHABLE_KEY && !headers.has("apikey")) {
      headers.set("apikey", env.SUPABASE_PUBLISHABLE_KEY);
    }
    if (env.SUPABASE_PUBLISHABLE_KEY && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`);
    }

    const upstreamRequest = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    try {
      const upstreamResponse = await fetch(upstreamRequest);
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set("cache-control", "no-store");
      responseHeaders.delete("access-control-allow-origin");
      responseHeaders.delete("access-control-allow-credentials");

      for (const [name, value] of corsHeaders(request)) {
        responseHeaders.set(name, value);
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("Supabase proxy request failed", error);
      return json(request, { ok: false, error: "upstream_unavailable" }, 502);
    }
  },
};
