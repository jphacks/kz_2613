# Host implementation notes

- Inherit root `AGENTS.md` and `docs/requirements`.
- One in-memory authoritative session (MVP). Single worker; avoid separate process workers that would diverge role/key state.
- Separate `domain/` session state machine, WebSocket routing, and `platform/` OS input injection.
- Provide an explicit fail-closed release-all on every mode/epoch/focus/disconnect/shutdown transition. Never acknowledge a noop input driver as ready.
- Do not expose unauthenticated OS input or host-management endpoints to the local Wi-Fi network.
- Real Minecraft tests are manual hardware gates; mocked tests do not satisfy them.
