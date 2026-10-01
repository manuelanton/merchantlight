import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { ledger, storageUnits } from "@/db/schema";

export interface StorageUnit {
  id: string;
  label: string;
  ratePerWeek: number;
  occupant: string;
  occupiedSince: Date | string | null;
  paidThrough: Date | string | null;
  active: boolean;
}

export async function getStorage(): Promise<{
  units: StorageUnit[];
  filled: number;
  free: number;
  overdue: StorageUnit[];
  earned: number;
}> {
  const db = await getDb();
  const [unitRows, ledgerRows] = await Promise.all([
    db.select().from(storageUnits).orderBy(asc(storageUnits.label)),
    db.select().from(ledger),
  ]);
  const units = unitRows
    .filter((u) => u.active)
    .map((u) => ({
      id: u.id,
      label: u.label,
      ratePerWeek: u.ratePerWeek,
      occupant: u.occupant,
      occupiedSince: u.occupiedSince,
      paidThrough: u.paidThrough,
      active: u.active,
    }))
    // Natural sort so Chest 2 comes before Chest 10.
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const now = Date.now();
  const filledUnits = units.filter((u) => u.occupant);
  const overdue = filledUnits.filter((u) => !u.paidThrough || new Date(u.paidThrough).getTime() < now);
  const earned = ledgerRows
    .filter((e) => e.type === "sale_income" && e.category.toLowerCase() === "storage")
    .reduce((a, e) => a + e.amountGold, 0);
  return { units, filled: filledUnits.length, free: units.length - filledUnits.length, overdue, earned };
}
