export interface CostItem {
  id: string;
  cost_value: number;
  sale_price: number;
}

export interface CostIngredient {
  itemId: string;
  materialItemId: string;
  qty: number;
}

/**
 * Effective cost of an item:
 *   1. recipe cost (live material costs, recursive) when it has a recipe,
 *   2. manual cost when filled,
 *   3. otherwise the sale price (assume zero profit — never invent margin).
 */
export function effectiveCost(
  itemId: string,
  items: CostItem[],
  ingredients: CostIngredient[],
  seen: Set<string> = new Set()
): number {
  if (seen.has(itemId)) return 0;
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

/** True when the effective cost comes from a recipe rather than the manual field. */
export function hasRecipe(itemId: string, ingredients: CostIngredient[]): boolean {
  return ingredients.some((r) => r.itemId === itemId);
}
