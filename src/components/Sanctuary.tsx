import { useState, useRef, useEffect, lazy, Suspense, useCallback } from "react";
import { useStore, type Message, type Attachment } from "../store";
import { unlockAudioForPlayback, stopSpeaking } from "../core/voice";
import { enterAndroidImmersive } from "../core/immersive";
import { parseJournalMarkdown, type ParsedJournalMessage } from "../core/journal";
import { isScreenShareSupported } from "../core/screen";
import Markdown from "react-markdown";

const PdfViewer = lazy(() => import("./PdfViewer"));
const CameraCapture = lazy(() => import("./CameraCapture"));
const ScreenWatch = lazy(() => import("./ScreenWatch"));

/** Prompt that rides along with each screen frame sent to Game Buddy. */
const SCREEN_WATCH_PROMPT = "Here's my screen right now — react to what's happening. 🎮";

type PersonaKind = "you" | "dino" | "game";

function personaLabel(persona: PersonaKind): string {
  return persona === "game" ? "Game Buddy" : persona === "dino" ? "Dino Buddy" : "You";
}

const ACCEPTED_TYPES =
  "image/*,.pdf,.txt,.md,.csv,.json,.xml,.html,.log,.py,.js,.ts,.jsx,.tsx,.c,.cpp,.java,.rs,.go";

const SUGGESTIONS_DEFAULT = [
  "I need to talk through something",
  "Help me unpack a feeling",
  "I'm not sure where to start",
];

const SUGGESTIONS_DINO = [
  "What's on your mind?",
  "Tell me about your day",
  "I just need to vent",
];

const SUGGESTIONS_GAME = [
  "What do you think of this game?",
  "Give me a quick tip",
  "Hype me up",
];

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

