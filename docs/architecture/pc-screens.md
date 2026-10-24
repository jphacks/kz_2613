# Desktop UI: three major screens + game window (proposal)

Reference mockup `../design/pc-wireframe-draft.png` shows three empty regions named "QRコード、人数表示", "選択画面", "操作項目分担". It is a wireframe, not final UI. The user has **not separately ratified** detailed transitions yet.

1. **Connection lobby** — SSID/network state, session join URL & QR, first-joined host indicator, 0–3 attendees, P1/P2/P3, reconnect instructions. Android/iOS may require Wi-Fi joining before scanning an app URL QR.
2. **Game selection** — chosen game profile, manual game launching is allowed in P0; auto launcher crawling/detection and launching are P2. Keyboard focus/arrow/Enter/Esc navigation mandatory if this screen is used via host phone.
3. **Role review** — fixed Minecraft mapping P1 move/Ctrl, P2 look, P3 action; readiness/focus guard; Start by host from phone. Role editor not P0.
4. **Actual Minecraft foreground** — NOT another Re:Cooplay desktop UI screen. Host phone still has Pause/Resume; after Pause the host remote mode can operate game menu, but Re:Cooplay Pause does not automatically pause Minecraft itself.

Cross-screen status strips/alerts must show connectivity, target game/focus, mode, errors and emergency stop. Don't create separate complex settings/error pages just because the flow suggests them. Game exit/return to selection should preserve joined phone roles and session.

**Critical nuance:** permission state and desktop visible screen are different things. Start requires 3 participants plus valid target readiness; the UI must not trigger unchecked OS injection. If Windows focus isn't safely established, block Start and provide manual focus instructions.
