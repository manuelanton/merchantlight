export interface CostItem {
  id: string;
  cost_value: number;
  sale_price: number;
  parent_id?: string | null;
  inherit_parent?: boolean | null;
}

export interface CostIngredient {
  itemId: string;
  materialItemId: string;
  qty: number;
}

function resolveParent(itemId: string, items: CostItem[]): CostItem | undefined {
  const item = items.find((i) => i.id === itemId);
  if (item?.parent_id && item?.inherit_parent !== false) {
    return items.find((i) => i.id === item.parent_id);
  }
  return undefined;
}

/**
 * Effective cost of an item:
 *   1. parent cost (live) when this is a variant with inherit on,
 *   2. recipe cost (live material costs, recursive) when it has a recipe,
 *   3. manual cost when filled,
 *   4. otherwise the sale price (assume zero profit — never invent margin).
 */
export function effectiveCost(
  itemId: string,
  items: CostItem[],
  ingredients: CostIngredient[],
  seen: Set<string> = new Set()
): number {
  if (seen.has(itemId)) return 0;
  const parent = resolveParent(itemId, items);
  if (parent) {
    const next = new Set(seen);
    next.add(itemId);
    return effectiveCost(parent.id, items, ingredients, next);
  }
  const item = items.find((i) => i.id === itemId);
  const manual = item && item.cost_value > 0 ? item.cost_value : item?.sale_price || 0;
  const lines = ingredients.filter((r) => r.itemId === itemId);
  if (!lines.length) return manual;
  const next = new Set(seen);
  next.add(itemId);
  const total = lines.reduce((a, r) => {
    const matLines = ingredients.filter((x) => x.itemId === r.materialItemId);
    const mat = items.find((i) => i.id === r.materialItemId);
    const unit = matLines.length
      ? effectiveCost(r.materialItemId, items, ingredients, next)
      : mat && mat.cost_value > 0 ? mat.cost_value : mat?.sale_price || 0;
    return a + r.qty * unit;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** True when the effective cost comes from a recipe rather than the manual field (follows variant inheritance). */
export function hasRecipe(itemId: string, ingredients: CostIngredient[], items?: CostItem[]): boolean {
  if (items) {
    const parent = resolveParent(itemId, items);
    if (parent) return hasRecipe(parent.id, ingredients, items);
  }
  return ingredients.some((r) => r.itemId === itemId);
}

/** Manual cost following variant inheritance (no recipe math, no price fallback). */
export function inheritedManualCost(itemId: string, items: CostItem[]): number {
  const parent = resolveParent(itemId, items);
  if (parent) return inheritedManualCost(parent.id, items);
  return items.find((i) => i.id === itemId)?.cost_value || 0;
}
