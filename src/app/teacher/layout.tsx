"use client";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { useEffect } from "react";
import Forbidden from "@/components/Forbidden";
import { Skeleton } from "@/components/ui/skeleton";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me, isLoading } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (!isLoading && (!me || me.role !== "teacher")) {
    }
  }, [me, isLoading, router]);

  if (isLoading) return <div className="p-8"><Skeleton className="h-4 w-48" /></div>;
  if (!me || me.role !== "teacher") return <Forbidden />;

  return <>{children}</>;
}