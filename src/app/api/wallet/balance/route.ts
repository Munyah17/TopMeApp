import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/data/queries";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ balance: 0 });
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  if (!profile) {
    return NextResponse.json({ balance: 0 });
  }

  const wallet = await getMyWallet(profile.id);
  return NextResponse.json({ balance: wallet?.balance ?? 0 });
}
