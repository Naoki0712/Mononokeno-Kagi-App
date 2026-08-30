interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

const PREFIX = "/api/supabase";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (!requestUrl.pathname.startsWith(`${PREFIX}/`)) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (!env.SUPABASE_URL) {
      return json({ ok: false, error: "supabase_url_not_configured" }, 503);
    }

    const upstreamBase = env.SUPABASE_URL.replace(/\/$/, "");
    const upstreamPath = requestUrl.pathname.slice(PREFIX.length);

    // The app currently uses PostgREST/RPC. Keep the public proxy surface narrow.
    if (!upstreamPath.startsWith("/rest/v1/")) {
      return json({ ok: false, error: "unsupported_supabase_path" }, 404);
    }

    const upstreamUrl = new URL(`${upstreamBase}${upstreamPath}`);
    upstreamUrl.search = requestUrl.search;

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("origin");
    headers.delete("referer");
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

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("Supabase proxy request failed", error);
      return json({ ok: false, error: "upstream_unavailable" }, 502);
    }
  },
};
