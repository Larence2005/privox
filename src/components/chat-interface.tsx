
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
import { Send, ArrowLeft } from "lucide-react";
import type { ChatWithParticipants } from "@/app/page";
import { database } from "@/lib/firebase";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const otherParticipant = chat.participantsData.find(p => p.uid !== user.uid);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!chat.id) return;

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
          const decryptedText = await decryptMessage(data.encryptedText, data.iv);
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
  }, [chat.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === "" || !chat.id) return;

    const currentMessage = newMessage;
    setNewMessage("");

    const { iv, encrypted } = await encryptMessage(currentMessage);

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
            <p>Select a chat to start messaging.</p>
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
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} isCurrentUser={msg.uid === user.uid} />
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 border-t shrink-0 bg-background/80 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex items-start gap-3">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your encrypted message..."
            className="flex-1 resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim()} aria-label="Send Message">
            <Send />
          </Button>
        </form>
      </footer>
    </div>
  );
}
