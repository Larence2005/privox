import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Timestamp } from "firebase/firestore";

interface ChatMessage {
    id: string;
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    decryptedText: string;
    timestamp: Timestamp;
}

interface MessageProps {
    message: ChatMessage;
    isCurrentUser: boolean;
}

export default function Message({ message, isCurrentUser }: MessageProps) {
  const { displayName, photoURL, decryptedText, timestamp } = message;

  const messageDate = timestamp ? timestamp.toDate() : new Date();
  const timeString = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn("flex items-end gap-3", isCurrentUser && "justify-end")}>
      {!isCurrentUser && (
        <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={photoURL ?? undefined} alt={displayName ?? "User"} />
            <AvatarFallback>{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      <div className={cn(
          "max-w-xs md:max-w-md lg:max-w-lg rounded-lg p-3 flex flex-col shadow-sm",
          isCurrentUser ? "bg-primary text-primary-foreground rounded-br-none" : "bg-card border rounded-bl-none"
      )}>
        {!isCurrentUser && (
            <p className="text-xs font-semibold text-primary mb-1">{displayName}</p>
        )}
        <p className="text-base break-words whitespace-pre-wrap">{decryptedText}</p>
        <p className={cn("text-xs opacity-70 mt-1", isCurrentUser ? "text-right" : "text-left")}>
            {timeString}
        </p>
      </div>
      {isCurrentUser && (
        <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={photoURL ?? undefined} alt={displayName ?? "User"} />
            <AvatarFallback>{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
