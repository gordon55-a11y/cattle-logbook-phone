export function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

export function stableEqual(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

export function createIdFactory(random = Math.random, clock = Date.now) {
  let n = 0;
  return function nextId() {
    n += 1;
    const rand = random().toString(36).slice(2, 9);
    return `${clock().toString(36)}-${n.toString(36)}-${rand || "id"}`;
  };
}
