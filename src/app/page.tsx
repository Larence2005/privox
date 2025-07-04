
"use client";

import { useState, useEffect, useCallback } from "react";
import type { User } from "firebase/auth";
import {
  ref,
  onValue,
  get,
  push,
  serverTimestamp,
  update,
  off,
  set,
} from "firebase/database";
import { Copy, LogOut, MessageSquarePlus, Loader2, Users, Settings, MoreVertical, ShieldBan, Trash2, History } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuth } from "@/hooks/use-auth";
import { database, auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { Separator } from "@/components/ui/separator";
import ChatInterface from "@/components/chat-interface";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { 
    generateChatKey,
    getStoredPrivateKey,
    importPublicKeyFromBase64,
    wrapChatKey
} from "@/lib/crypto";

interface ParticipantInfo {
    displayName: string | null;
    photoURL: string | null;
}

interface UserData extends ParticipantInfo {
  uid: string;
  publicKey?: string;
}

interface Chat {
  id: string;
  participants: Record<string, boolean>;
  participantInfo?: Record<string, ParticipantInfo>;
  keys: Record<string, string>;
  lastMessage?: string;
  timestamp: number;
  createdBy: string;
}

export interface ChatWithParticipants extends Chat {
  participantsData: UserData[];
  clearedTimestamp?: number;
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  const [chats, setChats] = useState<ChatWithParticipants[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatWithParticipants | null>(null);
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);
  const [newChatUserId, setNewChatUserId] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [chatToClear, setChatToClear] = useState<ChatWithParticipants | null>(null);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [chatToLeave, setChatToLeave] = useState<ChatWithParticipants | null>(null);
  const [isLeavingChat, setIsLeavingChat] = useState(false);


  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const blockedUsersRef = ref(database, `users/${user.uid}/blocked`);
    const listener = onValue(blockedUsersRef, (snapshot) => {
        const blockedData = snapshot.val();
        setBlockedUsers(new Set(blockedData ? Object.keys(blockedData) : []));
    });
    return () => off(blockedUsersRef, 'value', listener);
  }, [user]);

  const processChatData = useCallback(async (chatId: string, chatData: any, uid: string): Promise<ChatWithParticipants | null> => {
      if (!chatData || !chatData.participants) return null;
      if (!Object.keys(chatData.participants).includes(uid) && !chatData.participantInfo?.[uid]) return null;

      let participantsData: UserData[];
      const participantUids = chatData.participantInfo ? Object.keys(chatData.participantInfo) : Object.keys(chatData.participants);

      if (chatData.participantInfo) {
          participantsData = participantUids.map(pUid => ({
              uid: pUid,
              displayName: chatData.participantInfo[pUid]?.displayName ?? "Unknown User",
              photoURL: chatData.participantInfo[pUid]?.photoURL ?? null
          }));
      } else {
          const participantPromises = participantUids.map(uid => get(ref(database, `users/${uid}`)));
          const participantSnaps = await Promise.all(participantPromises);
          participantsData = participantSnaps
              .filter(pSnap => pSnap.exists())
              .map(pSnap => pSnap.val() as UserData);
      }
      
      const clearedRef = ref(database, `cleared-chats/${uid}/${chatId}`);
      const clearedSnap = await get(clearedRef);
      const clearedTimestamp = clearedSnap.exists() ? clearedSnap.val() : undefined;

      return {
          id: chatId,
          ...chatData,
          participantsData,
          clearedTimestamp,
      };
  }, []);

  useEffect(() => {
    if (!user) return;

    const invitesRef = ref(database, `invites/${user.uid}`);
    const listener = onValue(invitesRef, (snapshot) => {
        if (!snapshot.exists()) return;

        const invites = snapshot.val();
        Object.keys(invites).forEach(async (chatId) => {
            const chatRef = ref(database, `chats/${chatId}`);
            const chatSnap = await get(chatRef);
            
            if (chatSnap.exists() && chatSnap.val().participants[user.uid]) {
                const updates: { [key: string]: any } = {};
                updates[`/user-chats/${user.uid}/${chatId}`] = true;
                updates[`/invites/${user.uid}/${chatId}`] = null;
                await update(ref(database), updates);
            } else {
                await set(ref(database, `/invites/${user.uid}/${chatId}`), null);
            }
        });
    });

    return () => off(invitesRef, 'value', listener);
  }, [user]);

  useEffect(() => {
      if (!user) return;

      setIsLoading(true);
      const userChatsRef = ref(database, `user-chats/${user.uid}`);
      const chatListeners: { [key: string]: () => void } = {};

      const userChatsListener = onValue(userChatsRef, (snapshot) => {
          const chatIds = snapshot.exists() ? Object.keys(snapshot.val()) : [];

          Object.keys(chatListeners).forEach(chatId => {
              if (!chatIds.includes(chatId)) {
                  chatListeners[chatId]();
                  delete chatListeners[chatId];
                  setChats(prev => prev.filter(c => c.id !== chatId));
              }
          });

          if (chatIds.length === 0) {
            setChats([]);
            setIsLoading(false);
            return;
          }
          
          setIsLoading(true);

          chatIds.forEach(chatId => {
              if (chatListeners[chatId]) return;

              const chatRef = ref(database, `chats/${chatId}`);
              const chatListener = onValue(chatRef, async (chatSnap) => {
                  if (!chatSnap.exists()) {
                      setChats(prev => prev.filter(c => c.id !== chatId));
                      update(ref(database), {[`/user-chats/${user.uid}/${chatId}`]: null});
                      return;
                  };

                  const newChatData = await processChatData(chatId, chatSnap.val(), user.uid);

                  setChats(prevChats => {
                      if (!newChatData) {
                          return prevChats.filter(c => c.id !== chatId);
                      }
                      const existingChatIndex = prevChats.findIndex(c => c.id === chatId);
                      let newChats = [...prevChats];
                      if (existingChatIndex !== -1) {
                          newChats[existingChatIndex] = newChatData;
                      } else {
                          newChats.push(newChatData);
                      }
                      newChats.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
                      return newChats;
                  });
                   
                  if (Object.keys(chatListeners).length === chatIds.length) {
                    setIsLoading(false);
                  }
              }, (error) => {
                  console.error(`Error fetching chat ${chatId}:`, error);
                  setChats(prev => prev.filter(c => c.id !== chatId));
              });
              
              chatListeners[chatId] = () => off(chatRef, 'value', chatListener);
          });
      }, (error) => {
          console.error("User chats listener error:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to listen for chat updates. Please check your network and security rules.' });
          setIsLoading(false);
      });

      return () => {
          off(userChatsRef, 'value', userChatsListener);
          Object.values(chatListeners).forEach(cleanup => cleanup());
      };
  }, [user, toast, processChatData]);

  const handleSignOut = async () => {
    await auth.signOut();
    router.push("/login");
  };

  const handleCopyUserId = () => {
    if(!user) return;
    navigator.clipboard.writeText(user.uid);
    toast({
      title: "User ID Copied!",
      description: "You can now share it with others to start a chat.",
    });
  };

  const handleBlockToggle = async (otherUserId: string) => {
    if (!user) return;
    const isBlocked = blockedUsers.has(otherUserId);
    const blockedUserRef = ref(database, `users/${user.uid}/blocked/${otherUserId}`);
    try {
        if (isBlocked) {
            await set(blockedUserRef, null); // Unblock
            toast({ title: "User Unblocked", description: "You can now chat with this user." });
        } else {
            await set(blockedUserRef, true); // Block
            if (selectedChat?.participantsData.some(p => p.uid === otherUserId)) {
                setSelectedChat(null);
            }
            toast({ title: "User Blocked", description: "You will no longer see this user's chats." });
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not update block status." });
    }
  };

  const handleClearChatHistory = async () => {
    if (!chatToClear || !user) return;

    try {
      const clearedRef = ref(database, `cleared-chats/${user.uid}/${chatToClear.id}`);
      await set(clearedRef, serverTimestamp());
      
      toast({ title: "Chat History Cleared", description: "Messages have been cleared from your view." });
      
      const now = Date.now();
      setChats(prev => prev.map(c => 
          c.id === chatToClear.id ? { ...c, clearedTimestamp: now } : c
      ));

      if (selectedChat?.id === chatToClear.id) {
          setSelectedChat(prev => prev ? { ...prev, clearedTimestamp: now } : null);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not clear chat history." });
    } finally {
      setIsClearDialogOpen(false);
      setChatToClear(null);
    }
  };

  const openClearDialog = (chat: ChatWithParticipants) => {
      setChatToClear(chat);
      setIsClearDialogOpen(true);
  };
  
  const handleLeaveChat = async () => {
    if (!chatToLeave || !user) return;
    setIsLeavingChat(true);

    try {
      const chatRef = ref(database, `chats/${chatToLeave.id}`);
      const chatSnap = await get(chatRef);
      if (!chatSnap.exists()) return;

      const chatData = chatSnap.val();
      const participants = chatData.participants ?? {};
      const participantsCount = Object.keys(participants).length;
      const updates: { [key: string]: any } = {};

      if (!chatData.participantInfo) {
        const pUids = Object.keys(participants);
        const pSnaps = await Promise.all(pUids.map(uid => get(ref(database, `users/${uid}`))));
        const newParticipantInfo: Record<string, ParticipantInfo> = {};
        pSnaps.forEach(pSnap => {
            if(pSnap.exists()){
                const userData = pSnap.val();
                newParticipantInfo[userData.uid] = {
                    displayName: userData.displayName,
                    photoURL: userData.photoURL
                }
            }
        });
        updates[`/chats/${chatToLeave.id}/participantInfo`] = newParticipantInfo;
      }

      if (participantsCount <= 1) {
        updates[`/chats/${chatToLeave.id}`] = null;
        updates[`/messages/${chatToLeave.id}`] = null;
        Object.keys(participants).forEach(uid => {
            updates[`/user-chats/${uid}/${chatToLeave.id}`] = null;
        });
        toast({ title: "Chat Deleted", description: "As you were the last participant, the conversation has been permanently deleted." });
      } else {
        updates[`/chats/${chatToLeave.id}/participants/${user.uid}`] = null;
        updates[`/chats/${chatToLeave.id}/keys/${user.uid}`] = null;
        toast({ title: "Chat Left", description: "You have left the conversation." });
      }

      updates[`/user-chats/${user.uid}/${chatToLeave.id}`] = null;
      updates[`/cleared-chats/${user.uid}/${chatToLeave.id}`] = null;

      await update(ref(database), updates);

      if (selectedChat?.id === chatToLeave.id) {
        setSelectedChat(null);
      }
    } catch (error) {
      console.error("Error leaving chat:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not leave the chat." });
    } finally {
      setIsLeaveDialogOpen(false);
      setChatToLeave(null);
      setIsLeavingChat(false);
    }
  };

  const openLeaveDialog = (chat: ChatWithParticipants) => {
    setChatToLeave(chat);
    setIsLeaveDialogOpen(true);
  };

  const handleCreateNewChat = async () => {
    if(!user) return;
    const trimmedId = newChatUserId.trim();
    if (!trimmedId) return;

    if (trimmedId === user.uid) {
        toast({ variant: "destructive", title: "Error", description: "You cannot start a chat with yourself." });
        return;
    }
    
    if (blockedUsers.has(trimmedId)) {
        toast({ variant: "destructive", title: "User Blocked", description: "You cannot start a chat with a blocked user." });
        return;
    }
    
    const otherUserBlocksMeRef = ref(database, `users/${trimmedId}/blocked/${user.uid}`);
    const otherUserBlocksMeSnap = await get(otherUserBlocksMeRef);
    if (otherUserBlocksMeSnap.exists()) {
      toast({ variant: 'destructive', title: 'Unable to Chat', description: 'You cannot send messages to this user.' });
      return;
    }

    setIsCreatingChat(true);

    try {
        const otherUserSnap = await get(ref(database, `users/${trimmedId}`));
        if (!otherUserSnap.exists()) {
            toast({ variant: "destructive", title: "Error", description: "User not found." });
            setIsCreatingChat(false);
            return;
        }

        const existingChat = chats.find(chat => 
            Object.keys(chat.participants).length === 2 &&
            chat.participants[user.uid] &&
            chat.participants[trimmedId]
        );

        if (existingChat) {
            toast({ title: "Chat already exists", description: "You are already chatting with this user." });
            setSelectedChat(existingChat);
            setIsNewChatDialogOpen(false);
            setNewChatUserId("");
            setIsCreatingChat(false);
            return;
        }
        
        const mySnap = await get(ref(database, `users/${user.uid}`));
        const myUserData = mySnap.val() as UserData;
        const otherUserData = otherUserSnap.val() as UserData;

        if (!myUserData.publicKey || !otherUserData.publicKey) {
             throw new Error("One or both users are missing a public key.");
        }

        const myPublicKey = await importPublicKeyFromBase64(myUserData.publicKey);
        const otherPublicKey = await importPublicKeyFromBase64(otherUserData.publicKey);

        const newChatKey = await generateChatKey();
        
        const wrappedKeyForSelf = await wrapChatKey(newChatKey, myPublicKey);
        const wrappedKeyForOther = await wrapChatKey(newChatKey, otherPublicKey);

        const newChatRef = push(ref(database, 'chats'));
        const newChatId = newChatRef.key;
        if (!newChatId) throw new Error("Could not generate new chat ID");
        
        const participants = { [user.uid]: true, [trimmedId]: true };
        const participantInfo = {
            [user.uid]: {
                displayName: myUserData.displayName,
                photoURL: myUserData.photoURL,
            },
            [trimmedId]: {
                displayName: otherUserData.displayName,
                photoURL: otherUserData.photoURL,
            },
        };

        const chatData = {
            participants,
            participantInfo,
            keys: {
                [user.uid]: wrappedKeyForSelf,
                [trimmedId]: wrappedKeyForOther,
            },
            timestamp: serverTimestamp(),
            lastMessage: "Chat created",
            createdBy: user.uid,
        };
        
        const updates: { [key: string]: any } = {};
        updates[`/chats/${newChatId}`] = chatData;
        updates[`/user-chats/${user.uid}/${newChatId}`] = true;
        updates[`/invites/${trimmedId}/${newChatId}`] = true;

        await update(ref(database), updates);
        
        toast({
            title: "Chat Created!",
            description: "An invite has been sent. The chat will appear when the user comes online.",
        });
        
        setIsNewChatDialogOpen(false);
        setNewChatUserId("");

    } catch (error: any) {
        console.error("Error creating chat:", error);
        toast({ 
            variant: "destructive", 
            title: "Error creating chat",
            description: error.message || "An unexpected error occurred. You may need to have the other user sign in once to generate their keys."
        });
    } finally {
        setIsCreatingChat(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex w-full h-full">
            <aside className="h-full flex-col border-r hidden md:flex w-80 lg:w-96 p-2">
                <div className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <div className="p-2 space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
                <Separator className="my-2"/>
                <div className="flex-1 p-2 space-y-1">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 rounded-md w-full">
                             <Skeleton className="h-10 w-10 rounded-full" />
                             <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-40" />
                            </div>
                        </div>
                    ))}
                </div>
            </aside>
            <main className="flex-1 flex-col flex items-center justify-center">
                <Users className="h-16 w-16 mb-4 text-muted-foreground animate-pulse" />
                <h2 className="text-2xl font-semibold text-muted-foreground">Loading Your Chats...</h2>
            </main>
        </div>
      </div>
    );
  }
  
  const filteredChats = chats.filter(chat => {
    const otherParticipant = chat.participantsData.find(p => p.uid !== user?.uid);
    return otherParticipant ? !blockedUsers.has(otherParticipant.uid) : true;
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card text-card-foreground">
      <header className="p-4 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
              <Avatar>
                  <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? "User"} />
                  <AvatarFallback>{user.displayName?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="overflow-hidden">
                <p className="font-semibold truncate">{user.displayName}</p>
              </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeSwitcher />
            {!user.isAnonymous && (
              <Button variant="ghost" size="icon" aria-label="Settings" asChild>
                <Link href="/settings">
                  <Settings className="h-5 w-5" />
                </Link>
              </Button>
            )}
          </div>
      </header>

      <div className="p-4 space-y-2 shrink-0">
        <Button onClick={handleCopyUserId} variant="outline" className="w-full">
            <Copy className="mr-2 h-4 w-4"/> Copy User ID
        </Button>
        <Button onClick={() => setIsNewChatDialogOpen(true)} className="w-full">
            <MessageSquarePlus className="mr-2 h-4 w-4" /> New Chat
        </Button>
      </div>
      
      <Separator />

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading chats...</div>
        )}
        {!isLoading && filteredChats.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {chats.length > 0 ? "All chats are with blocked users." : "No chats yet. Start a new one!"}
          </div>
        )}
        {filteredChats.map(chat => {
            const otherParticipant = chat.participantsData.find(p => p.uid !== user.uid);
            const hasOtherUserLeft = otherParticipant ? !chat.participants[otherParticipant.uid] : true;
            const isBlocked = otherParticipant ? blockedUsers.has(otherParticipant.uid) : false;
            
            const displayName = otherParticipant?.displayName ?? "User Left";
            const photoURL = otherParticipant?.photoURL;

            return (
                <div key={chat.id} className="relative group/chat-item">
                    <button
                        onClick={() => setSelectedChat(chat)}
                        className={cn(
                            "flex items-center gap-3 p-2 rounded-md w-full text-left transition-colors pr-10",
                            selectedChat?.id === chat.id ? "bg-primary/10" : "hover:bg-muted"
                        )}
                    >
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={photoURL ?? undefined} alt={displayName} />
                            <AvatarFallback>{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 overflow-hidden">
                            <p className="font-semibold truncate">{displayName}</p>
                            <p className="text-sm text-muted-foreground truncate">
                                {hasOtherUserLeft ? "This user has left." : chat.lastMessage}
                            </p>
                        </div>
                        {!hasOtherUserLeft && chat.timestamp && (
                             <div className="text-xs text-muted-foreground self-start">
                                {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        )}
                    </button>
                    <div className="absolute top-1 right-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover/chat-item:opacity-100 focus:opacity-100">
                                    <MoreVertical className="h-4 w-4" />
                                    <span className="sr-only">Chat options</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {otherParticipant && (
                                    <>
                                        <DropdownMenuItem onClick={() => handleBlockToggle(otherParticipant.uid)}>
                                            <ShieldBan className="mr-2 h-4 w-4" />
                                            <span>{isBlocked ? 'Unblock User' : 'Block User'}</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </>
                                )}
                                <DropdownMenuItem onClick={() => openClearDialog(chat)}>
                                    <History className="mr-2 h-4 w-4" />
                                    <span>Clear History</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openLeaveDialog(chat)} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Leave Chat</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            )
        })}
      </nav>

      <footer className="p-4 border-t shrink-0">
        <Button variant="destructive" onClick={handleSignOut} className="w-full">
            <LogOut className="mr-2 h-5 w-5" />
            Sign Out
        </Button>
      </footer>
    </div>
  )

  return (
    <div className="flex h-screen w-full bg-muted/40">
        <aside className={cn(
            "h-full flex-col border-r",
            isMobile ? (selectedChat ? "hidden md:flex w-full md:w-80 lg:w-96" : "flex w-full md:w-80 lg:w-96") : "flex w-80 lg:w-96"
        )}>
           <SidebarContent />
        </aside>
        
        <main className={cn(
            "flex-1 flex-col",
            isMobile ? (selectedChat ? "flex" : "hidden md:flex") : "flex"
        )}>
          {selectedChat ? (
            <ChatInterface user={user} chat={selectedChat} onBack={() => setSelectedChat(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground bg-background">
                <Users className="h-16 w-16 mb-4" />
                <h2 className="text-2xl font-semibold">Welcome to Privox</h2>
                <p>Select a chat to start messaging or create a new one.</p>
            </div>
          )}
        </main>
      
      <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a New Chat</DialogTitle>
            <DialogDescription>
              Enter the User ID of the person you want to chat with.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              id="userId"
              placeholder="Paste User ID here"
              value={newChatUserId}
              onChange={(e) => setNewChatUserId(e.target.value)}
              onKeyDown={(e) => {
                if(e.key === "Enter") handleCreateNewChat();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewChatDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateNewChat} disabled={isCreatingChat}>
                {isCreatingChat && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Chat History?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all messages in this conversation from your view.
              Other participants will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setChatToClear(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearChatHistory}
            >
              Clear History
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to leave this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be removed from this conversation and will no longer receive messages. 
              If you are the last person in the chat, the entire conversation will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setChatToLeave(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleLeaveChat}
              disabled={isLeavingChat}
            >
              {isLeavingChat && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
