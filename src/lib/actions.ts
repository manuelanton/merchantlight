"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addOrder, OrderSaveUnavailable } from "./sheets";

export async function submitOrderAction(formData: FormData) {
  try {
    await addOrder({
      customer_char: String(formData.get("customer_char") || "Nameless Traveler"),
      discord_handle: String(formData.get("discord_handle") || ""),
      item_id: String(formData.get("item_id") || ""),
      qty: Number(formData.get("qty") || 1),
      pickup_location: String(formData.get("pickup_location") || "Windhelm"),
      notes: String(formData.get("notes") || ""),
    });
  } catch (e) {
    if (e instanceof OrderSaveUnavailable) redirect("/order?manual=1");
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/order?ok=1");
}
