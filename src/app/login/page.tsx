"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
            <title>Google</title>
            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.62 1.96-4.96 1.96-3.97 0-7.2-3.24-7.2-7.2s3.23-7.2 7.2-7.2c2.25 0 3.83.88 4.79 1.8l2.6-2.58C18.07 1.74 15.5 0 12.48 0 5.88 0 .02 5.8 .02 12.9s5.86 12.9 12.46 12.9c3.16 0 5.66-1.08 7.48-2.92 1.9-1.9 2.53-4.48 2.53-7.38 0-.8-.1-1.36-.24-1.92z"/>
        </svg>
    );
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      router.push("/");
    } catch (error) {
      console.error("Error signing in with Google: ", error);
    }
  };

  if (loading || user) {
      return (
          <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-8">
            <Skeleton className="h-20 w-20 rounded-full mb-6" />
            <Skeleton className="h-10 w-64 mb-2" />
            <Skeleton className="h-6 w-80 mb-8" />
            <Skeleton className="h-12 w-56" />
          </div>
      );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="flex flex-col items-center justify-center text-center max-w-md w-full">
        <MessageSquare className="h-20 w-20 text-primary mb-6" />
        <h1 className="text-4xl font-bold font-headline text-foreground mb-2">
          Welcome to CipherChat
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Secure, real-time messaging with client-side encryption.
        </p>
        <Button
          onClick={handleSignIn}
          size="lg"
          className="w-full max-w-xs"
        >
          <GoogleIcon className="h-5 w-5 mr-2 fill-white" />
          Sign in with Google
        </Button>
        <p className="text-xs text-muted-foreground mt-8 px-4">
            By signing in, you agree to our imaginary Terms of Service.
            We promise not to read your encrypted messages, because we can't!
        </p>
      </div>
    </main>
  );
}
