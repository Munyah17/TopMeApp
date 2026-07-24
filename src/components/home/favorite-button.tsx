"use client";

import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { toggleFavorite } from "@/lib/actions/favorites";

export function FavoriteButton({ serviceId, isFavorite }: { serviceId: string; isFavorite: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tap"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(() => toggleFavorite(serviceId, isFavorite));
      }}
      style={{
        color: isFavorite ? "#F59E0B" : "var(--text-faint)",
        padding: 4,
        background: "none",
        border: "none",
        cursor: "pointer",
      }}
      aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
    >
      <Icon name={isFavorite ? "starFill" : "star"} size={18} stroke={1.8} />
    </button>
  );
}
