
"use client";

import { useState, useEffect } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { Copy, LogOut, MessageSquarePlus, Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { firestore, auth } from "@/lib/firebase";
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
  email: string | null;
  photoURL: string | null;
}

interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  timestamp: Timestamp;
}

export interface ChatWithParticipants extends Chat {
  participants: UserData[];
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex w-full h-full">
            <aside className="h-full flex-col border-r hidden md:flex w-80 lg:w-96 p-2">
                <div className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
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

  return <MainLayout user={user} />;
}


function MainLayout({ user }: { user: User }) {
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
    const q = query(
      collection(firestore, "chats"), 
      where("participantUids", "array-contains", user.uid),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      setIsLoading(true);
      const chatsData: ChatWithParticipants[] = await Promise.all(
        querySnapshot.docs.map(async (docSnapshot) => {
          const chatData = docSnapshot.data() as Omit<Chat, 'id'> & { participantUids: string[] };
          const participantPromises = chatData.participantUids.map(uid => getDoc(doc(firestore, "users", uid)));
          const participantDocs = await Promise.all(participantPromises);
          const participants = participantDocs.filter(pDoc => pDoc.exists()).map(pDoc => pDoc.data() as UserData);
          
          return {
            id: docSnapshot.id,
            ...chatData,
            participants,
          };
        })
      );
      setChats(chatsData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleSignOut = async () => {
    await auth.signOut();
    router.push("/login");
  };

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(user.uid);
    toast({
      title: "User ID Copied!",
      description: "You can now share it with others to start a chat.",
    });
  };

  const handleCreateNewChat = async () => {
    const trimmedId = newChatUserId.trim();
    if (trimmedId === "") return;
    if (trimmedId === user.uid) {
        toast({ variant: "destructive", title: "You cannot start a chat with yourself." });
        return;
    }

    setIsCreatingChat(true);
    try {
        const otherUserRef = doc(firestore, "users", trimmedId);
        const otherUserSnap = await getDoc(otherUserRef);

        if (!otherUserSnap.exists()) {
            toast({ variant: "destructive", title: "User not found." });
            return;
        }

        const chatId = [user.uid, trimmedId].sort().join('_');
        const chatRef = doc(firestore, "chats", chatId);
        const chatSnap = await getDoc(chatRef);

        if (chatSnap.exists()) {
            const existingChat = chats.find(c => c.id === chatId);
            if(existingChat) setSelectedChat(existingChat);
        } else {
            await setDoc(chatRef, {
                participantUids: [user.uid, trimmedId],
                timestamp: serverTimestamp(),
                lastMessage: "Chat created"
            });
            // No need to set selected chat here, the onSnapshot listener will pick it up
        }
        
        setIsNewChatDialogOpen(false);
        setNewChatUserId("");

    } catch (error) {
        console.error("Error creating chat:", error);
        toast({ variant: "destructive", title: "Failed to create chat." });
    } finally {
        setIsCreatingChat(false);
    }
  };
  
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
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <Button variant="destructive" size="icon" onClick={handleSignOut} aria-label="Sign out">
                <LogOut className="h-5 w-5" />
            </Button>
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
            const otherParticipant = chat.participants.find(p => p.uid !== user.uid);
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
                            {chat.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </button>
            )
        })}
      </nav>
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
