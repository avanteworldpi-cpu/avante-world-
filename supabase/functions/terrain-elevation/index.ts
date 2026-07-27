import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Proxies Open Topo Data server-to-server. The public Open Topo Data API doesn't
 * send Access-Control-Allow-Origin, so a browser fetch straight to it is blocked
 * by CORS in every environment, not just locally -- confirmed live, not assumed.
 * This function makes the same request from Deno (no CORS involved server-side)
 * and re-serves the result with CORS headers of our own, so the browser is
 * calling same-project (Supabase) origin instead of the third party directly.
 */
const OPEN_TOPO_DATA_URL = "https://api.opentopodata.org/v1/aster30m";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { locations } = await req.json();

    if (typeof locations !== "string" || locations.length === 0) {
      return new Response(JSON.stringify({ status: "ERROR", error: "Missing locations" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const upstream = await fetch(`${OPEN_TOPO_DATA_URL}?locations=${encodeURIComponent(locations)}`);
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ status: "ERROR", error: String(error) }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
