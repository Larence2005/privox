
"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import SettingsForm from "@/components/settings-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    if (loading || !user) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-8">
                <Skeleton className="h-12 w-1/2 mb-6" />
                <Skeleton className="h-48 w-full max-w-2xl" />
                <Skeleton className="h-48 w-full max-w-2xl mt-4" />
            </div>
        );
    }
    
    if (user.isAnonymous) {
        router.push('/');
        return null;
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-10 flex items-center gap-4 border-b bg-background p-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                    <span className="sr-only">Back</span>
                </Button>
                <h1 className="text-xl font-semibold">Settings</h1>
            </header>
            <main className="p-4 md:p-8">
                <SettingsForm user={user} />
            </main>
        </div>
    );
}
