
"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from "firebase/auth";
import { useRouter } from "next/navigation";
import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { Loader2, AlertTriangle, Lock } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { firestore, auth } from "@/lib/firebase";
import { Label } from "@/components/ui/label";

interface DeleteAccountDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    user: User;
}

export default function DeleteAccountDialog({ isOpen, onOpenChange, user }: DeleteAccountDialogProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    const [password, setPassword] = useState("");

    const handleAccountDelete = async () => {
        if (confirmationText.toLowerCase() !== 'delete my account') {
            toast({
                variant: "destructive",
                title: "Confirmation failed",
                description: "Please type 'delete my account' to confirm."
            });
            return;
        }

        if (password === '') {
            toast({
                variant: "destructive",
                title: "Password required",
                description: "Please enter your password to confirm account deletion."
            });
            return;
        }

        setIsDeleting(true);

        try {
            const currentUser = auth.currentUser;
            if (!currentUser || !currentUser.email) {
                toast({ variant: "destructive", title: "Error", description: "Could not verify user. Please sign in again." });
                setIsDeleting(false);
                return;
            }

            // Re-authenticate the user with their password
            const credential = EmailAuthProvider.credential(currentUser.email, password);
            await reauthenticateWithCredential(currentUser, credential);

            // If re-authentication is successful, proceed with deletion
            const chatsQuery = query(collection(firestore, "chats"), where("participantUids", "array-contains", user.uid));
            const chatsSnapshot = await getDocs(chatsQuery);
            const batch = writeBatch(firestore);
            chatsSnapshot.forEach(chatDoc => {
                batch.delete(chatDoc.ref);
            });

            const userDocRef = doc(firestore, "users", user.uid);
            batch.delete(userDocRef);
            
            await batch.commit();

            await deleteUser(currentUser);

            toast({
                title: "Account Deleted",
                description: "Your account and all associated data have been permanently deleted.",
            });
            
            onOpenChange(false);
            await auth.signOut();
            router.push("/login");

        } catch (error: any) {
            console.error("Error deleting account:", error);
            let description = "An unexpected error occurred. Please try again.";
            if (error.code === 'auth/wrong-password') {
                description = "The password you entered is incorrect. Please try again.";
            } else if (error.code === 'auth/too-many-requests') {
                description = "Too many failed attempts. Please try again later."
            } else if (error.code === 'auth/invalid-credential') {
                 description = "The password you entered is incorrect. Please try again.";
            }
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: description,
            });
        } finally {
            setIsDeleting(false);
            setPassword("");
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={(open) => {
            if(!open) {
                setConfirmationText("");
                setPassword("");
            }
            onOpenChange(open);
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="text-destructive" />
                        Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This action is permanent and cannot be undone. This will permanently delete your account,
                        all your chats, and remove your data from our servers.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="my-2 space-y-4">
                     <div>
                        <Label htmlFor="confirmation">
                            To confirm, type <strong>delete my account</strong> below.
                        </Label>
                        <Input
                            id="confirmation"
                            value={confirmationText}
                            onChange={(e) => setConfirmationText(e.target.value)}
                            placeholder="delete my account"
                            className="border-destructive focus-visible:ring-destructive mt-1"
                            autoFocus
                        />
                     </div>
                     <div>
                        <Label htmlFor="password">Enter your password</Label>
                        <div className="relative mt-1">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="pl-9 border-destructive focus-visible:ring-destructive"
                            />
                        </div>
                     </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        onClick={handleAccountDelete}
                        disabled={isDeleting || confirmationText.toLowerCase() !== 'delete my account' || password === ""}
                    >
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        I understand, delete my account
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
