"use client";

import { useState, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { LogOut, Send } from "lucide-react";
import { useRouter } from "next/navigation";

import { firestore, auth } from "@/lib/firebase";
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
  timestamp: Timestamp;
}

export default function ChatInterface({ user }: { user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const q = query(collection(firestore, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const msgs: ChatMessage[] = [];
      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        // Fallback for messages that might be added before timestamp is set
        if (!data.timestamp) continue;
        const decryptedText = await decryptMessage(data.encryptedText, data.iv);
        msgs.push({
          id: doc.id,
          uid: data.uid,
          displayName: data.displayName,
          photoURL: data.photoURL,
          iv: data.iv,
          encryptedText: data.encryptedText,
          decryptedText,
          timestamp: data.timestamp,
        });
      }
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await auth.signOut();
    router.push("/login");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === "") return;

    const currentMessage = newMessage;
    setNewMessage("");

    const { iv, encrypted } = await encryptMessage(currentMessage);

    await addDoc(collection(firestore, "messages"), {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      encryptedText: encrypted,
      iv: iv,
      timestamp: serverTimestamp(),
    });

  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? "User"} />
            <AvatarFallback>{user.displayName?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-foreground">{user.displayName}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
          <LogOut className="h-5 w-5 text-muted-foreground" />
        </Button>
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
