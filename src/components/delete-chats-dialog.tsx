
"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { collection, getDocs, query, where, writeBatch } from "firebase/firestore";
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
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";

interface DeleteChatsDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    user: User;
}

// Helper function to delete all documents in a collection or subcollection
async function deleteCollection(collectionPath: string) {
    const collectionRef = collection(firestore, collectionPath);
    const q = query(collectionRef);
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) return;

    const batch = writeBatch(firestore);
    querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}

export default function DeleteChatsDialog({ isOpen, onOpenChange, user }: DeleteChatsDialogProps) {
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleChatsDelete = async () => {
        setIsDeleting(true);

        try {
            const chatsQuery = query(collection(firestore, 'chats'), where('participantUids', 'array-contains', user.uid));
            const chatsSnapshot = await getDocs(chatsQuery);
            
            if (chatsSnapshot.empty) {
                toast({ title: "No chats to delete." });
                setIsDeleting(false);
                onOpenChange(false);
                return;
            }

            const batch = writeBatch(firestore);
            
            for (const chatDoc of chatsSnapshot.docs) {
                // Delete all messages in the subcollection first
                await deleteCollection(`chats/${chatDoc.id}/messages`);
                // Then, add the chat document deletion to the batch
                batch.delete(chatDoc.ref);
            }
            
            await batch.commit();

            toast({
                title: "Success",
                description: "All your chats have been deleted.",
            });
            
        } catch (error) {
            console.error("Error deleting chats:", error);
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: "Could not delete your chats. Please try again.",
            });
        } finally {
            setIsDeleting(false);
            onOpenChange(false);
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="text-destructive" />
                        Delete All Chats?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete all your conversations. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        onClick={handleChatsDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Yes, Delete All Chats
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
