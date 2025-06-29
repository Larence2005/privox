
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
import { Copy, LogOut, MessageSquarePlus, Loader2, Users, Settings } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import ChatInterface from "@/components/chat-interface";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeSwitcher } from "@/components/theme-switcher";

interface UserData {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

interface Chat {
  id: string;
  participants: Record<string, boolean>;
  lastMessage?: string;
  timestamp: number;
}

export interface ChatWithParticipants extends Chat {
  participantsData: UserData[];
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

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const processChatData = useCallback(async (chatId: string, chatData: any): Promise<ChatWithParticipants | null> => {
      if (!user || !chatData || !chatData.participants) return null;

      const participantUids = Object.keys(chatData.participants);
      if (!participantUids.includes(user.uid)) return null;

      const participantPromises = participantUids.map(uid => get(ref(database, `users/${uid}`)));
      const participantSnaps = await Promise.all(participantPromises);
      const participantsData = participantSnaps
          .filter(pSnap => pSnap.exists())
          .map(pSnap => pSnap.val() as UserData);

      return {
          id: chatId,
          ...chatData,
          participantsData,
      };
  }, [user]);

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

                  const newChatData = await processChatData(chatId, chatSnap.val());

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

  const handleCreateNewChat = async () => {
    if(!user) return;
    const trimmedId = newChatUserId.trim();
    if (!trimmedId) return;

    if (trimmedId === user.uid) {
        toast({ variant: "destructive", title: "Error", description: "You cannot start a chat with yourself." });
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

        const newChatRef = push(ref(database, 'chats'));
        const newChatId = newChatRef.key;
        if (!newChatId) throw new Error("Could not generate new chat ID");
        
        const participants = { [user.uid]: true, [trimmedId]: true };
        const chatData = {
            participants,
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
            description: error.message || "An unexpected error occurred. Please check your security rules."
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
        {!isLoading && chats.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">No chats yet. Start a new one!</div>
        )}
        {chats.map(chat => {
            const otherParticipant = chat.participantsData.find(p => p.uid !== user.uid);
            if (!otherParticipant) return null;
            return (
                <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className={cn(
                        "flex items-center gap-3 p-2 rounded-md w-full text-left transition-colors",
                        selectedChat?.id === chat.id ? "bg-primary/10 text-primary-foreground" : "hover:bg-muted"
                    )}
                >
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={otherParticipant.photoURL ?? undefined} alt={otherParticipant.displayName ?? "User"} />
                        <AvatarFallback>{otherParticipant.displayName?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                        <p className="font-semibold truncate">{otherParticipant.displayName}</p>
                        <p className="text-sm text-muted-foreground truncate">{chat.lastMessage}</p>
                    </div>
                    {chat.timestamp && (
                         <div className="text-xs text-muted-foreground self-start">
                            {new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </button>
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
    </div>
  );
}
