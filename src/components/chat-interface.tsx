
"use client";

import { useState, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import {
  ref,
  query,
  orderByChild,
  onValue,
  push,
  serverTimestamp,
  update,
  off,
} from "firebase/database";
import { Send, ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import type { ChatWithParticipants } from "@/app/page";
import { database } from "@/lib/firebase";
import { 
    getStoredPrivateKey,
    unwrapChatKey,
    encryptMessage, 
    decryptMessage,
} from "@/lib/crypto";
import Message from "./message";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface ChatMessage {
  id: string;
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  iv: string;
  encryptedText: string;
  decryptedText: string;
  timestamp: number;
}

export default function ChatInterface({ 
  user, 
  chat, 
  onBack,
}: { 
  user: User, 
  chat: ChatWithParticipants,
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatKey, setChatKey] = useState<CryptoKey | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const otherParticipant = chat.participantsData.find(p => p.uid !== user.uid);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const deriveKey = async () => {
        setChatKey(null);
        setKeyError(null);

        if (!chat.keys || !chat.keys[user.uid]) {
            console.error("Chat object is missing encryption keys for the current user.");
            setKeyError("This chat is missing its encryption key. It may be a very old or corrupted chat.");
            return;
        }
        try {
            const privateKey = await getStoredPrivateKey(user.uid);
            if (!privateKey) {
                setKeyError("Your private key is not found on this device. You cannot decrypt messages. Try signing in on your original device, or clear the chat and start a new one.");
                return;
            }
            
            const wrappedKeyB64 = chat.keys[user.uid];
            const importedChatKey = await unwrapChatKey(wrappedKeyB64, privateKey);
            setChatKey(importedChatKey);
        } catch (error) {
            console.error("Failed to derive chat key:", error);
            setKeyError("A critical error occurred while decrypting the chat key. Your local key may be corrupted or a new chat may be required.");
        }
    };
    deriveKey();
    return () => {
        setChatKey(null);
        setKeyError(null);
    };
  }, [chat, user.uid]);

  useEffect(() => {
    if (!chat.id || !chatKey) return;

    const messagesRef = ref(database, `messages/${chat.id}`);
    const q = query(messagesRef, orderByChild("timestamp"));
    
    const listener = onValue(q, async (snapshot) => {
      if (!snapshot.exists()) {
        setMessages([]);
        return;
      }
      
      const messagesData = snapshot.val();
      const messagePromises = Object.keys(messagesData).map(async (key) => {
        const data = messagesData[key];
        try {
          const decryptedText = await decryptMessage(data.encryptedText, data.iv, chatKey);
          return {
            id: key,
            ...data,
            decryptedText,
          } as ChatMessage;
        } catch (error) {
          console.error("Failed to decrypt a message:", error);
          return {
            id: key,
            ...data,
            decryptedText: "Could not decrypt message.",
          } as ChatMessage;
        }
      });
      
      const resolvedMessages = (await Promise.all(messagePromises)).filter(m => m !== null) as ChatMessage[];
      resolvedMessages.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(resolvedMessages);
    });

    return () => off(messagesRef, 'value', listener);
  }, [chat.id, chatKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === "" || !chat.id || !chatKey) return;

    const currentMessage = newMessage;
    setNewMessage("");

    const { iv, encrypted } = await encryptMessage(currentMessage, chatKey);

    const messageData = {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      encryptedText: encrypted,
      iv: iv,
      timestamp: serverTimestamp(),
    };
    
    const newMessageRef = push(ref(database, `messages/${chat.id}`));
    
    const updates: { [key: string]: any } = {};
    updates[`/messages/${chat.id}/${newMessageRef.key}`] = messageData;
    updates[`/chats/${chat.id}/lastMessage`] = currentMessage.length > 40 ? `${currentMessage.substring(0, 40)}...` : currentMessage;
    updates[`/chats/${chat.id}/timestamp`] = serverTimestamp();

    await update(ref(database), updates);
  };
  
  if (!otherParticipant) {
    return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground p-4">
            <p>Loading participant...</p>
        </div>
    );
  }
  
  if (!chatKey && !keyError) {
    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex items-center gap-3 p-2.5 border-b shrink-0 md:p-4">
                 <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
                    <ArrowLeft className="h-5 w-5" />
                    <span className="sr-only">Back to chats</span>
                </Button>
                <Avatar>
                    <AvatarImage src={otherParticipant.photoURL ?? undefined} alt={otherParticipant.displayName ?? "User"} />
                    <AvatarFallback>{otherParticipant.displayName?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                    <p className="font-semibold text-foreground">{otherParticipant.displayName}</p>
                </div>
            </header>
            <main className="flex flex-col flex-1 items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="font-medium">Establishing secure channel...</p>
                <p className="text-sm">Retrieving your private key and unwrapping chat key.</p>
            </main>
        </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-3 p-2.5 border-b shrink-0 md:p-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">Back to chats</span>
        </Button>
        <Avatar>
          <AvatarImage src={otherParticipant.photoURL ?? undefined} alt={otherParticipant.displayName ?? "User"} />
          <AvatarFallback>{otherParticipant.displayName?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-foreground">{otherParticipant.displayName}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {keyError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive p-4 my-4">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="h-6 w-6 shrink-0"/>
                    <div>
                        <h4 className="font-semibold">Encryption Key Error</h4>
                        <p className="text-sm">{keyError}</p>
                    </div>
                </div>
            </div>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} isCurrentUser={msg.uid === user.uid} />
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 border-t shrink-0 bg-background/80 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your encrypted message..."
            className="flex-1 resize-none h-10"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={!!keyError}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim() || !!keyError} aria-label="Send Message">
            <Send />
          </Button>
        </form>
      </footer>
    </div>
  );
}
