# Phase C: on-device AI quality

Refs #105. BYOK is excluded because owner approval has not been given. No
server-side inference or API calling is in scope; all generation uses WebLLM
on the device, with zero operator inference cost.

## Implementation plan

Base: `main` at `4f21e02e7106ed598946129154f9f922976c7c01`.
Single draft PR on `feat/ai-quality`; leave draft and do not merge.

1. Expand bounded dictionary grounding to include retained senses, source labels,
   examples and IPA. Keep dictionary-only provenance and the AI result schema.
2. Publish validated complete JSON sections from the existing token stream,
   translation first. Show dictionary results before AI; preserve partial results
   silently when later generation fails or is cancelled.
3. Offer explicit Pro opt-in with download disclosure, keeping Lite default.
   Verify the exact model ID against the pinned WebLLM 0.2.87 registry.
4. Add a ready-engine-only back-translation action, labeled as AI output. Use
   the same local engine in the reverse direction and degrade failures quietly.

## Verification plan

Run prompt, streaming/orchestration, UI regression and model-registry tests;
`pnpm run check`; fixture Playwright e2e including a stubbed local engine;
production dictionary build; and `pnpm run eval:lookup` before/after. Spot-check
multiple senses for `run` using production data. This VM cannot run WebGPU
inference, so real-device model loading/generation remains unverified; tests
exercise everything up to the engine boundary instead.
