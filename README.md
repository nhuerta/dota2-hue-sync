# Dota 2 Hue Sync

Philips Hue entertainment lights that follow your Dota 2 match. Dota posts its game state to a local server every 100 ms; the server turns changes into events and events into light effects streamed at 60 Hz.

## Setup

1. `bun install`
2. Create `.env`:

```env
HUE_BRIDGE_ID=...
HUE_BRIDGE_IP=192.168.x.x
HUE_USERNAME=...
HUE_CLIENT_KEY=...
HUE_APP_NAME=dota2-gsi-entertainment
HUE_DEVICE_NAME=PC
HUE_GROUP_ID=200        # entertainment area: v1 id, Clip v2 UUID, or its name
```

   Bridge id: `http://<bridge-ip>/api/config`. Username and client key: press the link button, then within 30 s run
   `curl -X POST http://<bridge-ip>/api -d '{"devicetype":"dota2-gsi-entertainment#PC","generateclientkey":true}'`.

3. Copy `config/gamestate_integration_gsi.cfg` to `...\dota 2 beta\game\dota\cfg\gamestate_integration\` and restart Dota.
4. `bun run start`

Dota only posts once you are in a lobby. The console prints one line per event and per light effect.

## What the lights do

- **Ambient**: health bar gradient; red breathing under 20 % health; idle blue outside a match.
- **Events**: death ripple and a countdown that follows the game's respawn timer, respawn flash, buyback, kill, assist, first blood, multikill, killing spree, level up, match start, Roshan and aegis, hero abilities (Mirana, Weaver, Dark Seer, Enchantress, Spectre).
- One effect plays at a time. Equal or higher priority replaces it; lower priority is dropped.

## Configuration

`config/effects-config.json` maps event keys to effects:

```json
"player:combat:kill": { "enabled": true, "type": "randomColorSequence", "params": { "duration": 3000 }, "priority": "high" }
```

Effect types, their parameters and defaults are listed by `bun run showcase`. Event keys are listed in `src/game/events.ts`. The config is validated on start: unknown keys, effect types, parameters, colours or priorities stop the server with a message.

Optional environment: `GSI_RECORD_DIR` records every frame as JSONL for replay; `GSI_AUTH_TOKEN` must match the token in the cfg; `GSI_ALLOW_REMOTE=1` accepts senders other than loopback.

## Development

```bash
bun run test       # replays a recorded match and synthetic sequences through the real pipeline
bun run typecheck
bun run lint
bun run showcase   # browse effects on the real lights
```

Layout: `src/server` (HTTP, watchdog, recorder) → `src/game/detectors` (pure diffs of consecutive frames) → `src/game/events.ts` (dispatcher) → `src/game/dota-effect-manager.ts` (state machine) → `src/game/effect-scheduler.ts` (priority) → `src/game/effect-catalog.ts` (effect definitions) → `@nhuerta/node-hue-edk`.

## Troubleshooting

- **Hue connection failed**: check `.env`; only one app can stream to an area and the bridge holds a dead stream for ~10 s, so start-up retries six times.
- **No events**: make sure Dota was restarted after copying the cfg, and look for `[gsi] connected` in the console.
- **Effect not playing**: the console shows `[scheduler] dropped …` when a higher priority effect was running.
