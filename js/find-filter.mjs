/** A–Z, with 2 before 10. */
export function compareNames(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Farms and paddocks on the active animals.
 * Paddocks for one farm are remembered so a filter does not scan the herd again.
 */
export function indexPlaces(animals) {
  const farms = new Map();
  const paddocks = new Set();
  for (let i = 0; i < animals.length; i += 1) {
    const animal = animals[i];
    const farm = String(animal?.farm || "").trim();
    const paddock = String(animal?.paddock || "").trim();
    if (paddock) paddocks.add(paddock);
    if (!farm) continue;
    let set = farms.get(farm);
    if (!set) {
      set = new Set();
      farms.set(farm, set);
    }
    if (paddock) set.add(paddock);
  }
  const paddockByFarm = new Map();
  for (const [farm, set] of farms) paddockByFarm.set(farm, [...set].sort(compareNames));
  const allPaddocks = [...paddocks].sort(compareNames);
  return {
    farms: [...farms.keys()].sort(compareNames),
    paddocks: allPaddocks,
    paddocksFor(farm) {
      if (!farm) return allPaddocks;
      return paddockByFarm.get(farm) || [];
    },
  };
}

export function matchesPlace(animal, farm, paddock) {
  if (farm && String(animal?.farm || "").trim() !== farm) return false;
  if (paddock && String(animal?.paddock || "").trim() !== paddock) return false;
  return true;
}
