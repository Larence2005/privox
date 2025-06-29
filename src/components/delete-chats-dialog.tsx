
"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { ref, get, update } from "firebase/database";
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
import { database } from "@/lib/firebase";

interface DeleteChatsDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    user: User;
}

export default function DeleteChatsDialog({ isOpen, onOpenChange, user }: DeleteChatsDialogProps) {
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleChatsDelete = async () => {
        setIsDeleting(true);

        try {
            const userChatsRef = ref(database, `user-chats/${user.uid}`);
            const userChatsSnap = await get(userChatsRef);
            
            if (!userChatsSnap.exists()) {
                toast({ title: "No chats to delete." });
                setIsDeleting(false);
                onOpenChange(false);
                return;
            }

            const chatIds = Object.keys(userChatsSnap.val());
            
            // This multi-path update will "leave" all chats.
            // It is a valid operation because we are only writing to paths we have access to:
            // 1. Our own /user-chats/{uid} path.
            // 2. The /chats/{chatId}/participants/{uid} path, which is allowed because we are a participant.
            const updates: { [key: string]: null } = {};
            chatIds.forEach(chatId => {
                updates[`/user-chats/${user.uid}/${chatId}`] = null;
                updates[`/chats/${chatId}/participants/${user.uid}`] = null;
            });
            
            if (Object.keys(updates).length > 0) {
              await update(ref(database), updates);
            }

            toast({
                title: "Success",
                description: "You have left all your chats.",
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
                        Leave All Chats?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This will remove you from all of your conversations. This action cannot be undone.
                        Other participants will remain in the chats.
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
                        Yes, Leave All Chats
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

    