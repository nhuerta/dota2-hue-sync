# Pending fixes

Ranked by how often each one showed up in the first full live match
(2026-10-11, 46 min, Mirana, 3/15/18). Evidence counts are from that match's
event log. Items are grouped by the phase of the consolidation plan they belong to.

## Phase 1 - Fixtures and tests (do first, everything below is verified against them)

- [ ] **Import recorded GSI fixtures.** `../old_shit/dota2-gsi-replay-capture/logs/match_8200614096_*.json`
      holds one complete Mirana match (320 files, ~330 MB, 7,696 entries that dedupe to 1,924 unique
      payloads because a processor bug wrote each one up to 4x). It contains 64 heartbeat frames with no
      `previously` block, 3 deaths, all game-state transitions, and Leap charge diffs. Copy only the JSON,
      dedupe by hash, store under `fixtures/`. No buyback in that match; synthesise one.
- [ ] **Add a JSONL payload recorder** behind an env flag so future matches become fixtures. Record every
      frame including heartbeats and menu frames; the old recorder dropped frames without a match id and
      wrote invalid JSON on rotation.
- [ ] **Replay harness for the detector:** feed a fixture through `GameEventDetector` and assert the
      emitted event sequence. First assertion: the 64 heartbeat frames emit zero `game:started`.
- [ ] **Log raw frames that trigger `gsi:connected` and cold starts** so the next anomaly has a payload.

## Phase 2 - Detector correctness

- [ ] **Cold start re-fires `game:started` and restarts the death sequence after a pause.** Dota stops
      posting during a pause, the watchdog disconnects, the next frame lacks `previously`, and the
      detector treats it as a fresh start. Seen live at 32:00: a game-started flash while dead, then the
      death countdown restarted from 53 s. Fix: a seen-first-frame flag in the detector, and the
      reconnect handler must not re-run `onDeath` when the hero is already known to be dead.
      (`src/game/detector.ts:66-81`, `src/game/dota-effect-manager.ts` connect handler)
- [ ] **Buyback is not detected.** At 29:41 a death with a 35 s timer was followed by a respawn one second
      later and came through as a plain respawn. Use a positive delta of `player.gold_spent_on_buybacks`
      (also `hero.buyback_cooldown`) instead of inferring from `respawn_seconds`. Remove the current
      inference so buyback and respawn cannot both fire. (`src/game/detector.ts:294,315-322`)
- [ ] **Death detection from `hero.alive` transitions**, not `health` reaching zero, which misfires on
      hero swaps and state resets. (`src/game/detector.ts:268`)
- [ ] **Match end never arrived.** Dota stopped posting before a `POST_GAME` frame, so the lights held
      their last state until the server was killed. Treat a watchdog disconnect as "leave game" after a
      few seconds and drop to idle; also detect match end from `map.win_team` changing away from none.
      (`src/server/routes.ts` watchdog, `src/game/detector.ts:439`)
- [ ] **Recipe combines look like drops.** 25 `items:dropped` vs 30 `items:purchased`, mostly paired on the
      same tick. Suppress a drop when a purchase lands in the same frame, or diff by item name rather
      than slot. (`src/game/detector.ts` detectItemChanges)
- [ ] **Type the full `DOTA_GameState` enum** (12 values incl. `DISCONNECT`, `WAIT_FOR_PLAYERS_TO_LOAD`,
      `STRATEGY_TIME`) and detect reconnect as `DISCONNECT -> anything`. (`src/game/dota2-types.ts`)
- [ ] **Type and consume the `events[]` node**: `courier_killed`, `roshan_killed`, `aegis_picked_up`,
      `aegis_denied`, `bounty_rune_pickup`, `tip`, each with killer/team fields. Currently an untyped
      array that is never read. Reference: antonpup/Dota2GSI `Nodes/EventsProvider/Event.cs`.
- [ ] **Expose hero status flags** (`silenced`, `stunned`, `disarmed`, `magicimmune`, `hexed`, `break`,
      `smoked`) as events; they are in every tick and untapped as triggers.
- [ ] **Validate config event keys at load time** instead of casting; a typo registers a handler that never
      fires. (`src/game/dota-effect-manager.ts:143`, `src/game/effect-config-loader.ts`)

## Phase 3 - Effect scheduling

