
"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from "firebase/auth";
import { useRouter } from "next/navigation";
import { ref, get, update } from "firebase/database";
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
import { database, auth } from "@/lib/firebase";
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

        if (!user.isAnonymous && password === '') {
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
            if (!currentUser) {
                throw new Error("Could not verify user. Please sign in again.");
            }

            // Re-authenticate if not anonymous
            if (!currentUser.isAnonymous && currentUser.email) {
                const credential = EmailAuthProvider.credential(currentUser.email, password);
                await reauthenticateWithCredential(currentUser, credential);
            }

            const userChatsRef = ref(database, `user-chats/${user.uid}`);
            const userChatsSnap = await get(userChatsRef);
            
            const updates: { [key: string]: null } = {};

            if (userChatsSnap.exists()) {
                const chatIds = Object.keys(userChatsSnap.val());
                chatIds.forEach(chatId => {
                    updates[`/chats/${chatId}/participants/${user.uid}`] = null;
                });
            }

            // Remove user's private data, including public key
            updates[`/users/${user.uid}`] = null;
            updates[`/user-chats/${user.uid}`] = null;

            if (Object.keys(updates).length > 0) {
                await update(ref(database), updates);
            }

            await deleteUser(currentUser);

            // Clear local storage for this user
            localStorage.removeItem(`privox_privateKey_${user.uid}`);

            toast({
                title: "Account Deleted",
                description: "Your account and associated data have been permanently deleted.",
            });
            
            onOpenChange(false);
            await auth.signOut();
            router.push("/login");

        } catch (error: any) {
            console.error("Error deleting account:", error);
            let description = "An unexpected error occurred. Please try again.";
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = "The password you entered is incorrect. Please try again.";
            } else if (error.code === 'auth/requires-recent-login') {
                description = "This is a sensitive operation. Please sign out and sign back in before deleting your account.";
            } else if (error.code === 'auth/too-many-requests') {
                description = "Too many failed attempts. Please try again later."
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
                        This action is permanent and cannot be undone. This will permanently delete your account
                        and all associated data. Your private key on this device will be erased.
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
                     {!user.isAnonymous && (
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
                     )}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        onClick={handleAccountDelete}
                        disabled={isDeleting || confirmationText.toLowerCase() !== 'delete my account' || (!user.isAnonymous && password === "")}
                    >
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        I understand, delete my account
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
