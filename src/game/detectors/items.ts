import { GAME_EVENTS } from '../events';
import type { Detector } from './types';

/** Gold gained in one tick that passive income cannot explain; above it a vanished item was sold. */
const SOLD_GOLD_MIN = 10;

/**
 * Item usage comes from cooldown and charge drops per slot. Purchases and drops are diffed by
 * item name across every changed slot, so moving an item between slots cancels out and a recipe
 * combine (components vanish, result appears) is one purchase and no drops.
 */
export const itemDetector: Detector = {
  name: 'items',
  detect({ current, previous }, emit) {
    if (!current.items || !previous.items) {
      return;
    }
    const removed = new Map<string, string>();
    const added = new Map<string, string>();
    for (const slot in previous.items) {
      const before = previous.items[slot];
      const after = current.items[slot];
      if (!before || !after) {
        continue;
      }
      const usage: Record<string, unknown> = {};
      if (before.cooldown === 0 && after.cooldown !== undefined && after.cooldown > 0) {
        usage.cooldown = after.cooldown;
      }
      if (before.charges !== undefined && after.charges !== undefined && before.charges > after.charges) {
        usage.charges_remaining = after.charges;
        usage.charges_used = before.charges - after.charges;
      }
      if (Object.keys(usage).length > 0) {
        emit(GAME_EVENTS.PLAYER.ITEMS.USED, { item_name: after.name, slot, ...usage });
      }
      if (before.name !== undefined && after.name !== undefined && before.name !== after.name) {
        if (before.name !== 'empty') {
          removed.set(before.name, slot);
        }
        if (after.name !== 'empty') {
          added.set(after.name, slot);
        }
      }
    }
    for (const name of [...added.keys()]) {
      if (removed.has(name)) {
        removed.delete(name);
        added.delete(name);
      }
    }
    const goldDelta = previous.player?.gold !== undefined && current.player?.gold !== undefined
      ? current.player.gold - previous.player.gold
      : 0;
    for (const [name, slot] of added) {
      emit(GAME_EVENTS.PLAYER.ITEMS.PURCHASED, {
        item_name: name,
        slot,
        ...(goldDelta < 0 ? { gold_spent: -goldDelta } : {}),
        ...(removed.size > 0 && added.size === 1 ? { combined_from: [...removed.keys()] } : {})
      });
    }
    if (added.size > 0) {
      return;
    }
    for (const [name, slot] of removed) {
      emit(GAME_EVENTS.PLAYER.ITEMS.DROPPED, {
        item_name: name,
        slot,
        ...(goldDelta > SOLD_GOLD_MIN ? { sold: true, gold_gained: goldDelta } : {})
      });
    }
  }
};
