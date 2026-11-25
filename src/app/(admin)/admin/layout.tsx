import React from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionData = await requireAdminSession();

  return (
    <div className="bg-obsidian-glow flex min-h-screen flex-col text-zinc-100">
      <AdminNav userEmail={sessionData.user.email} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
