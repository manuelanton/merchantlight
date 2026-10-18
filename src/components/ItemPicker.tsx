"use client";
import { g } from "@/lib/format";

export interface PickerItem {
  id: string;
  name: string;
  price: number;
  category: string;
  parent: string | null;
  hidden?: boolean;
}

/** Item select with variants grouped under their parent. Standalone items list directly. */
export default function ItemPicker({
  items,
  cat,
  value,
  onChange,
  showPrice,
  className = "input col-span-6 md:col-span-5",
}: {
  items: PickerItem[];
  cat: string;
  value: string;
  onChange: (id: string) => void;
  showPrice?: boolean;
  className?: string;
}) {
  const list = cat ? items.filter((i) => i.category === cat) : items;
  const parentName = (id: string) => items.find((i) => i.id === id)?.name || id;
  const byParent = new Map<string, PickerItem[]>();
  const standalone: PickerItem[] = [];
  for (const i of list) {
    if (i.parent) {
      const kids = byParent.get(i.parent) || [];
      kids.push(i);
      byParent.set(i.parent, kids);
    } else {
      standalone.push(i);
    }
  }
  const label = (i: PickerItem) =>
    `${i.name}${i.hidden ? " (not listed)" : ""}${showPrice ? ` — ${g(i.price)}g` : ""}`;
  return (
    <select
      name="item_id" className={className} value={value}
      onChange={(e) => onChange(e.target.value)} required aria-label="Item"
    >
      {standalone.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
      {[...byParent.entries()].map(([parent, kids]) => (
        <optgroup key={parent} label={parentName(parent)}>
          {kids.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
