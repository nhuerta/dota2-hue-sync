# Dota 2 Hue Sync

Synchronizes Philips Hue entertainment lights with Dota 2 through Game State Integration (GSI). Dota posts its state to a local HTTP server every 100 ms; the server turns state changes into game events and the events into light effects.

## Features

**Ambient layer** (always on while nothing else plays)
- Health bar: green to red gradient following hero health
- Critical health (≤ 20 %): red breathing
- Out of game: steady idle blue

**Event effects** (one at a time, arbitrated by priority, see below)
- Death: red ripple, then a countdown pulse that follows the game's own respawn timer, then a respawn flash
- Buyback, kill, assist, first blood, multikill (double to rampage), killing spree (3 to 10+)
- Level up, match start
- Hero-specific abilities for Mirana, Weaver, Dark Seer, Enchantress, Spectre
- Map events from the GSI `events` node: Roshan, aegis, courier, bounty rune
- Hero status flags (stunned, silenced, hexed, …) as events you can map to effects

Everything is configurable in `config/effects-config.json`.

## Installation

### Requirements

- Bun runtime
- Dota 2
- Philips Hue bridge with an entertainment area that contains your lights

### Setup

1. **Clone and install**

```bash
git clone <repo-url>
cd dota2-hue-sync
bun install
```

2. **Configure environment**

Create a `.env` file:

```env
HUE_BRIDGE_ID=your-bridge-id
HUE_BRIDGE_IP=192.168.x.x
HUE_USERNAME=your-username
HUE_CLIENT_KEY=your-client-key
HUE_APP_NAME=dota2-gsi-entertainment
HUE_DEVICE_NAME=PC
HUE_GROUP_ID=200
```

`HUE_GROUP_ID` selects the entertainment area to stream to. It accepts the v1 numeric id (`200`), the Clip v2 UUID, or the area name as shown in the Hue app. Bridges with more than one entertainment area are supported; the area is resolved at startup and the available areas are listed if the value does not match.

Getting the bridge id, username and client key: the bridge id comes from `http://<bridge-ip>/api/config`. The username and client key are issued once by pressing the link button and then running, within 30 seconds:

```bash
curl -X POST http://<bridge-ip>/api \
  -d '{"devicetype":"dota2-gsi-entertainment#PC","generateclientkey":true}'
```

Optional variables:

| Variable | Effect |
| --- | --- |
| `GSI_RECORD_DIR` | Record every incoming frame to `<dir>/gsi-<timestamp>.jsonl` for replay and tests |
| `GSI_AUTH_TOKEN` | Reject frames whose `auth.token` does not match (set the same value in the GSI cfg) |
| `GSI_ALLOW_REMOTE` | `1` accepts senders other than loopback; off by default |

3. **Install the Dota 2 GSI config**

Copy `config/gamestate_integration_gsi.cfg` to:

```
Windows: C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\
macOS:   ~/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/
Linux:   ~/.steam/steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/
```

Restart Dota after adding it. Dota only starts posting once you are in a lobby or match.

4. **Start the server**

```bash
bun run start
```

The server listens on `http://localhost:3003` (IPv4 and IPv6).

## Configuration

### Effects

Each entry in `config/effects-config.json` maps an event key to an effect:

```json
{
  "version": "1.0",
  "effects": {
    "player:combat:kill": {
      "enabled": true,
      "type": "randomColorSequence",
      "params": { "duration": 3000 },
      "priority": "high"
    }
  }
}
```

