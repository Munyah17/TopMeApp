"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type VitalPayHealthStatus = {
  status: "ok" | "error";
  healthy: boolean;
  message?: string;
  responseTime: number;
  timestamp: string;
  billerCount?: number;
};

export function VitalPayHealthCard() {
  const [health, setHealth] = useState<VitalPayHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health/vitalpay");
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({
        status: "error",
        healthy: false,
        message: "Failed to fetch health status",
        responseTime: 0,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const color = health?.healthy ? "var(--success)" : "var(--error)";
  const statusText = loading ? "Checking..." : health?.healthy ? "Healthy" : "Down";

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ padding: "14px 16px" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <div className="ibadge round" style={{ width: 36, height: 36, background: `${color}1a`, color }}>
            <Icon name="plug" size={17} stroke={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>VitalPay API</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              {health?.billerCount !== undefined ? `${health.billerCount} billers available` : "Real-time health check"}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color }}>{statusText}</span>
          <button
            onClick={checkHealth}
            disabled={loading}
            style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", padding: 4 }}
          >
            <Icon name="refresh" size={14} stroke={2} />
          </button>
        </div>
        {health && !loading && (
          <div className="muted mt-2" style={{ fontSize: 11.5 }}>
            <div>Response time: {health.responseTime}ms</div>
            {!health.healthy && health.message && (
              <div style={{ color: "var(--error)" }}>Error: {health.message}</div>
            )}
            <div>Last checked: {new Date(health.timestamp).toLocaleTimeString()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
