"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ApiModuleForm } from "@/components/admin/api-module-form";
import { ApiModuleCard } from "@/components/admin/api-module-card";
import type { ApiModuleSafe } from "@/types/database";

export function ApiModulesClient({ modules }: { modules: ApiModuleSafe[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button className="btn btn-primary mb-3" style={{ height: 40, padding: "0 16px" }} onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? "x" : "plus"} size={15} stroke={2.4} /> {open ? "Close" : "Add API"}
      </button>

      {open && (
        <ApiModuleForm
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}

      <div className="cats-grid">
        {modules.map((m) => (
          <ApiModuleCard key={m.id} module={m} />
        ))}
      </div>
    </>
  );
}
