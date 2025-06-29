
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

            const updates: { [key: string]: null } = {};
            const chatIds = Object.keys(userChatsSnap.val());

            const chatPromises = chatIds.map(chatId => get(ref(database, `chats/${chatId}`)));
            const chatSnaps = await Promise.all(chatPromises);

            chatSnaps.forEach((chatSnap, index) => {
                const chatId = chatIds[index];
                if (chatSnap.exists()) {
                    const participants = chatSnap.val().participants;
                    if (participants) {
                        Object.keys(participants).forEach(uid => {
                            updates[`/user-chats/${uid}/${chatId}`] = null;
                        });
                    }
                }
                updates[`/chats/${chatId}`] = null;
                updates[`/messages/${chatId}`] = null;
            });

            if (Object.keys(updates).length > 0) {
              await update(ref(database), updates);
            }

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