function exportConversation(messages: Message[], userName: string, persona: PersonaKind) {
  const isDino = persona === "dino";
  const isGame = persona === "game";
  const title = isGame
    ? "# Game Buddy — Session Log 🎮"
    : isDino
      ? "# Dino Buddy — Conversation Journal 🦖"
      : "# You — Conversation Journal";
  const assistantWho = isGame ? "Game Buddy" : isDino ? "Dino Buddy" : "You (AI)";
  const closing = isGame
    ? "*🎮 GG. Catch you next session.*"
    : isDino
      ? "*🦖 Thanks for hanging out, bro.*"
      : "*Whatever you carry, you can set it down here.*";

  const lines: string[] = [
    title,
    `*Exported ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}*`,
    "",
    "---",
    "",
  ];

  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const who = msg.role === "user" ? (userName || "You") : assistantWho;
    lines.push(`**${who}** — *${time}*`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push(closing);

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
  const regenerateLast = useStore((s) => s.regenerateLast);
  const stopStreaming = useStore((s) => s.stopStreaming);
  const clearConversation = useStore((s) => s.clearConversation);
  const importConversation = useStore((s) => s.importConversation);
  const setView = useStore((s) => s.setView);
  const setVoiceMode = useStore((s) => s.setVoiceMode);
  const userName = useStore((s) => s.userName);
  const dinoBuddyMode = useStore((s) => s.dinoBuddyMode);
  const gameBuddyMode = useStore((s) => s.gameBuddyMode);
  const speakReplies = useStore((s) => s.speakReplies);
  const setSpeakReplies = useStore((s) => s.setSpeakReplies);
  const persona: PersonaKind = gameBuddyMode ? "game" : dinoBuddyMode ? "dino" : "you";
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [watching, setWatching] = useState(false);
  const [entered, setEntered] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [importNote, setImportNote] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const journalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useStore.setState({ hasSeenLanding: true });
    const t = setTimeout(() => setEntered(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Only follow the conversation down when the reader is already at the edge,
  // so scrolling up to re-read is never yanked away mid-stream.
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, atBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < 90);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setAtBottom(true);
  }, []);

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

  const handleScreenFrame = useCallback(
    (dataUrl: string) => {
      void sendMessage(SCREEN_WATCH_PROMPT, dataUrl);
    },
    [sendMessage]
  );

  const toggleSpeakReplies = () => {
    if (speakReplies) {
      setSpeakReplies(false);
      stopSpeaking();
    } else {
      // Enabling is a user gesture — unlock audio so replies can autoplay.
      void unlockAudioForPlayback();
      setSpeakReplies(true);
    }
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

  const handleImportJournal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    e.target.value = "";

    try {
      let parsed: ParsedJournalMessage[] = [];
      for (const file of fileList) {
        const text = await readFileAsText(file);
        parsed = parsed.concat(parseJournalMarkdown(text, file.lastModified || Date.now()));
      }

      if (parsed.length === 0) {
        setImportNote("Couldn't find any messages in that file.");
      } else {
        const { added, skipped } = await importConversation(parsed);
        if (added > 0) {
          setImportNote(
            `Welcomed back ${added} message${added === 1 ? "" : "s"}` +
              (skipped ? ` · ${skipped} already remembered` : "")
          );
        } else {
          setImportNote("Already remembered everything in that journal.");
        }
      }
    } catch {
      setImportNote("Couldn't read that journal file.");
    }

    setTimeout(() => setImportNote(null), 4200);
  };

  return (
    <div className={`h-full w-full flex flex-col ${entered ? "opacity-100" : "opacity-0"} transition-opacity duration-700`}>
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
      {watching && (
        <Suspense fallback={null}>
          <ScreenWatch
            onReact={handleScreenFrame}
            onStop={() => setWatching(false)}
            isStreaming={isStreaming}
          />
        </Suspense>
      )}
      <header className="chat-header safe-top safe-x relative flex items-center justify-center px-6 py-3.5 min-h-[3.25rem] shrink-0">
        <h2 className="font-display text-[1.0625rem] text-warm-50 tracking-wide pointer-events-none select-none">
          {persona === "game" ? (
            <span>Game Buddy <span className="opacity-90">🎮</span></span>
          ) : persona === "dino" ? (
            <span>Dino <span className="opacity-90">🦖</span></span>
          ) : (
            "You"
          )}
        </h2>
        <div className="absolute right-4 safe-x flex items-center gap-1">
          {messages.length > 0 && (
            <>
              <button onClick={() => exportConversation(messages, userName, persona)} className="icon-btn" title="Export journal">
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
          <button onClick={() => journalInputRef.current?.click()} className="icon-btn" title="Import a saved journal — restores memory">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button onClick={() => setView("settings")} className="icon-btn" title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      <input
        ref={journalInputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        multiple
        onChange={handleImportJournal}
        className="hidden"
      />

      {importNote && (
        <div className="import-note" role="status" aria-live="polite">
          {importNote}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-6 chat-scroll-fade chat-messages"
      >
        <div className="max-w-3xl mx-auto py-6 md:py-10 space-y-8 md:space-y-10">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[38vh] gap-6 px-2">
              <div className="text-center space-y-3">
                <p className="font-display text-[2rem] md:text-[2.25rem] text-warm-50 leading-tight">
                  {persona === "game"
                    ? userName
                      ? `Ready when you are, ${userName} 🎮`
                      : "Ready to play? 🎮"
                    : persona === "dino"
                      ? userName
                        ? `Hey ${userName}! 🦖`
                        : "Hey! 🦖"
                      : userName
                        ? `Welcome back, ${userName}`
                        : "Hello"}
                </p>
                <p className="font-body text-[0.9375rem] text-secondary max-w-md mx-auto leading-relaxed">
                  {persona === "game"
                    ? "Fire up a game and let me watch — I'll react as you play. Tap the screen icon below to share."
                    : persona === "dino"
                      ? "Good to see you. Say anything — or just hang out. I'm right here."
                      : "Whatever you carry, you can set it down here. Say anything — or nothing at all."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {(persona === "game" ? SUGGESTIONS_GAME : persona === "dino" ? SUGGESTIONS_DINO : SUGGESTIONS_DEFAULT).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setInput(s);
                      textareaRef.current?.focus();
                    }}
                    className="suggestion-chip"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => journalInputRef.current?.click()}
                className="restore-link"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Restore a saved journal</span>
              </button>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLastAssistant={msg.role === "assistant" && idx === messages.length - 1}
              isStreaming={isStreaming}
              onRegenerate={regenerateLast}
            />
          ))}

          {isStreaming && streamingContent && (
            <div className="message-appear">
              <div className="msg-assistant-block max-w-none">
                <p className="msg-label">{personaLabel(persona)}</p>
                <div className="prose-you font-body">
                  <Markdown>{streamingContent}</Markdown>
                  <span className="inline-block w-0.5 h-[1.1em] bg-warm-400/50 animate-blink ml-0.5 align-middle rounded-full" />
                </div>
              </div>
            </div>
          )}

          {isStreaming && !streamingContent && (
            <div className="flex items-center gap-2.5 py-1">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-warm-400/35 animate-breathe" />
                <span className="w-1.5 h-1.5 rounded-full bg-warm-400/35 animate-breathe" style={{ animationDelay: "0.3s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-warm-400/35 animate-breathe" style={{ animationDelay: "0.6s" }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="chat-dock-fixed safe-x pt-2">
        {(isStreaming || (!atBottom && messages.length > 0)) && (
          <div className="flex justify-center items-center gap-2 mb-2.5 px-4">
            {!atBottom && messages.length > 0 && (
              <button onClick={scrollToBottom} className="scroll-bottom-btn" title="Jump to latest">
                <span>Latest</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </button>
            )}
            {isStreaming && (
              <button onClick={stopStreaming} className="stop-btn" title="Stop generating">
                <span className="stop-glyph" />
                <span>Stop</span>
              </button>
            )}
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="px-4 md:px-6 mb-2">
            <div className="max-w-3xl mx-auto">
              <div className="flex flex-wrap gap-2 ml-1">
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

        <div className="px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="chat-input-wrap relative flex flex-col gap-2 px-3 py-3 md:px-4">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={persona === "game" ? "Talk to Game Buddy…" : persona === "dino" ? "What's on your mind?" : "Message You…"}
              rows={1}
              className="w-full bg-transparent text-primary placeholder:text-muted font-body text-base resize-none outline-none leading-relaxed max-h-40 px-1"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-0.5">
                <button onClick={() => fileInputRef.current?.click()} className="icon-btn" title="Attach file">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                <button onClick={() => setShowCamera(true)} className="icon-btn" title="Camera">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </button>

                {isScreenShareSupported() && (
                  <button
                    onClick={() => setWatching((w) => !w)}
                    className={`icon-btn ${watching ? "is-watching" : ""}`}
                    title={watching ? "Stop watching screen" : "Watch my screen"}
                    aria-pressed={watching}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </button>
                )}

                <button
                  onClick={toggleSpeakReplies}
                  className={`icon-btn ${speakReplies ? "is-watching" : ""}`}
                  title={speakReplies ? "Mute spoken replies" : "Speak replies aloud"}
                  aria-pressed={speakReplies}
                >
                  {speakReplies ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => {
                    unlockAudioForPlayback();
                    void enterAndroidImmersive();
                    setVoiceMode(true);
                  }}
                  className="icon-btn"
                  title="Voice mode"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </button>
              </div>

              <button
                onClick={handleSend}
                disabled={(!input.trim() && pendingAttachments.length === 0) || isStreaming}
                className={`send-btn ${(input.trim() || pendingAttachments.length > 0) && !isStreaming ? "is-ready" : ""}`}
                title="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>

            <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={handleFileSelect} />
          </div>
          <p className="text-center text-secondary text-[0.6875rem] mt-2.5 mb-1 font-body leading-relaxed opacity-80">
            {persona === "game" ? (
              <>
                Frames are read by a vision model and stay on your device until sent.
                <br />
                <span className="text-muted">
                  Screen-watch needs Desktop Mode — it can&apos;t see a fullscreen game in Steam Game Mode. 🎮
                </span>
              </>
            ) : persona === "dino" ? (
              <>
                Just you and Dino. Stays on your device until you send.
                <br />
                <span className="text-muted">
                  Sometimes a dino gets too excited — tiny arms flailing, a word might trip. It happens. 🦖
                </span>
              </>
            ) : (
              <>
                Everything shared here stays between you and this space.
                <br />
                <span className="text-muted">Responses can miss the mark — trust your own judgment.</span>
              </>
            )}
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function MessageBubble({
  message,
  isLastAssistant,
  isStreaming,
  onRegenerate,
}: {
  message: Message;
  isLastAssistant: boolean;
  isStreaming: boolean;
  onRegenerate: () => void;
}) {
  const isUser = message.role === "user";
  const dinoBuddyMode = useStore((s) => s.dinoBuddyMode);
  const gameBuddyMode = useStore((s) => s.gameBuddyMode);
  const assistantLabel = gameBuddyMode ? "Game Buddy" : dinoBuddyMode ? "Dino Buddy" : "You";

  if (isUser) {
    return (
      <div className="message-appear group flex flex-col items-end">
        <div className="flex flex-col items-end max-w-[85%] md:max-w-[72%]">
          <div className="msg-user-bubble font-body text-[0.9375rem] leading-relaxed">
            {message.image && (
              <img src={message.image} alt="" className="max-w-[240px] rounded-xl mb-2 border border-warm-400/5" />
            )}
            {message.attachments
              ?.filter((att) => att.type !== "image" || att.data !== message.image)
              .map((att, i) => (
                <AttachmentBlock key={i} attachment={att} />
              ))}
            <p className="whitespace-pre-wrap selectable">{message.content}</p>
          </div>
          <time className="msg-time mt-1 mr-1">{formatTime(message.timestamp)}</time>
        </div>
      </div>
    );
  }

  return (
    <div className="message-appear group">
      <div className="msg-assistant-block max-w-none">
        <div className="flex items-center gap-2.5 mb-1.5">
          <p className="msg-label" style={{ marginBottom: 0 }}>{assistantLabel}</p>
          <time className="msg-time">{formatTime(message.timestamp)}</time>
        </div>
        {message.image && (
          <img src={message.image} alt="" className="max-w-[280px] rounded-xl mb-3 border border-warm-400/5" />
        )}
        {message.attachments
          ?.filter((att) => att.type !== "image" || att.data !== message.image)
          .map((att, i) => (
            <AttachmentBlock key={i} attachment={att} />
          ))}
        {message.content && (
          <div className="prose-you">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {message.content && (
          <div className="flex items-center gap-4 mt-2.5">
            <CopyButton text={message.content} />
            {isLastAssistant && !isStreaming && (
              <button onClick={onRegenerate} className="msg-action" title="Try another reply">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
                Regenerate
              </button>
            )}
          </div>
        )}
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
    <button onClick={handleCopy} className="msg-action" title={copied ? "Copied" : "Copy"}>
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
