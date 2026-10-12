# Pending fixes

Ranked by how often each one showed up in the first full live match
(2026-10-11, 46 min, Mirana, 3/15/18). Evidence counts are from that match's
event log. Items are grouped by the phase of the consolidation plan they belong to.

## Open

### Needs a decision or a live match

- [ ] **Verify on a live match** with `GSI_RECORD_DIR` set: the scheduler, the game-clock countdown
      across a pause, buyback, and the idle drop on disconnect have only been exercised by replay
      and synthetic frames. Gzip the recording into `fixtures/` afterwards.
- [ ] **Per-segment effects.** The Living Room entertainment area has one channel bundling all 7 gradient
      segments, so every effect is one colour. Recreate the area with per-segment positions via
      `POST /clip/v2/resource/entertainment_configuration` (see memory cheatsheet) to get 7 channels.
      Changes the bridge configuration; do it deliberately.
- [ ] **Archive `dota2-hue`, `dota2-gsi-minimal`, `dota2-gsi-c` and `../old_shit`**; scrub the two committed
      OBS passwords (`old_shit/dota2-gamestate-logger/.env`, `dota2-gsi-service/.env`) first. Sibling repos,
      not touched from here.

### node-hue-edk (sibling repo)

- [ ] Wrapper prints nothing for most effects.
- [ ] `Hue.initialize()` leaves the EDK thread alive on failure so `process.exit` can hang (seen in diag
      scripts, timeout 124). The dota2-hue-sync smoke test with an unreachable bridge shows the same.

### Nice to have

- [ ] **Arrow-hit vs arrow-cast** distinction from minimap enemy positions (unvalidated idea in
      `../old_shit/dota2-gsi-replay-capture/gamestate/mirana.js:258-284`). Needs `minimap` back in the
      GSI cfg, which costs ~38 MB per match of payload.
- [ ] **Port the declarative transition-rule table and light FSM** from `../dota2-gsi-service`
      only if the detector branches become hard to read. Refactor, not a fix.
- [ ] `showcase-effects.ts` is 987 lines with a hand-maintained effect table; generate it from the
      wrapper's method list instead. (The duplicate module name is resolved: `scripts/showcase-catalog.ts`.)
- [ ] `player:resources:gold_changed` and `mana_changed` are emitted (quietly) but nothing consumes them.
- [ ] Spree thresholds come from `player.kill_streak`; the fixture shows streaks above the player's kill
      count, so check what Dota counts in that field on the next live match.

## Done

### 2026-10-12

- [x] Fixture `fixtures/match_8200614096.jsonl.gz` (1,924 unique frames, 18 heartbeats, 3 deaths) imported
      and deduped by `scripts/import-fixtures.py`; JSONL recorder behind `GSI_RECORD_DIR`; replay harness
      (`src/testing/replay.ts`) running the real ingest path; 28 tests (`bun test`).
- [x] Cold start no longer re-fires `game:started` or restarts the death sequence after a pause: frames
      without `previously` are diffed against the last frame; only the first frame or a match-id change is
      a cold start. Raw frame logged on connect and cold start.
- [x] Buyback detected from `hero.buyback_cooldown` rising; the following respawn carries `buyback: true`;
      the manager no longer plays the respawn effect twice.
- [x] Death and respawn follow `hero.alive`.
- [x] Match end also from `map.win_team`; once per match. GSI disconnect while in game drops the lights
      to idle; reconnect restores the health bar or the running death countdown.
- [x] Recipe combines and slot moves are not drops (items diffed by name per frame); a new match no longer
      reports the inventory as sold.
- [x] Full `DOTA_GameState` enum typed; `game:reconnected` on `DISCONNECT -> *`.
- [x] `events[]` node consumed (`map:*`, deduped); hero status flags as `player:status:*`.
- [x] Effect config rejects unknown event keys and priorities at load time; `GameEventType` derived from
      `GAME_EVENTS`.
- [x] Priority scheduler with preemption, queueing, stale-drop and finite durations; ambient layer
      (idle / health bar / breathing) separate from the queue.
- [x] Death countdown follows `hero.respawn_seconds` (`player:combat:respawn_tick`), re-synced on drift.
- [x] GSI cfg trimmed to the seven nodes read; heartbeat 5 s. `gsi:data` payload spread removed.
- [x] `mirana_celestial_quiver`, multikill (18 s window), killing spree, first blood, buyback effects.
- [x] README rewritten to match the code (colon keys, priorities, recorder, tests). Dead constants
      `game:reset`, `game:score_changed`, `game:day_night_changed` removed.
- [x] SIGTERM handled, server stopped on shutdown, optional `GSI_AUTH_TOKEN`, non-loopback senders refused
      unless `GSI_ALLOW_REMOTE=1`.

### 2026-10-11

- [x] node-hue-edk v1.1.0: connect tolerates multiple entertainment areas, `selectGroup` reports the real
      result, `getGroups()`, numeric group id -> Clip v2 UUID resolution. Rebuilt Windows prebuild.
- [x] Critical-health breathing loop stopped on recovery and on leaving the game.
- [x] Hue initialization retries (6 x 3 s) when the bridge still holds a previous instance's stream.
- [x] GSI listener dual-stack (IPv6 + IPv4) so `localhost` resolves either way.
- [x] One-line `[event]` and `[effect]` logging, 10 Hz events muted.
