/**
 * Script to remove old insurance services from Supabase
 * Run with: npx tsx scripts/cleanup-insurance-services.ts
 */

const SUPABASE_URL = "https://tmqwqmtbcsjdtyksiatw.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtcXdxbXRiY3NqZHR5a3NpYXR3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDkyMjk1NSwiZXhwIjoyMTAwNDk4OTU1fQ.0bodoY-ZnPPjvRec6wXawAwEjZb4YzNLc5aBAmEnG8Q";

async function cleanupInsuranceServices() {
  console.log("Removing old insurance services from services table...");

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/services?id=in.(vehicleinsurance,legalinsurance,agriinsurance,hospitalcash,funeralcash)`,
    {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to remove services:", error);
    process.exit(1);
  }

  console.log("✓ Successfully removed old insurance services");
}

cleanupInsuranceServices();
