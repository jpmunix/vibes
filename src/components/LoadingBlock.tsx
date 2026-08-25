import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ipc } from "@/ipc/types";

const customLink = ({
  node: _node,
  ...props
}: {
  node?: any;
  [key: string]: any;
}) => (
  <a
    {...props}
    onClick={(e) => {
      const url = props.href;
      if (url) {
        e.preventDefault();
        ipc.system.openExternalUrl(url);
      }
    }}
  />
);

export const VanillaMarkdownParser = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      components={{
        a: customLink,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

// Chat loader with human-like typing/deleting of rotating messages
function ChatLoader() {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(100);

  const loadingTexts = [
    "Preparing your conversation... 🗨️",
    "Gathering thoughts... 💭",
    "Crafting the perfect response... 🎨",
    "Almost there... 🚀",
    "Just a moment... ⏳",
    "Warming up the neural networks... 🧠",
    "Connecting the dots... 🔗",
    "Brewing some digital magic... ✨",
    "Assembling words with care... 🔤",
    "Fine-tuning the response... 🎯",
    "Diving into deep thought... 🤿",
    "Weaving ideas together... 🕸️",
    "Sparking up the conversation... ⚡",
    "Polishing the perfect reply... 💎",
  ];

  useEffect(() => {
    const currentText = loadingTexts[currentTextIndex];
    const timer = window.setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentText.length) {
          setDisplayText(currentText.substring(0, displayText.length + 1));
          const randomSpeed = Math.random() * 50 + 30;
          const isLongPause = Math.random() > 0.85;
          setTypingSpeed(isLongPause ? 300 : randomSpeed);
        } else {
          setTypingSpeed(1500);
          setIsDeleting(true);
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(currentText.substring(0, displayText.length - 1));
          setTypingSpeed(30);
        } else {
          setIsDeleting(false);
          setCurrentTextIndex((prev) => (prev + 1) % loadingTexts.length);
          setTypingSpeed(500);
        }
      }
    }, typingSpeed);
    return () => window.clearTimeout(timer);
  }, [displayText, isDeleting, currentTextIndex, typingSpeed]);

  const renderFadingText = () => {
    return displayText.split("").map((char, index) => {
      const opacity = Math.min(
        0.8 + (index / (displayText.length || 1)) * 0.2,
        1,
      );
      return (
        <span
          key={index}
          style={{ opacity }}
        >
          {char}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block">
          <p className="text-sm text-muted-foreground font-medium">
            {renderFadingText()}
            <span className="ml-1 inline-block w-2 h-4 bg-muted-foreground/60" />
          </p>
        </div>
      </div>
    </div>
  );
}

interface LoadingBlockProps {
  isStreaming?: boolean;
}

// Instead of showing raw thinking content, render the chat loader while streaming.
export function LoadingBlock({ isStreaming = false }: LoadingBlockProps) {
  if (!isStreaming) return null;
  return <ChatLoader />;
}
