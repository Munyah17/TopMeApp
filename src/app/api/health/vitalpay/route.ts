import { NextResponse } from "next/server";

export async function GET() {
  const startTime = Date.now();
  const vitalpayBaseUrl = process.env.VITALPAY_BASE_URL;

  if (!vitalpayBaseUrl) {
    return NextResponse.json({
      status: "error",
      message: "VITALPAY_BASE_URL not configured",
      healthy: false,
    });
  }

  try {
    // Ping VitalPay's billers endpoint (lightweight, no auth needed)
    const response = await fetch(`${vitalpayBaseUrl}/bills/billers`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return NextResponse.json({
        status: "error",
        message: `VitalPay returned ${response.status}`,
        healthy: false,
        responseTime,
        timestamp: new Date().toISOString(),
      });
    }

    const data = await response.json();

    return NextResponse.json({
      status: "ok",
      healthy: true,
      responseTime,
      timestamp: new Date().toISOString(),
      billerCount: Array.isArray(data) ? data.length : 0,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
      healthy: false,
      responseTime,
      timestamp: new Date().toISOString(),
    });
  }
}
