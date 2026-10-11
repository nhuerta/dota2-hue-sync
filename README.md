# Dota 2 Hue Sync

Synchronizes Philips Hue lights with Dota 2 gameplay using Game State Integration (GSI). Real-time lighting effects triggered by in-game events.

## Features

**Game Event Synchronization**
- Health bar visualization (dynamic color gradient)
- Death/respawn effects (ripple, countdown, revival flash)
- Level up celebrations
- Kill/death notifications
- Item purchases
- Ability usage (hero-specific effects)
- Critical health breathing effect (< 20% HP)

**Supported Heroes (Custom Ability Effects)**
- Mirana (Arrow, Starfall, Leap, Moonlight Shadow)
- Weaver (Swarm, Shukuchi, Germinate Attack, Time Lapse)
- Dark Seer (Vacuum, Ion Shell, Surge, Wall of Replica)
- Enchantress (Untouchable, Enchant, Nature's Attendants, Impetus)
- Spectre (Spectral Dagger, Desolate, Dispersion, Haunt)

**Configurable Effects**
- JSON-based effect configuration (`config/effects-config.json`)
- Enable/disable individual effects
- Customize colors, durations, and parameters
- Validated against available color palette

## Installation

### Requirements

- Bun runtime
- Dota 2
- Philips Hue Bridge with Entertainment API
- Hue Entertainment group configured

### Setup

1. **Clone and install**

```bash
git clone <repo-url>
cd dota2-hue-sync
bun install
```

2. **Configure environment**

Create `.env` file:

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

3. **Install Dota 2 GSI config**

Copy `config/gamestate_integration_gsi.cfg` to:

```
Windows: C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\
macOS: ~/Library/Application Support/Steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/
Linux: ~/.steam/steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/
```

4. **Start the server**

```bash
bun run start
```

Server listens on `http://localhost:3003`

## Configuration

### Effect Configuration

Edit `config/effects-config.json` to customize effects:

```json
{
  "version": "1.0",
  "effects": {
    "player.combat.kill": {
      "enabled": true,
      "type": "flashColor",
      "params": {
        "color": "brightGreen",
        "duration": 500
      }
    }
  }
}
```

**Available effect types:**
- `flashColor` - Quick bright flash
- `gradientWave` - Smooth color wave
- `rippleGradient` - Center-out ripple
- `explosionFlash` - Explosion with decay
- `lightningStrike` - Lightning effect
- `pulseWave` - Pulsing colors
- Many more (see [node-hue-edk EFFECTS.md](https://github.com/nhuerta/node-hue-edk/blob/main/EFFECTS.md))

### Game Events

Available event triggers:

**Player Events:**
- `player.combat.kill` - Player kills enemy
- `player.combat.death` - Player dies
- `player.combat.respawn` - Player respawns
- `player.combat.buyback` - Player buybacks
- `player.resources.level_up` - Level up
- `player.resources.health_changed` - Health updates

**Item/Ability Events:**
- `player.items.purchased` - Item bought
- `player.abilities.level_up` - Ability leveled
- `abilities.<hero>.<ability>` - Hero-specific ability used

**Game Events:**
- `game.started` - Match begins
- `game.ended` - Match ends
- `gsi.connected` - GSI connection established

## Architecture

**Components:**

1. **GSI Server** (`src/server/`)
   - Bun HTTP server on port 3003
   - Receives POST requests from Dota 2
   - Validates and routes game state data

2. **Event System** (`src/game/events.ts`)
   - Central event dispatcher
   - Wildcard support for debugging
   - Type-safe event definitions

3. **Event Detection** (`src/game/detector.ts`)
   - Compares current vs previous game state
   - Detects state changes (kills, deaths, purchases, etc.)
   - Emits events to dispatcher

4. **Effect Manager** (`src/game/dota-effect-manager.ts`)
   - Maps events to light effects
   - Manages effect priorities and interruption
   - Handles health visualization
   - Controls death/respawn sequences

5. **Effect Registry** (`src/game/effect-registry.ts`)
   - Effect type definitions
   - Parameter validation
   - Color name resolution

6. **Hue Integration** (`@nhuerta/node-hue-edk`)
   - Native C++ wrapper for Hue EDK
   - 40+ pre-built light effects
   - See [node-hue-edk](https://github.com/nhuerta/node-hue-edk)

**Data Flow:**

```
Dota 2 → GSI → HTTP POST → GSI Router → Event Detector → Event Dispatcher → Effect Manager → Hue Lights
```

## Development

**Scripts:**

```bash
bun run start      # Start GSI server
bun run showcase   # Test effects interactively
bun run typecheck  # TypeScript validation
bun run lint       # ESLint check
bun run lint:fix   # Auto-fix linting issues
```

**Testing Effects:**

Use the showcase tool to test effects without running Dota 2:

```bash
bun run showcase
```

Interactive menu allows triggering any effect with custom parameters.

## How It Works

1. **Dota 2 sends game state** to `http://localhost:3003/` every 100ms
2. **GSI server** receives and validates JSON payload
3. **Event detector** compares state changes (previous vs current)
4. **Events are emitted** for detected changes
5. **Effect manager** listens and triggers corresponding light effects
6. **Hue wrapper** sends commands to entertainment group via native EDK

**Effect Priority System:**
- Active effects can be interrupted by new events
- Health display runs continuously when idle
- Death effects block non-critical effects
- Effect timers manage cleanup and restoration

**Special Behaviors:**
- Health < 20%: Breathing red effect
- Death: Ripple → countdown → respawn flash
- Game end: Clears all effects, resets state

## Troubleshooting

**Lights not responding:**
- Verify `.env` credentials are correct
- Check Hue bridge is on same network
- Ensure entertainment group is activated
- Run `bun run showcase` to test connection

**GSI not working:**
- Verify `gamestate_integration_gsi.cfg` is in correct directory
- Restart Dota 2 after adding config
- Check server is running on port 3003
- Look for "GSI Connected" message in console

**Effects not triggering:**
- Check `config/effects-config.json` has `"enabled": true`
- Verify color names are valid (see COLORS in node-hue-edk)
- Review console for validation errors

