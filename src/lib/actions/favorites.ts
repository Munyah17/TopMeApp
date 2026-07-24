"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleFavorite(serviceId: string, currentlyFavorite: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  if (currentlyFavorite) {
    await supabase.from("favorites").delete().eq("user_id", user.id).eq("service_id", serviceId);
  } else {
    await supabase.from("favorites").insert({ user_id: user.id, service_id: serviceId });
  }
  revalidatePath("/home");
  revalidatePath("/services");
}
