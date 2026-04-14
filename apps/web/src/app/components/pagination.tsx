"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function Pagination({
  page,
  totalPages,
  total,
}: {
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (totalPages <= 1) return null;

  function goTo(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }

  return (
    <div
      className={`mt-6 flex items-center justify-between ${isPending ? "opacity-60" : ""}`}
    >
      <p className="text-sm text-gray-500">
        {total} listing{total !== 1 ? "s" : ""} found
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        >
          Prev
        </button>
        <span className="px-2 py-1 text-sm text-gray-600">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
