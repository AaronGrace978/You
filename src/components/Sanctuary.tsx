import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import { useStore, type Message, type Attachment } from "../store";
import { unlockAudioForPlayback } from "../core/voice";
import { enterAndroidImmersive } from "../core/immersive";
import Markdown from "react-markdown";

const PdfViewer = lazy(() => import("./PdfViewer"));
const CameraCapture = lazy(() => import("./CameraCapture"));

const ACCEPTED_TYPES =
  "image/*,.pdf,.txt,.md,.csv,.json,.xml,.html,.log,.py,.js,.ts,.jsx,.tsx,.c,.cpp,.java,.rs,.go";

function classifyFile(file: File): Attachment["type"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "file";
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.readAsDataURL(file);
  });
}

function exportConversation(messages: Message[], userName: string, dinoBuddyMode: boolean) {
  const lines: string[] = [
    dinoBuddyMode ? "# Dino Buddy — Conversation Journal 🦖" : "# You — Conversation Journal",
    `*Exported ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}*`,
    "",
    "---",
    "",
  ];

  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const who = msg.role === "user" ? (userName || "You") : dinoBuddyMode ? "Dino Buddy" : "You (AI)";
    lines.push(`**${who}** — *${time}*`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push(dinoBuddyMode ? "*🦖 Thanks for hanging out, bro.*" : "*Whatever you carry, you can set it down here.*");

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `you-journal-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Sanctuary() {
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const streamingContent = useStore((s) => s.streamingContent);
  const sendMessage = useStore((s) => s.sendMessage);
  const clearConversation = useStore((s) => s.clearConversation);
  const setView = useStore((s) => s.setView);
  const setVoiceMode = useStore((s) => s.setVoiceMode);
  const userName = useStore((s) => s.userName);
  const dinoBuddyMode = useStore((s) => s.dinoBuddyMode);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [entered, setEntered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useStore.setState({ hasSeenLanding: true });
    const t = setTimeout(() => setEntered(true), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || isStreaming) return;
    const atts = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const firstImage = atts?.find((a) => a.type === "image")?.data;
    // Images use message.image for display + vision; keep attachments for pdf/file only
    const storeAttachments = atts?.filter((a) => a.type !== "image");
    setInput("");
    setPendingAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    let content = text;
    if (!content && atts) {
      content = atts.map((a) => `[${a.name}]`).join(" ");
    }
    const textAtts = atts?.filter((a) => a.type === "file");
    if (textAtts && textAtts.length > 0) {
      content += "\n\n" + textAtts.map((a) => `--- ${a.name} ---\n${a.data}`).join("\n\n");
    }

    await sendMessage(
      content,
      firstImage,
      storeAttachments && storeAttachments.length > 0 ? storeAttachments : undefined
    );
  }, [input, pendingAttachments, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      const type = classifyFile(file);
      if (type === "file") {
        const text = await readFileAsText(file);
        newAttachments.push({ name: file.name, type: "file", data: text, mimeType: file.type || "text/plain" });
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        newAttachments.push({ name: file.name, type, data: dataUrl, mimeType: file.type });
      }
    }

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={`h-full w-full flex flex-col transition-all duration-700 ${entered ? "opacity-100" : "opacity-0"}`}>
      {showCamera && (
        <Suspense fallback={null}>
          <CameraCapture
            onCapture={(dataUrl) => {
              setPendingAttachments((prev) => [
                ...prev,
                { name: `photo-${Date.now()}.jpg`, type: "image", data: dataUrl, mimeType: "image/jpeg" },
              ]);
              setShowCamera(false);
            }}
            onClose={() => setShowCamera(false)}
          />
        </Suspense>
      )}
      <header className="safe-top safe-x relative flex items-center justify-center px-6 py-4 border-b border-warm-400/5 min-h-[3.25rem]">
        <h2 className="font-display text-lg text-warm-50 tracking-wide pointer-events-none select-none">
          {dinoBuddyMode ? (
            <span>Dino <span className="opacity-90">🦖</span></span>
          ) : (
            "You"
          )}
        </h2>
        <div className="absolute right-4 safe-x flex items-center gap-1">
          {messages.length > 0 && (
            <>
              <button onClick={() => exportConversation(messages, userName, dinoBuddyMode)} className="icon-btn" title="Export journal">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button onClick={clearConversation} className="icon-btn" title="New conversation">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </>
          )}
          <button onClick={() => setView("settings")} className="icon-btn" title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-0">
        <div className="max-w-2xl mx-auto py-8 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[40vh] gap-4">
              <p className="font-display text-3xl text-warm-50">
                {dinoBuddyMode
                  ? userName
                    ? `Hey ${userName}! 🦖`
                    : "Hey! 🦖"
                  : userName
                    ? `Welcome back, ${userName}`
                    : "Hello"}
              </p>
              <p className="font-body text-sm text-secondary max-w-sm text-center leading-relaxed">
                {dinoBuddyMode
                  ? "Good to see you. Say anything — or just hang out. I'm right here."
                  : "Whatever you carry, you can set it down here. Say anything — or nothing at all."}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isStreaming && streamingContent && (
            <div className="message-appear flex justify-start">
              <div className="max-w-[85%] md:max-w-[75%] px-5 py-3.5 rounded-2xl rounded-bl-sm border border-warm-400/10 bg-surface/80">
                <div className="prose-you font-body text-base leading-relaxed">
                  <Markdown>{streamingContent}</Markdown>
                  <span className="inline-block w-0.5 h-4 bg-warm-400/60 animate-blink ml-0.5 align-middle" />
                </div>
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && (
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-warm-400/40 animate-breathe" />
                <span className="w-1.5 h-1.5 rounded-full bg-warm-400/40 animate-breathe" style={{ animationDelay: "0.3s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-warm-400/40 animate-breathe" style={{ animationDelay: "0.6s" }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {pendingAttachments.length > 0 && (
        <div className="px-4 md:px-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap gap-2 ml-1 mb-2">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.type === "image" ? (
                    <img src={att.data} alt={att.name} className="h-16 w-16 object-cover rounded-lg border border-warm-400/10" />
                  ) : (
                    <div className="h-16 px-3 flex items-center gap-2 rounded-lg border border-warm-400/10" style={{ background: "rgb(var(--c-surface) / 0.6)" }}>
                      <FileTypeIcon type={att.type} />
                      <span className="font-body text-xs max-w-[100px] truncate text-secondary">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-muted hover:text-warm-400 cursor-pointer transition-colors"
                    style={{ background: "rgb(var(--c-deep))", border: "1px solid rgb(var(--c-accent) / 0.2)" }}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 md:px-0 pt-2 safe-bottom chat-dock">
        <div className="max-w-2xl mx-auto">
          <div className="chat-input-wrap relative flex items-end gap-2 backdrop-blur-sm rounded-2xl px-4 py-3">
            <button onClick={() => fileInputRef.current?.click()} className="icon-btn" title="Attach file">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            <button onClick={() => setShowCamera(true)} className="icon-btn" title="Camera">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </button>

            <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={handleFileSelect} />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={dinoBuddyMode ? "What's on your mind?" : "Speak freely..."}
              rows={1}
              className="flex-1 bg-transparent text-primary placeholder:text-muted font-body text-base resize-none outline-none leading-relaxed max-h-40"
            />

            <button
              onClick={() => {
                unlockAudioForPlayback();
                void enterAndroidImmersive();
                setVoiceMode(true);
              }}
              className="icon-btn"
              title="Voice mode"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>

            <button
              onClick={handleSend}
              disabled={(!input.trim() && pendingAttachments.length === 0) || isStreaming}
              className="icon-btn disabled:opacity-20 disabled:cursor-default"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <p className="text-center text-secondary text-xs mt-3 font-body">
            {dinoBuddyMode
              ? "Just you and Dino. Stays on your device until you send."
              : "Everything shared here stays between you and this space."}
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`message-appear flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[85%] md:max-w-[75%]`}>
        <div
          className={`px-5 py-3.5 rounded-2xl font-body text-base leading-relaxed ${
            isUser
              ? "bg-warm-400/10 text-warm-50 rounded-br-sm"
              : "bg-surface/80 text-warm-50 rounded-bl-sm border border-warm-400/10"
          }`}
        >
          {message.image && (
            <img src={message.image} alt="" className="max-w-[240px] rounded-xl mb-2 border border-warm-400/5" />
          )}

          {message.attachments
            ?.filter((att) => att.type !== "image" || att.data !== message.image)
            .map((att, i) => (
            <AttachmentBlock key={i} attachment={att} />
          ))}

          {isUser ? (
            <p className="whitespace-pre-wrap selectable">{message.content}</p>
          ) : (
            <div className="prose-you">
              <Markdown>{message.content}</Markdown>
            </div>
          )}
        </div>

        {!isUser && message.content && <CopyButton text={message.content} />}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (insecure context) — fail quietly
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="mt-1.5 ml-1 flex items-center gap-1 font-body text-[11px] text-secondary hover:text-warm-400 transition-colors cursor-pointer"
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function AttachmentBlock({ attachment }: { attachment: Attachment }) {
  if (attachment.type === "image") {
    return <img src={attachment.data} alt={attachment.name} className="max-w-[240px] rounded-xl mb-2 border border-warm-400/5" />;
  }

  if (attachment.type === "pdf") {
    return (
      <Suspense
        fallback={
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2" style={{ background: "rgb(var(--c-surface) / 0.5)" }}>
            <FileTypeIcon type="pdf" />
            <span className="font-body text-xs" style={{ color: "rgb(var(--c-muted))" }}>Loading {attachment.name}...</span>
          </div>
        }
      >
        <PdfViewer data={attachment.data} name={attachment.name} />
      </Suspense>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2 border border-warm-400/5" style={{ background: "rgb(var(--c-surface) / 0.5)" }}>
      <FileTypeIcon type="file" />
      <span className="font-body text-xs text-secondary">{attachment.name}</span>
    </div>
  );
}

function FileTypeIcon({ type }: { type: Attachment["type"] }) {
  if (type === "pdf") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "rgb(var(--c-accent))", flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "rgb(var(--c-accent))", flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
