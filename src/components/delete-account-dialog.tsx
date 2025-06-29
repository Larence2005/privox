
"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { deleteUser } from "firebase/auth";
import { useRouter } from "next/navigation";
import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { Loader2, AlertTriangle } from "lucide-react";

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

    const handleAccountDelete = async () => {
        if (confirmationText.toLowerCase() !== 'delete my account') {
            toast({
                variant: "destructive",
                title: "Confirmation failed",
                description: "Please type 'delete my account' to confirm."
            });
            return;
        }

        setIsDeleting(true);

        try {
            // Firestore does not support deleting subcollections from the client.
            // This will delete the chat documents, but the 'messages' subcollections will remain.
            // A Cloud Function is required for recursive deletion.
            const chatsQuery = query(collection(firestore, "chats"), where("participantUids", "array-contains", user.uid));
            const chatsSnapshot = await getDocs(chatsQuery);
            const batch = writeBatch(firestore);
            chatsSnapshot.forEach(chatDoc => {
                batch.delete(chatDoc.ref);
            });

            const userDocRef = doc(firestore, "users", user.uid);
            batch.delete(userDocRef);
            
            await batch.commit();

            // This will fail if the user hasn't signed in recently.
            await deleteUser(user);

            toast({
                title: "Account Deleted",
                description: "Your account and all associated data have been permanently deleted.",
            });
            
            await auth.signOut();
            router.push("/login");

        } catch (error: any) {
            console.error("Error deleting account:", error);
            let description = "An unexpected error occurred.";
            if (error.code === 'auth/requires-recent-login') {
                description = "This is a sensitive operation and requires you to have signed in recently. Please sign out and sign back in to delete your account."
            }
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: description,
            });
        } finally {
            setIsDeleting(false);
            onOpenChange(false);
            setConfirmationText("");
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="text-destructive" />
                        Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This action is permanent and cannot be undone. This will permanently delete your account,
                        all your chats, and remove your data from our servers.
                        <br /><br />
                        To confirm, please type <strong>delete my account</strong> in the box below.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="my-4">
                    <Input
                        id="confirmation"
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        placeholder="delete my account"
                        className="border-destructive focus-visible:ring-destructive"
                        autoFocus
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        onClick={handleAccountDelete}
                        disabled={isDeleting || confirmationText.toLowerCase() !== 'delete my account'}
                    >
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        I understand, delete my account
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
