
"use client";

import { useState, useEffect } from "react";
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInAnonymously,
    updateProfile
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { MessageSquare, User as UserIcon, Mail, Lock, Loader2, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ref, set, get, update } from "firebase/database";

import { Button } from "@/components/ui/button";
import { auth, database } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { 
    generateMasterKeyPair, 
    exportPublicKeyToBase64,
    storePrivateKey 
} from "@/lib/crypto";

const signUpSchema = z.object({
    displayName: z.string().min(3, { message: "Display name must be at least 3 characters." }),
    email: z.string().email({ message: "Invalid email address." }),
    password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

const signInSchema = z.object({
    email: z.string().email({ message: "Invalid email address." }),
    password: z.string().min(1, { message: "Password is required." }),
});

const isUsingMockKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY === 'mock-api-key';
const isMissingDbUrl = !process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

export default function LoginPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const signInForm = useForm<z.infer<typeof signInSchema>>({
        resolver: zodResolver(signInSchema),
        defaultValues: { email: "", password: "" },
    });

    const signUpForm = useForm<z.infer<typeof signUpSchema>>({
        resolver: zodResolver(signUpSchema),
        defaultValues: { displayName: "", email: "", password: "" },
    });


    useEffect(() => {
        if (!authLoading && user) {
            router.push("/");
        }
    }, [user, authLoading, router]);

    const handleFirebaseError = (error: any) => {
        let description = "An unexpected error occurred. Please try again.";

        if (typeof error.code === 'string') {
            switch (error.code) {
                case 'auth/invalid-credential':
                    description = "Invalid email or password. Please check your credentials and try again.";
                    break;
                case 'auth/user-not-found':
                    description = "No account found with this email address.";
                    break;
                case 'auth/wrong-password':
                    description = "Incorrect password. Please try again.";
                    break;
                 case 'auth/email-already-in-use':
                    description = "An account already exists with this email address.";
                    break;
                case 'auth/api-key-not-valid':
                case 'auth/invalid-api-key':
                    description = "Your Firebase API key is not valid. Please ensure you have the correct key in your .env.local file and have restarted the server.";
                    break;
                default:
                    description = error.message;
            }
        }
       
        toast({
            variant: "destructive",
            title: "Authentication Failed",
            description: description,
        });
    }

    const ensureCryptoKeys = async (user: any) => {
        const publicKeyRef = ref(database, `users/${user.uid}/publicKey`);
        const snapshot = await get(publicKeyRef);

        if (!snapshot.exists()) {
            toast({
                title: "Setting up your secure account...",
                description: "Generating your unique encryption keys.",
            });
            const keyPair = await generateMasterKeyPair();
            const publicKeyB64 = await exportPublicKeyToBase64(keyPair.publicKey);
            await update(ref(database, `users/${user.uid}`), { publicKey: publicKeyB64 });
            await storePrivateKey(user.uid, keyPair.privateKey);
        }
    };

    const handleSignIn = async (values: z.infer<typeof signInSchema>) => {
        setIsLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
            await ensureCryptoKeys(userCredential.user);
            router.push("/");
        } catch (error) {
            console.error("Error signing in: ", error);
            handleFirebaseError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignUp = async (values: z.infer<typeof signUpSchema>) => {
        setIsLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
            const user = userCredential.user;
            const photoURL = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${user.uid}`;
            
            await updateProfile(user, { 
                displayName: values.displayName,
                photoURL: photoURL,
            });
            
            const keyPair = await generateMasterKeyPair();
            const publicKeyB64 = await exportPublicKeyToBase64(keyPair.publicKey);
            await storePrivateKey(user.uid, keyPair.privateKey);

            const userRef = ref(database, "users/" + user.uid);
            await set(userRef, {
                uid: user.uid,
                displayName: values.displayName,
                email: user.email,
                photoURL: photoURL,
                publicKey: publicKeyB64,
            });
            
            router.push("/");
        } catch (error) {
            console.error("Error signing up: ", error);
            handleFirebaseError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnonymousSignIn = async () => {
        setIsLoading(true);
        try {
            const result = await signInAnonymously(auth);
            const user = result.user;
            const displayName = `Guest-${user.uid.substring(0, 6)}`;
            const photoURL = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${user.uid}`;

            await updateProfile(user, { displayName, photoURL });
            
            const keyPair = await generateMasterKeyPair();
            const publicKeyB64 = await exportPublicKeyToBase64(keyPair.publicKey);
            await storePrivateKey(user.uid, keyPair.privateKey);

            const userRef = ref(database, "users/" + user.uid);
            await set(userRef, {
                uid: user.uid,
                displayName: displayName,
                email: null,
                photoURL: photoURL,
                publicKey: publicKeyB64,
            });

            router.push("/");
        } catch (error) {
            console.error("Error signing in anonymously: ", error);
            handleFirebaseError(error);
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading || user) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-8">
                <Skeleton className="h-20 w-20 rounded-full mb-6" />
                <Skeleton className="h-10 w-64 mb-2" />
                <Skeleton className="h-6 w-80 mb-8" />
                <Skeleton className="h-12 w-56" />
            </div>
        );
    }
    
    if (isMissingDbUrl) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-8">
                <Alert variant="destructive" className="max-w-lg">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Configuration Error</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">Your Firebase Realtime Database URL is missing from your configuration.</p>
                    <p>You can find this URL at the top of the **Data** tab in the Realtime Database section of the Firebase Console.</p>
                    <p className="font-semibold mt-2">To fix this:</p>
                    <ol className="list-decimal list-inside space-y-1 mt-1">
                        <li>Create a file named <strong>.env.local</strong> in the root of your project if it doesn't exist.</li>
                        <li>Add your Database URL to it: <br /><code className="bg-muted px-1 rounded">NEXT_PUBLIC_FIREBASE_DATABASE_URL=your_url_here</code></li>
                        <li><strong>Important:</strong> Stop and restart the development server.</li>
                    </ol>
                  </AlertDescription>
                </Alert>
            </div>
        )
    }

    if (isUsingMockKey) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-8">
                <Alert variant="destructive" className="max-w-lg">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Configuration Error</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">Your Firebase API key is not configured. The application is currently using a mock key.</p>
                    <p className="font-semibold">To fix this:</p>
                    <ol className="list-decimal list-inside space-y-1 mt-1">
                        <li>Find your Firebase project credentials in the Firebase Console.</li>
                        <li>Create a file named <strong>.env.local</strong> in the root of your project.</li>
                        <li>Add your credentials to the file (e.g., <code className="bg-muted px-1 rounded">NEXT_PUBLIC_FIREBASE_API_KEY=your_key_here</code>).</li>
                        <li><strong>Important:</strong> Stop and restart the development server.</li>
                    </ol>
                  </AlertDescription>
                </Alert>
            </div>
        )
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 relative">
            <div className="absolute top-4 right-4">
                <ThemeSwitcher />
            </div>
            <div className="flex flex-col items-center justify-center text-center max-w-md w-full">
                <MessageSquare className="h-16 w-16 text-primary mb-4" />
                <h1 className="text-4xl font-bold font-headline text-foreground mb-2">
                    Welcome to Privox
                </h1>
                <p className="text-lg text-muted-foreground mb-8">
                    Secure, real-time messaging.
                </p>

                <Tabs defaultValue="signin" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="signin">Sign In</TabsTrigger>
                        <TabsTrigger value="signup">Sign Up</TabsTrigger>
                    </TabsList>
                    <TabsContent value="signin">
                        <Card>
                            <CardHeader>
                                <CardTitle>Sign In</CardTitle>
                                <CardDescription>Enter your credentials to access your account.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Form {...signInForm}>
                                    <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
                                        <FormField
                                            control={signInForm.control}
                                            name="email"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Email</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            <Input placeholder="name@example.com" {...field} className="pl-9" />
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={signInForm.control}
                                            name="password"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Password</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            <Input type="password" placeholder="••••••••" {...field} className="pl-9" />
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <Button type="submit" className="w-full" disabled={isLoading}>
                                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Sign In
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="signup">
                        <Card>
                            <CardHeader>
                                <CardTitle>Sign Up</CardTitle>
                                <CardDescription>Create a new account to start chatting.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Form {...signUpForm}>
                                    <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                                         <FormField
                                            control={signUpForm.control}
                                            name="displayName"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Display Name</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            <Input placeholder="Your Name" {...field} className="pl-9" />
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={signUpForm.control}
                                            name="email"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Email</FormLabel>
                                                    <FormControl>
                                                         <div className="relative">
                                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            <Input placeholder="name@example.com" {...field} className="pl-9" />
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={signUpForm.control}
                                            name="password"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Password</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                            <Input type="password" placeholder="••••••••" {...field} className="pl-9" />
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <Button type="submit" className="w-full" disabled={isLoading}>
                                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Create Account
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
                
                <div className="relative w-full max-w-sm my-6">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-sm text-muted-foreground">OR</span>
                </div>

                <div className="w-full max-w-sm">
                    <Button
                        onClick={handleAnonymousSignIn}
                        variant="secondary"
                        size="lg"
                        className="w-full"
                        disabled={isLoading}
                    >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <UserIcon className="h-5 w-5 mr-2" />
                        Sign in as Guest
                    </Button>
                </div>
                 <p className="text-xs text-muted-foreground mt-8 px-4">
                    By signing in, you agree to our imaginary Terms of Service.
                    Your private keys are generated and stored only on this device.
                </p>
            </div>
        </main>
    );
}
