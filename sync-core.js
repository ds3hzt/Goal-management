/* Shared, dependency-free data conversions. Cloud dates use a map so two devices
   can update different repetitions without overwriting the entire date array. */
(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  function toRemote(goal) {
    return {name: goal.name, count: goal.count, start: goal.start, end: goal.end,
      targetQuantity: goal.targetQuantity || null, ...trackingSettings(goal), quantities: Object.fromEntries(goal.dates.map((_, i) => [String(i), goal.quantities?.[i] || 0])),
      dates: Object.fromEntries(goal.dates.map((date, i) => [String(i), date || null])), deleted: false};
  }
  function trackingSettings(goal) {
    const settings = {};
    for (const key of ['trackDates', 'trackQuantity']) {
      if (typeof goal[key] === 'boolean') settings[key] = goal[key];
    }
    return settings;
  }
  function toGoal(id, data) {
    if (!data || data.deleted || typeof data.name !== 'string' ||
        !Number.isInteger(data.count) || data.count < 1 || data.count > 10000 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.start) || !/^\d{4}-\d{2}-\d{2}$/.test(data.end)) return null;
    const length = Object.entries(data.dates || {}).reduce((length, [key, value]) => {
      const index = Number(key);
      return value && Number.isInteger(index) && index >= 0 && index < 10000
        ? Math.max(length, index + 1) : length;
    }, data.count);
    return {id, ...trackingSettings(data), name: data.name, count: data.count, start: data.start, end: data.end,
      targetQuantity: Number.isSafeInteger(data.targetQuantity) && data.targetQuantity > 0 && data.targetQuantity <= 1000000000 ? data.targetQuantity : null,
      quantities: Array.from({length},(_,i)=>Number.isSafeInteger(data.quantities?.[i]) && data.quantities[i]>=0 && data.quantities[i]<=1000000000 ? data.quantities[i] : 0),
      dates: Array.from({length}, (_, i) => {
        const value = data.dates?.[i];
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
      })};
  }
  function diff(previous, next) {
    const before = new Map(previous.map(goal => [goal.id, goal]));
    const after = new Map(next.map(goal => [goal.id, goal]));
    const operations = [];
    for (const goal of next) {
      const old = before.get(goal.id);
      if (!old) { operations.push({id: goal.id, patch: toRemote(goal)}); continue; }
      const patch = {};
      for (const key of ['name', 'count', 'start', 'end', 'targetQuantity', 'trackDates', 'trackQuantity']) if ((old[key] ?? null) !== (goal[key] ?? null)) patch[key] = goal[key] ?? null;
      const dates = {}, quantities = {};
      // Explicit nulls clear truncated records and prevent them reappearing if count grows.
      for (let i = 0; i < Math.max(old.dates.length, goal.dates.length); i++) {
        const a = old.dates[i] || null, b = goal.dates[i] || null;
        if (a !== b) dates[i] = b;
        const qa=old.quantities?.[i] || 0, qb=goal.quantities?.[i] || 0;
        if(qa!==qb) quantities[i]=qb;
      }
      if (Object.keys(quantities).length) patch.quantities = quantities;
      if (Object.keys(dates).length) patch.dates = dates;
      if (Object.keys(patch).length) operations.push({id: goal.id, patch});
    }
    for (const goal of previous) if (!after.has(goal.id)) operations.push({id: goal.id, patch: {deleted: true}});
    return operations;
  }
  function overlay(remote, pending) {
    const result = new Map([...remote].map(([id, data]) => [id, copy(data)]));
    for (const {id, patch} of pending) {
      const old = result.get(id) || {};
      result.set(id, {...old, ...copy(patch), dates: {...old.dates, ...patch.dates}, quantities: {...old.quantities, ...patch.quantities}});
    }
    return [...result].map(([id, data]) => toGoal(id, data)).filter(Boolean);
  }
  const api = {copy, toRemote, toGoal, diff, overlay};
  if (typeof module !== 'undefined') module.exports = api;
  else root.GoalSyncCore = api;
})(globalThis);