- `type` is any effect from [node-hue-edk](https://github.com/nhuerta/node-hue-edk/blob/main/EFFECTS.md), e.g. `flashColor`, `gradientWave`, `rippleGradient`, `pulseWave`, `meteorShower`, `flashingColorSequence`.
- `params` are validated at load time; colour names must exist in the wrapper's `COLORS`.
- `runTime` or `duration` decides how long the effect owns the strip (default 2000 ms).
- `priority` is optional: `low`, `normal`, `high` or `critical`. Defaults: kills, buyback, Roshan and aegis are `high`; assists, level-ups and courier kills are `normal`; `game:*` events are `critical`; everything else is `low`.

Unknown event keys are rejected when the config loads, so a typo cannot register a handler that never fires.

### Event keys

Keys use colons.

| Group | Keys |
| --- | --- |
| Connection | `gsi:connected`, `gsi:disconnected`, `gsi:error` |
| Match | `game:started`, `game:ended`, `game:first_blood`, `game:paused`, `game:unpaused`, `game:reconnected` |
| Combat | `player:combat:kill`, `player:combat:assist`, `player:combat:death`, `player:combat:respawn`, `player:combat:buyback`, `player:combat:multikill`, `player:combat:spree` |
| Resources | `player:resources:level_up`, `player:resources:health_changed`, `player:resources:mana_changed`, `player:resources:gold_changed` |
| Items | `player:items:purchased`, `player:items:used`, `player:items:dropped` |
| Abilities | `player:abilities:used`, `player:abilities:upgraded` |
| Status flags | `player:status:stunned`, `silenced`, `disarmed`, `magic_immune`, `hexed`, `muted`, `break`, `smoked` (data has `active: true/false`) |
| Map | `map:roshan_killed`, `map:aegis_picked_up`, `map:aegis_denied`, `map:courier_killed`, `map:bounty_rune_pickup`, `map:tip` |
| Mirana | `hero:mirana:arrow_cast`, `starfall`, `leap`, `moonlight`, `celestial_quiver` |
| Weaver | `hero:weaver:the_swarm`, `shukuchi`, `germinate_attack`, `time_lapse` |
| Dark Seer | `hero:dark_seer:vacuum`, `ion_shell`, `surge`, `wall_of_replica` |
| Enchantress | `hero:enchantress:untouchable`, `enchant`, `natures_attendants`, `impetus` |
| Spectre | `hero:spectre:spectral_dagger`, `desolate`, `dispersion`, `haunt` |

The full list lives in `GAME_EVENTS` in `src/game/events.ts`; the `GameEventType` type is derived from it.

## How it works

```
Dota 2 → HTTP POST → routes.ts (ingest) → GameEventDetector → EventDispatcher → DotaEffectManager → EffectScheduler → Hue
```

1. **Ingest** (`src/server/routes.ts`): records the frame if `GSI_RECORD_DIR` is set, tracks the connection (a watchdog fires `gsi:disconnected` after 10 s without frames), hands the frame to the detector.
2. **Detector** (`src/game/detector.ts`): diffs the frame against Dota's `previously` block, or against the last frame it saw when `previously` is missing (heartbeats, first frame after a pause). Only the very first frame, or a change of match id, is a cold start. Death and respawn follow `hero.alive`; buyback follows `hero.buyback_cooldown`; match end follows `POST_GAME` or `win_team`; item purchases and drops are diffed by name so recipe combines and slot moves are not drops.
3. **Scheduler** (`src/game/effect-scheduler.ts`): holds at most one effect. A request of equal or higher priority replaces the running one, so ability spam always shows the latest cast; a lower priority request is dropped. Nothing plays late. Every effect has a finite duration, and the ambient layer is a painter that runs whenever no effect is playing.
4. **Manager** (`src/game/dota-effect-manager.ts`): maps events to scheduler requests, paints the ambient layer, and runs the death sequence. The countdown is re-synced from `hero.respawn_seconds`, so a pause does not desync it. When Dota stops posting (pause, leaving, often before `POST_GAME`) the lights drop to idle until frames return.
5. **Hue** (`@nhuerta/node-hue-edk`): native wrapper around the Hue Entertainment Development Kit streaming at 60 Hz.

## Development

```bash
bun run start      # Start the GSI server
bun run test       # Replay the recorded match and synthetic sequences through the detector; scheduler tests
bun run showcase   # Interactive effect browser against the real lights
bun run typecheck
bun run lint
```

### Fixtures and replay

`fixtures/match_8200614096.jsonl.gz` is a complete recorded Mirana match (1,924 unique frames including 18 heartbeats, 3 deaths, every game-state transition). `tests/detector.test.ts` replays it through the same ingest path the server uses and asserts the emitted event sequence; the capture timestamps drive the clock, so gaps produce the same disconnects the watchdog would.

To add a match: run with `GSI_RECORD_DIR=recordings`, play, then gzip the `.jsonl`. Old-format logs are imported with `python -I scripts/import-fixtures.py <logs-dir> <out.jsonl.gz>`.

`src/testing/replay.ts` exposes `loadFixture`, `replayFrames` and a `RecordingDispatcher` for new tests.

## Troubleshooting

**Lights not responding**
- Check the `.env` credentials and that the bridge is on the same network.
- Only one application can stream to an entertainment area; the bridge holds a previous instance's stream for about 10 s after it dies. Initialization retries six times, three seconds apart.
- `bun run showcase` tests the connection without Dota.

**GSI not working**
- Verify the cfg is in the right directory and Dota was restarted.
- Dota posts nothing until you are in a lobby. Look for `[gsi] connected on frame:` in the console.
- If `GSI_AUTH_TOKEN` is set, the token in the cfg must match (frames are answered with 401 otherwise).

**Effects not triggering**
- `"enabled": true` in `config/effects-config.json`, valid colour names, and a known event key (the loader reports the offending key).
- The console logs `[event] …` for every detected event and `[scheduler] …` for every start, replacement, drop and finish.
