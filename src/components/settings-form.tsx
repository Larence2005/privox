
"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import DeleteAccountDialog from "./delete-account-dialog";
import DeleteChatsDialog from "./delete-chats-dialog";

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
    const [autoDeleteTime, setAutoDeleteTime] = useState("never");
    const [deleteOnInactivity, setDeleteOnInactivity] = useState(false);

    const handleSavePreferences = async () => {
        setIsSaving(true);
        try {
            const userRef = doc(firestore, "users", user.uid);
            await updateDoc(userRef, {
                'settings.autoDeleteTime': autoDeleteTime,
                'settings.deleteOnInactivity': deleteOnInactivity,
            });
            toast({
                title: "Preferences Saved",
                description: "Your chat settings have been updated.",
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <Label htmlFor="auto-delete" className="shrink-0">
                            Remove chats older than
                        </Label>
                        <Select value={autoDeleteTime} onValueChange={setAutoDeleteTime}>
                            <SelectTrigger id="auto-delete" className="w-full sm:w-[200px]">
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
                    <div className="flex items-center justify-between">
                        <Label htmlFor="inactivity-delete" className="flex flex-col gap-1">
                            <span>Delete on inactivity</span>
                            <span className="font-normal text-muted-foreground text-sm">
                                If enabled, chats will be deleted after the selected timeframe of inactivity.
                            </span>
                        </Label>
                        <Switch
                            id="inactivity-delete"
                            checked={deleteOnInactivity}
                            onCheckedChange={setDeleteOnInactivity}
                        />
                    </div>
                     <div className="pt-4">
                        <Button
                            variant="destructive"
                            onClick={() => setIsDeleteChatsOpen(true)}
                        >
                            Delete All Chats Now
                        </Button>
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
                        These actions are permanent and cannot be undone.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button 
                        variant="destructive"
                        onClick={() => setIsDeleteAccountOpen(true)}
                    >
                        Delete My Account
                    </Button>
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
