// Shared fallback for route-level loading.tsx files — Next.js wraps each
// page in a Suspense boundary using this while the server component's data
// fetch is in flight, so navigation shows this immediately instead of a
// frozen previous screen until the whole page (data included) is ready.
export function PageLoading() {
  return (
    <div
      className="px content-narrow"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60dvh" }}
    >
      <div className="spinner-ring" />
    </div>
  );
}
