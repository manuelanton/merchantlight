/** Default minimum stock: warn at 2 unless set otherwise. */
export const DEFAULT_LOW_AT = 2;

/** Unit value for cap tiering: buy price, else cost, else sale price. */
export function unitValue(args: { buy_price?: number | null; cost_value?: number | null; sale_price?: number | null }): number {
  if (args.buy_price && args.buy_price > 0) return args.buy_price;
  if (args.cost_value && args.cost_value > 0) return args.cost_value;
  return args.sale_price || 0;
}

/** Default surplus cap: cheap bulk goods get room, dear goods don't.
 *  Under 1g => 500, under 2g => 250, otherwise 10. */
export function defaultMaxStock(value: number): number {
  if (value > 0 && value < 1) return 500;
  if (value > 0 && value < 2) return 250;
  return 10;
}

export function effectiveMaxStock(maxStock: number | null | undefined, value: number): number {
  return maxStock ?? defaultMaxStock(value);
}

export function effectiveThreshold(lowThreshold: number | null | undefined): number {
  return lowThreshold ?? DEFAULT_LOW_AT;
}
