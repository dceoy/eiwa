/**
 * Minimal cross-platform smoke test for a deployed Eiwa URL (e.g. a
 * `wrangler deploy --temporary` preview). Usage:
 *
 *   pnpm run smoke:url https://<subdomain>.workers.dev
 */

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

async function checkHomepage(baseUrl: string): Promise<string[]> {
  const errors: string[] = [];
  const response = await fetch(`${baseUrl}/`);
  if (!response.ok) {
    errors.push(`GET / returned HTTP ${response.status}`);
    return errors;
  }
  const body = await response.text();
  if (!body.includes('<div id="app">')) {
    errors.push('GET / did not contain the expected <div id="app"> app root');
  }
  if (!response.headers.get("content-security-policy")) {
    errors.push("GET / is missing the Content-Security-Policy header (check public/_headers)");
  }
  return errors;
}

async function checkHealth(baseUrl: string): Promise<string[]> {
  const errors: string[] = [];
  const response = await fetch(`${baseUrl}/api/health`);
  if (!response.ok) {
    errors.push(`GET /api/health returned HTTP ${response.status}`);
    return errors;
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    errors.push("GET /api/health did not return valid JSON");
    return errors;
  }
  const expected = JSON.stringify({ ok: true, service: "eiwa" });
  if (JSON.stringify(json) !== expected) {
    errors.push(`GET /api/health returned unexpected body: ${JSON.stringify(json)}`);
  }
  return errors;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: pnpm run smoke:url <deployed-url>");
    process.exitCode = 1;
    return;
  }

  const baseUrl = normalizeBaseUrl(arg);
  const errors = [...(await checkHomepage(baseUrl)), ...(await checkHealth(baseUrl))];

  if (errors.length > 0) {
    console.error(`Smoke test failed against ${baseUrl}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Smoke test passed against ${baseUrl}: homepage and /api/health both OK.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
