
"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { ref, update } from "firebase/database";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { database } from "@/lib/firebase";
import DeleteAccountDialog from "./delete-account-dialog";
import DeleteChatsDialog from "./delete-chats-dialog";
import { Separator } from "./ui/separator";

interface SettingsFormProps {
    user: User;
}

export default function SettingsForm({ user }: SettingsFormProps) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
    const [isDeleteChatsOpen, setIsDeleteChatsOpen] = useState(false);
    
    // Note: These settings are for UI demonstration.
    // A full implementation of auto-deletion requires server-side logic (e.g., Cloud Functions).
    const [enableAutoDeleteChats, setEnableAutoDeleteChats] = useState(false);
    const [autoDeleteTime, setAutoDeleteTime] = useState("never");
    const [accountDeletionTime, setAccountDeletionTime] = useState("never");
    const [enableAccountDeletionOnInactivity, setEnableAccountDeletionOnInactivity] = useState(false);

    const handleSavePreferences = async () => {
        setIsSaving(true);
        try {
            const userRef = ref(database, "users/" + user.uid);
            await update(userRef, {
                'settings/enableAutoDeleteChats': enableAutoDeleteChats,
                'settings/autoDeleteTime': autoDeleteTime,
                'settings/accountDeletionTime': accountDeletionTime,
                'settings/enableAccountDeletionOnInactivity': enableAccountDeletionOnInactivity,
            });
            toast({
                title: "Preferences Saved",
                description: "Your settings have been updated.",
            });
        } catch (error) {
            console.error("Error saving preferences:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to save your preferences.",
            });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Chat Management</CardTitle>
                    <CardDescription>
                        Manage automatic deletion of your chat history. This will apply to all your chats.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="auto-delete-switch" className="flex flex-col gap-1">
                            <span>Enable automatic chat deletion</span>
                            <span className="font-normal text-muted-foreground text-sm">
                                Automatically delete messages older than the selected timeframe.
                            </span>
                        </Label>
                        <Switch
                            id="auto-delete-switch"
                            checked={enableAutoDeleteChats}
                            onCheckedChange={setEnableAutoDeleteChats}
                        />
                    </div>

                    {enableAutoDeleteChats && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <Label htmlFor="auto-delete-time" className="shrink-0">
                                Delete chats older than
                            </Label>
                            <Select value={autoDeleteTime} onValueChange={setAutoDeleteTime}>
                                <SelectTrigger id="auto-delete-time" className="w-full sm:w-[200px]">
                                    <SelectValue placeholder="Select time" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="never">Never</SelectItem>
                                    <SelectItem value="24h">24 hours</SelectItem>
                                    <SelectItem value="48h">48 hours</SelectItem>
                                    <SelectItem value="1w">1 week</SelectItem>
                                    <SelectItem value="1m">1 month</SelectItem>
                                    <SelectItem value="3m">3 months</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    
                    <Separator />

                    <div>
                        <Button
                            variant="destructive"
                            onClick={() => setIsDeleteChatsOpen(true)}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete All Chats Now
                        </Button>
                        <p className="text-sm text-muted-foreground mt-2">
                            Immediately delete all of your chat history from all conversations.
                        </p>
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <Button onClick={handleSavePreferences} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Preferences
                    </Button>
                </CardFooter>
            </Card>

            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    <CardDescription>
                        These actions are permanent and cannot be undone. Please proceed with caution.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="account-inactivity-delete" className="flex flex-col gap-1">
                            <span className="font-medium text-destructive">Enable auto-delete for inactive account</span>
                            <span className="font-normal text-muted-foreground text-sm">
                                If enabled, your account and all data will be permanently deleted after a period of inactivity.
                            </span>
                        </Label>
                        <Switch
                            id="account-inactivity-delete"
                            checked={enableAccountDeletionOnInactivity}
                            onCheckedChange={setEnableAccountDeletionOnInactivity}
                        />
                    </div>

                    {enableAccountDeletionOnInactivity && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <Label htmlFor="account-auto-delete" className="shrink-0">
                                Delete account after
                            </Label>
                            <Select value={accountDeletionTime} onValueChange={setAccountDeletionTime}>
                                <SelectTrigger id="account-auto-delete" className="w-full sm:w-[200px] border-destructive focus:ring-destructive">
                                    <SelectValue placeholder="Select inactivity period" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="never">Never</SelectItem>
                                    <SelectItem value="24h">24 hours</SelectItem>
                                    <SelectItem value="48h">48 hours</SelectItem>
                                    <SelectItem value="1w">1 week</SelectItem>
                                    <SelectItem value="1m">1 month</SelectItem>
                                    <SelectItem value="3m">3 months</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    
                    <Separator className="bg-destructive/20" />

                    <div>
                        <Button 
                            variant="destructive"
                            onClick={() => setIsDeleteAccountOpen(true)}
                        >
                            Delete My Account Now
                        </Button>
                        <p className="text-sm text-muted-foreground mt-2">
                           Permanently delete your account and all associated data immediately.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <DeleteAccountDialog
                isOpen={isDeleteAccountOpen}
                onOpenChange={setIsDeleteAccountOpen}
                user={user}
            />
            
            <DeleteChatsDialog
                isOpen={isDeleteChatsOpen}
                onOpenChange={setIsDeleteChatsOpen}
                user={user}
            />
        </div>
    );
}
