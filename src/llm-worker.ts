import type { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
import { loadWebLlm } from "./webllm-cdn";

let handler: WebWorkerMLCEngineHandler | null = null;
const pendingMessages: MessageEvent[] = [];

self.onmessage = (event: MessageEvent) => {
  if (handler) {
    handler.onmessage(event);
    return;
  }
  pendingMessages.push(event);
};

void loadWebLlm().then(({ WebWorkerMLCEngineHandler: Handler }) => {
  handler = new Handler();
  for (const event of pendingMessages.splice(0)) {
    handler.onmessage(event);
  }
});
