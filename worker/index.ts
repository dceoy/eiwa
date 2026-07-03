export interface Env {
  ASSETS: Fetcher;
}

const HEALTH_PATH = "/api/health";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === HEALTH_PATH) {
      return Response.json({ ok: true, service: "eiwa" });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
