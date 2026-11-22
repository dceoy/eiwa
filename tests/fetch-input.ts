/** Resolve Fetch and Cache API inputs to their request URL in test adapters. */
export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}
