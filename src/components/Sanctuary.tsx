import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useStore, type Message, type Attachment } from "../store";

const PdfViewer = lazy(() => import("./PdfViewer"));

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

export default function Sanctuary() {
  const messages = useStore((s) => s.messages);
  const isStreaming = useStore((s) => s.isStreaming);
  const sendMessage = useStore((s) => s.sendMessage);
  const setView = useStore((s) => s.setView);
  const setVoiceMode = useStore((s) => s.setVoiceMode);
  const elevenlabsApiKey = useStore((s) => s.elevenlabsApiKey);
  const userName = useStore((s) => s.userName);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [entered, setEntered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || isStreaming) return;
    const atts = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const firstImage = atts?.find((a) => a.type === "image")?.data;
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

    await sendMessage(content, firstImage, atts);
  };

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
        newAttachments.push({
          name: file.name,
          type: "file",
          data: text,
          mimeType: file.type || "text/plain",
        });
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        newAttachments.push({
          name: file.name,
          type,
          data: dataUrl,
          mimeType: file.type,
        });
      }
    }

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className={`h-full w-full flex flex-col transition-all duration-700 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
    >
      <header className="flex items-center justify-between px-6 py-4 border-b border-warm-400/5">
        <h2 className="font-display text-lg text-warm-50/80 tracking-wide">
          You
        </h2>
        <button
          onClick={() => setView("settings")}
          className="icon-btn"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-0">
        <div className="max-w-2xl mx-auto py-8 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[40vh] gap-4">
              <p className="font-display text-3xl text-warm-50/30">
                {userName ? `Welcome back, ${userName}` : "Hello"}
              </p>
              <p className="font-body text-sm text-muted/60 max-w-sm text-center leading-relaxed">
                Whatever you carry, you can set it down here. Say anything — or
                nothing at all.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isStreaming && (
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

      {/* pending attachments */}
      {pendingAttachments.length > 0 && (
        <div className="px-4 md:px-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap gap-2 ml-1 mb-2">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.type === "image" ? (
                    <img
                      src={att.data}
                      alt={att.name}
                      className="h-16 w-16 object-cover rounded-lg border border-warm-400/10"
                    />
                  ) : (
                    <div
                      className="h-16 px-3 flex items-center gap-2 rounded-lg border border-warm-400/10"
                      style={{ background: "rgb(var(--c-surface) / 0.6)" }}
                    >
                      <FileTypeIcon type={att.type} />
                      <span
                        className="font-body text-xs max-w-[100px] truncate"
                        style={{ color: "rgb(var(--c-text) / 0.7)" }}
                      >
                        {att.name}
                      </span>
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

      {/* input */}
      <div className="px-4 md:px-0 pb-6 pt-2">
        <div className="max-w-2xl mx-auto">
          <div className="chat-input-wrap relative flex items-end gap-2 backdrop-blur-sm rounded-2xl px-4 py-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="icon-btn"
              title="Attach file"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Speak freely..."
              rows={1}
              className="flex-1 bg-transparent text-warm-50/90 placeholder-muted/40 font-body text-base resize-none outline-none leading-relaxed max-h-40"
            />

            {elevenlabsApiKey && (
              <button
                onClick={() => setVoiceMode(true)}
                className="icon-btn"
                title="Voice mode"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </button>
            )}

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
          <p className="text-center text-muted/30 text-xs mt-3 font-body">
            Everything shared here stays between you and this space.
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
      <div
        className={`max-w-[85%] md:max-w-[75%] px-5 py-3.5 rounded-2xl font-body text-base leading-relaxed ${
          isUser
            ? "bg-warm-400/10 text-warm-50/90 rounded-br-sm"
            : "bg-surface/60 text-warm-50/80 rounded-bl-sm border border-warm-400/5"
        }`}
      >
        {message.image && (
          <img
            src={message.image}
            alt=""
            className="max-w-[240px] rounded-xl mb-2 border border-warm-400/5"
          />
        )}

        {message.attachments?.map((att, i) => (
          <AttachmentBlock key={i} attachment={att} />
        ))}

        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

function AttachmentBlock({ attachment }: { attachment: Attachment }) {
  if (attachment.type === "image") {
    return (
      <img
        src={attachment.data}
        alt={attachment.name}
        className="max-w-[240px] rounded-xl mb-2 border border-warm-400/5"
      />
    );
  }

  if (attachment.type === "pdf") {
    return (
      <Suspense
        fallback={
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
            style={{ background: "rgb(var(--c-surface) / 0.5)" }}
          >
            <FileTypeIcon type="pdf" />
            <span className="font-body text-xs" style={{ color: "rgb(var(--c-muted))" }}>
              Loading {attachment.name}...
            </span>
          </div>
        }
      >
        <PdfViewer data={attachment.data} name={attachment.name} />
      </Suspense>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2 border border-warm-400/5"
      style={{ background: "rgb(var(--c-surface) / 0.5)" }}
    >
      <FileTypeIcon type="file" />
      <span className="font-body text-xs" style={{ color: "rgb(var(--c-text) / 0.7)" }}>
        {attachment.name}
      </span>
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
