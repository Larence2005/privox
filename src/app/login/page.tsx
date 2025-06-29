"use client";

import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from "firebase/auth";
import { useRouter } from "next/navigation";
import { MessageSquare, User as UserIcon } from "lucide-react";
import { doc, setDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { auth, firestore } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleGoogleSignIn = async () => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY === 'mock-api-key') {
        toast({
            variant: "destructive",
            title: "Firebase Not Configured",
            description: "Google Sign-In requires a valid Firebase configuration. Please check your .env.local file.",
        });
        return;
    }

    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(firestore, "users", user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      }, { merge: true });
      router.push("/");
    } catch (error) {
      console.error("Error signing in with Google: ", error);
      let description = (error as Error).message;
      if ((error as any).code === 'auth/invalid-api-key') {
          description = "Your Firebase API key is not valid. Please ensure you have the correct NEXT_PUBLIC_FIREBASE_API_KEY in your .env.local file."
      }
      toast({
        variant: "destructive",
        title: "Sign-in Failed",
        description: description,
      });
    }
  };

  const handleAnonymousSignIn = async () => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY === 'mock-api-key') {
        toast({
            variant: "destructive",
            title: "Firebase Not Configured",
            description: "Anonymous Sign-In requires a valid Firebase configuration. Please check your .env.local file.",
        });
        return;
    }
    try {
      const result = await signInAnonymously(auth);
      const user = result.user;
      const userRef = doc(firestore, "users", user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: `Guest-${user.uid.substring(0, 6)}`,
        email: null,
        photoURL: null,
      }, { merge: true });
      router.push("/");
    } catch (error) {
        console.error("Error signing in anonymously: ", error);
        let description = (error as Error).message;
        if ((error as any).code === 'auth/invalid-api-key' || (error as any).code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') {
            description = "Your Firebase API key is not valid. Please ensure you have the correct NEXT_PUBLIC_FIREBASE_API_KEY in your .env.local file."
        }
        toast({
          variant: "destructive",
          title: "Sign-in Failed",
          description: description,
        });
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
          Sign in to start a secure conversation.
        </p>
        <div className="w-full max-w-xs space-y-4">
          <Button
            onClick={handleGoogleSignIn}
            size="lg"
            className="w-full"
          >
            <GoogleIcon className="h-5 w-5 mr-2 fill-white" />
            Sign in with Google
          </Button>
          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-sm text-muted-foreground">OR</span>
          </div>
          <Button
            onClick={handleAnonymousSignIn}
            variant="secondary"
            size="lg"
            className="w-full"
          >
            <UserIcon className="h-5 w-5 mr-2" />
            Sign in as Guest
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-8 px-4">
            By signing in, you agree to our imaginary Terms of Service.
            We promise not to read your encrypted messages, because we can't!
        </p>
      </div>
    </main>
  );
}