- [ ] **Priority queue with preemption.** 8 times in one match a level-up landed on the same tick as a kill
      or assist and replaced its effect instantly; Leap/Starfall combos cut each other off constantly.
      Port the queue shape from `../dota2-gsi-minimal/src/lights/effects-manager.ts` (priority enum,
      sorted queue, interrupt on higher priority) and the `AbortController` cancellation from
      `../dota2-gsi-service/src/services/hue/hueService.js:158-206`. Every queued effect must have a
      finite duration. (`src/game/dota-effect-manager.ts:162-185`)
- [ ] **Ambient layer separate from the queue.** Critical-health breathing and the health bar are
      open-ended states; they belong in a background layer the queue paints over and that is replaced,
      never queued. This also removes the starvation bug gsi-minimal had.
- [ ] **Countdown should follow `hero.respawn_seconds`**, not wall-clock. It kept counting through a pause
      while the game timer stopped. (`src/game/dota-effect-manager.ts` onDeath)
- [ ] **Trim the GSI config** to the sections actually read; `minimap`, `buildings`, `draft`, `wearables`,
      `couriers`, `league` inflate every 100 ms payload. (`config/gamestate_integration_gsi.cfg:10-24`)
- [ ] **Drop the dead `gsi:data` spread** of the whole payload into an event with zero subscribers.
      (`src/server/routes.ts:71`)

## Phase 4 - Content

- [ ] **Add `mirana_celestial_quiver`** to the Mirana ability map. Cast 60+ times in one match with no
      effect; it is a core facet ability now. (`src/game/detector.ts:8-13`, `config/effects-config.json`)
- [ ] **Spree and multikill effects** using the payload's own `player.kill_streak`, with the 18 s
      multikill window and spree thresholds from `../old_shit/dota2-gsi-replay-capture/gamestate/killstreak.js:9-25`.
- [ ] **First blood** from `radiant_score`/`dire_score` going 0 -> 1 with team attribution.
- [ ] **Per-segment effects.** The Living Room entertainment area has one channel bundling all 7 gradient
      segments, so every effect is one color. Recreate the area with per-segment positions via
      `POST /clip/v2/resource/entertainment_configuration` (see memory cheatsheet) to get 7 channels.
- [ ] **Arrow-hit vs arrow-cast** distinction from minimap enemy positions (unvalidated idea in
      `../old_shit/dota2-gsi-replay-capture/gamestate/mirana.js:258-284`).
- [ ] **Port the declarative transition-rule table and light FSM** from `../dota2-gsi-service`
      (`src/core/transitionDetector.js`, `src/services/lighting/lightStateMachine.js`) only if the detector
      branches become hard to read after Phase 2. Refactor, not a fix.

## Housekeeping

- [ ] `showcase-effects.ts` is 987 lines with a hand-maintained table duplicating the registry; two
      unrelated modules are both named `effect-registry.ts`.
- [ ] README documents dot-separated event keys; code uses colons. "Wildcard support" and item-purchase
      effects described in the README do not exist.
- [ ] Dead event constants: `GAME.RESET`, `SCORE_CHANGED`, `DAY_NIGHT_CHANGED` never emitted;
      `GOLD_CHANGED`/`MANA_CHANGED` have no consumers.
- [ ] Only `SIGINT` is handled; `Bun.serve` is never stopped on shutdown. Auth token in the GSI cfg is
      never checked and the server binds all interfaces.
- [ ] Archive `dota2-hue`, `dota2-gsi-minimal`, `dota2-gsi-c` and `../old_shit`; scrub the two committed OBS
      passwords (`old_shit/dota2-gamestate-logger/.env`, `dota2-gsi-service/.env`) first.
- [ ] `node-hue-edk`: wrapper still prints nothing for most effects; `Hue.initialize()` leaves the EDK
      thread alive on failure so `process.exit` can hang (seen in diag scripts, timeout 124).

## Done on 2026-10-11

- [x] node-hue-edk v1.1.0: connect tolerates multiple entertainment areas, `selectGroup` reports the real
      result, `getGroups()`, numeric group id -> Clip v2 UUID resolution. Rebuilt Windows prebuild.
- [x] Critical-health breathing loop stopped on recovery and on leaving the game.
- [x] Hue initialization retries (6 x 3 s) when the bridge still holds a previous instance's stream.
- [x] GSI listener dual-stack (IPv6 + IPv4) so `localhost` resolves either way.
- [x] One-line `[event]` and `[effect]` logging, 10 Hz events muted.
