export interface CostItem {
  id: string;
  cost_value: number;
}

export interface CostIngredient {
  itemId: string;
  materialItemId: string;
  qty: number;
}

/**
 * Effective cost of an item: recipe cost (live material costs, recursive)
 * when it has a recipe, otherwise its manual cost. Materials with unknown
 * (zero) cost contribute zero.
 */
export function effectiveCost(
  itemId: string,
  items: CostItem[],
  ingredients: CostIngredient[],
  seen: Set<string> = new Set()
): number {
  if (seen.has(itemId)) return 0;
  const lines = ingredients.filter((r) => r.itemId === itemId);
  if (!lines.length) return items.find((i) => i.id === itemId)?.cost_value || 0;
  const next = new Set(seen);
  next.add(itemId);
  const total = lines.reduce((a, r) => {
    const matLines = ingredients.filter((x) => x.itemId === r.materialItemId);
    const unit = matLines.length
      ? effectiveCost(r.materialItemId, items, ingredients, next)
      : items.find((i) => i.id === r.materialItemId)?.cost_value || 0;
    return a + r.qty * unit;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** True when the effective cost comes from a recipe rather than the manual field. */
export function hasRecipe(itemId: string, ingredients: CostIngredient[]): boolean {
  return ingredients.some((r) => r.itemId === itemId);
}
