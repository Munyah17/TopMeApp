import { NextResponse } from "next/server";
import { staffApiDenied } from "@/lib/auth/api-staff";
import { vitalpayRequest } from "@/lib/fulfillment/vitalpay";

export async function GET() {
  const denied = await staffApiDenied(["reports.view", "apis.manage"]);
  if (denied) return denied;

  const startTime = Date.now();
  if (!process.env.VITALPAY_BASE_URL) {
    return NextResponse.json({
      status: "error",
      message: "VITALPAY_BASE_URL not configured",
      healthy: false,
      responseTime: 0,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const data = await vitalpayRequest<{ billers?: unknown[] }>("/bills/billers?country=ZW");
    return NextResponse.json({
      status: "ok",
      healthy: true,
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      billerCount: data.billers?.length ?? 0,
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
      healthy: false,
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  }
}
