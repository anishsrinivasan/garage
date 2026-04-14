"use client";

import { useState } from "react";

export function MobileFilterToggle({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 lg:hidden"
      >
        {open ? "Hide Filters" : "Show Filters"}
      </button>
      <div className={`${open ? "block" : "hidden"} lg:block`}>{children}</div>
    </>
  );
}
