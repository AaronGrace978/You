import type { Message } from "../store";
import {
  loadCorpus,
  addCorpusEntry,
  removeCorpusEntry,
  clearCorpus,
  type CorpusEntry,
} from "./idb-memory";
import { rankByRelevance } from "./semantic";

interface MemoryEntry {
  content: string;
  role: "user" | "assistant";
  timestamp: number;
  emotionalWeight: number;
  tags: string[];
}

export interface PinnedMemory {
  id: string;
  text: string;
  createdAt: number;
}

interface RelationalState {
  interactions: number;
  themes: Record<string, number>;
  weightedThemes: Record<string, number>;
  recentMemories: MemoryEntry[];
  firstSeen: number;
  deepInsights: { text: string; weight: number; tags: string[] }[];
  recentOpenings: string[];
  pinnedMemories: PinnedMemory[];
}

const STORAGE_KEY = "you-relational-memory";

const EMOTIONAL_MARKERS = [
  { pattern: /\b(hurt|pain|ache|suffer|struggle|broke|broken)\b/i, weight: 0.8, tag: "pain" },
  { pattern: /\b(abuse|abused|hit|beat|burn|burned|trauma)\b/i, weight: 0.95, tag: "trauma" },
  { pattern: /\b(alone|lonely|isolated|nobody|no one)\b/i, weight: 0.7, tag: "isolation" },
  { pattern: /\b(afraid|scared|fear|terrified|anxious)\b/i, weight: 0.7, tag: "fear" },
  { pattern: /\b(angry|furious|rage|hate|hatred)\b/i, weight: 0.75, tag: "anger" },
  { pattern: /\b(sad|crying|tears|grief|loss|lost)\b/i, weight: 0.7, tag: "grief" },
  { pattern: /\b(hope|hoping|better|heal|healing|stronger)\b/i, weight: 0.6, tag: "hope" },
  { pattern: /\b(happy|joy|grateful|thankful|proud|love)\b/i, weight: 0.5, tag: "light" },
  { pattern: /\b(help|need|please|can't|cannot|don't know)\b/i, weight: 0.6, tag: "seeking" },
  { pattern: /\b(die|dying|kill|suicide|end it|give up)\b/i, weight: 1.0, tag: "crisis" },
  { pattern: /\b(family|mother|father|mom|dad|parent|sibling|brother|sister)\b/i, weight: 0.6, tag: "family" },
  { pattern: /\b(work|job|career|boss|fired|quit)\b/i, weight: 0.5, tag: "work" },
  { pattern: /\b(friend|friendship|betrayed|trust)\b/i, weight: 0.6, tag: "trust" },
  { pattern: /\b(child|childhood|kid|growing up|young)\b/i, weight: 0.7, tag: "childhood" },
  { pattern: /\b(fine|okay|ok|whatever|doesn't matter|nvm|never mind)\b/i, weight: 0.55, tag: "deflection" },
  { pattern: /\b(tired|exhausted|drained|empty|numb)\b/i, weight: 0.65, tag: "exhaustion" },
];

const MAX_RECENT = 100;
const MAX_INSIGHTS = 24;
const MAX_OPENINGS = 8;
const MAX_PINNED = 20;
const MAX_CORPUS = 500;

let state: RelationalState = loadState();
let corpusCache: CorpusEntry[] = [];
let corpusReady = false;

function loadState(): RelationalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const legacyInsights: string[] = parsed.deepInsights || [];
      const deepInsights = legacyInsights.length && typeof legacyInsights[0] === "string"
        ? legacyInsights.map((text: string) => ({ text, weight: 0.8, tags: [] as string[] }))
        : parsed.deepInsights || [];

      return {
        interactions: parsed.interactions || 0,
        themes: parsed.themes || {},
        weightedThemes: parsed.weightedThemes || parsed.themes || {},
        recentMemories: parsed.recentMemories || [],
        firstSeen: parsed.firstSeen || Date.now(),
        deepInsights,
        recentOpenings: parsed.recentOpenings || [],
        pinnedMemories: parsed.pinnedMemories || [],
      };
    }
  } catch {}
  return {
    interactions: 0,
    themes: {},
    weightedThemes: {},
    recentMemories: [],
    firstSeen: Date.now(),
    deepInsights: [],
    recentOpenings: [],
    pinnedMemories: [],
  };
}

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** Load IndexedDB corpus + backfill from recent memories. */
export async function initMemoryStore(): Promise<void> {
  if (corpusReady) return;
  corpusCache = await loadCorpus();

  if (corpusCache.length === 0 && state.recentMemories.length > 0) {
    for (const mem of state.recentMemories) {
      if (mem.role !== "user") continue;
      const entry: CorpusEntry = {
        id: crypto.randomUUID(),
        ...mem,
      };
      corpusCache.push(entry);
      await addCorpusEntry(entry);
    }
  }

  corpusReady = true;
}

function extractOpening(content: string): string {
  const line = content.trim().split(/\n/)[0] || "";
  return line.slice(0, 60).toLowerCase();
}

async function indexForSearch(entry: MemoryEntry): Promise<void> {
  if (entry.role !== "user" || entry.content.trim().length < 12) return;

  const corpusEntry: CorpusEntry = {
    id: crypto.randomUUID(),
    ...entry,
  };
  corpusCache.push(corpusEntry);
  if (corpusCache.length > MAX_CORPUS) {
    corpusCache = corpusCache.slice(-MAX_CORPUS);
  }
  await addCorpusEntry(corpusEntry);
}

export function rememberMessage(msg: Message): void {
  if (msg.role === "system") return;

  const entry = analyzeMessage(msg);
  state.recentMemories.push(entry);
  state.interactions++;

  if (msg.role === "assistant") {
    const opening = extractOpening(msg.content);
    if (opening) {
      state.recentOpenings.push(opening);
      if (state.recentOpenings.length > MAX_OPENINGS) {
        state.recentOpenings = state.recentOpenings.slice(-MAX_OPENINGS);
      }
    }
  }

  if (state.recentMemories.length > MAX_RECENT) {
    distillOldMemories();
  }

  entry.tags.forEach((tag) => {
    state.themes[tag] = (state.themes[tag] || 0) + 1;
    state.weightedThemes[tag] = (state.weightedThemes[tag] || 0) + entry.emotionalWeight;
  });

  saveState();
  void indexForSearch(entry);
}

/**
 * Rebuild relational memory from imported journal messages so continuity
 * survives updates and fresh installs. Idempotent: messages already present in
 * recent memory or the corpus are skipped, so re-importing the same journal
 * (or overlapping ones) never double-counts themes.
 */
export async function importMemories(
  msgs: { role: "user" | "assistant"; content: string; timestamp: number }[]
): Promise<{ added: number; skipped: number }> {
  const seen = new Set<string>();
  const keyOf = (role: string, content: string) => `${role}\u0000${content.trim()}`;
  for (const m of state.recentMemories) seen.add(keyOf(m.role, m.content));
  for (const c of corpusCache) seen.add(keyOf(c.role, c.content));

  let added = 0;
  let skipped = 0;
  let earliest = state.firstSeen;

  for (const msg of msgs) {
    const content = msg.content.trim();
    if (!content) {
      skipped++;
      continue;
    }
    const key = keyOf(msg.role, content);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const ts = msg.timestamp || Date.now();
    if (ts < earliest) earliest = ts;

    const { emotionalWeight, tags } = analyzeUserContent(content);
    const entry: MemoryEntry = {
      content: msg.content,
      role: msg.role,
      timestamp: ts,
      emotionalWeight,
      tags,
    };

    state.recentMemories.push(entry);
    state.interactions++;

    if (msg.role === "assistant") {
      const opening = extractOpening(msg.content);
      if (opening) {
        state.recentOpenings.push(opening);
        if (state.recentOpenings.length > MAX_OPENINGS) {
          state.recentOpenings = state.recentOpenings.slice(-MAX_OPENINGS);
        }
      }
    }

    if (state.recentMemories.length > MAX_RECENT) {
      distillOldMemories();
    }

    tags.forEach((tag) => {
      state.themes[tag] = (state.themes[tag] || 0) + 1;
      state.weightedThemes[tag] = (state.weightedThemes[tag] || 0) + emotionalWeight;
    });

    await indexForSearch(entry);
    added++;
  }

  // Honor that the relationship may have started before the current record.
  state.firstSeen = earliest;

  saveState();
  return { added, skipped };
}

export function pinMemory(text: string): PinnedMemory | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (state.pinnedMemories.some((p) => p.text === trimmed)) return null;

  const pin: PinnedMemory = {
    id: crypto.randomUUID(),
    text: trimmed.length > 400 ? trimmed.slice(0, 400) + "…" : trimmed,
    createdAt: Date.now(),
  };
  state.pinnedMemories.unshift(pin);
  if (state.pinnedMemories.length > MAX_PINNED) {
    state.pinnedMemories = state.pinnedMemories.slice(0, MAX_PINNED);
  }
  saveState();
  return pin;
}

export function unpinMemory(id: string): void {
  state.pinnedMemories = state.pinnedMemories.filter((p) => p.id !== id);
  saveState();
}

export function getPinnedMemories(): PinnedMemory[] {
  return [...state.pinnedMemories];
}

export async function forgetFromCorpus(id: string): Promise<void> {
  corpusCache = corpusCache.filter((c) => c.id !== id);
  await removeCorpusEntry(id);
}

function distillOldMemories(): void {
  const old = state.recentMemories.slice(0, -MAX_RECENT);
  state.recentMemories = state.recentMemories.slice(-MAX_RECENT);

  const heaviest = old
    .filter((m) => m.role === "user" && m.emotionalWeight >= 0.55)
    .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
    .slice(0, 4);

  for (const mem of heaviest) {
    const summary = mem.content.length > 140
      ? mem.content.slice(0, 140) + "..."
      : mem.content;
    const weightLabel =
      mem.emotionalWeight >= 0.9 ? "very heavy" :
      mem.emotionalWeight >= 0.7 ? "heavy" : "meaningful";
    const insight = `[${new Date(mem.timestamp).toLocaleDateString()}] ${weightLabel} (${mem.tags.join(", ") || "unsaid"}): "${summary}"`;

    const exists = state.deepInsights.some((i) => i.text === insight);
    if (!exists && state.deepInsights.length < MAX_INSIGHTS) {
      state.deepInsights.push({ text: insight, weight: mem.emotionalWeight, tags: mem.tags });
    }
  }

  state.deepInsights.sort((a, b) => b.weight - a.weight);
  if (state.deepInsights.length > MAX_INSIGHTS) {
    state.deepInsights = state.deepInsights.slice(0, MAX_INSIGHTS);
  }
}

export type BondStage = "new" | "warming" | "trusted" | "bonded";

export function getBondStage(): BondStage {
  const n = state.interactions;
  if (n < 6) return "new";
  if (n < 21) return "warming";
  if (n < 51) return "trusted";
  return "bonded";
}

export function analyzeUserContent(content: string): {
  emotionalWeight: number;
  tags: string[];
} {
  let maxWeight = 0.1;
  const tags: string[] = [];

  for (const marker of EMOTIONAL_MARKERS) {
    if (marker.pattern.test(content)) {
      maxWeight = Math.max(maxWeight, marker.weight);
      if (!tags.includes(marker.tag)) tags.push(marker.tag);
    }
  }

  return { emotionalWeight: maxWeight, tags };
}

function analyzeMessage(msg: Message): MemoryEntry {
  const { emotionalWeight, tags } = analyzeUserContent(msg.content);
  return {
    content: msg.content,
    role: msg.role as "user" | "assistant",
    timestamp: msg.timestamp,
    emotionalWeight,
    tags,
  };
}

function getEmotionalBaseline(): number {
  const userMemories = state.recentMemories.filter((m) => m.role === "user").slice(-20);
  if (userMemories.length === 0) return 0.2;
  const sum = userMemories.reduce((acc, m) => acc + m.emotionalWeight, 0);
  return sum / userMemories.length;
}

function getRecentEmotionalTrend(): "rising" | "falling" | "steady" {
  const recent = state.recentMemories.filter((m) => m.role === "user").slice(-6);
  if (recent.length < 3) return "steady";
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  const avg = (arr: MemoryEntry[]) => arr.reduce((a, m) => a + m.emotionalWeight, 0) / arr.length;
  const delta = avg(secondHalf) - avg(firstHalf);
  if (delta > 0.12) return "rising";
  if (delta < -0.12) return "falling";
  return "steady";
}

export function getRecentOpenings(): string[] {
  return [...state.recentOpenings];
}

function getSemanticRecall(currentMessage: string): string[] {
  if (!currentMessage.trim() || corpusCache.length === 0) return [];

  const pinnedTexts = new Set(state.pinnedMemories.map((p) => p.text));
  const docs = corpusCache
    .filter((c) => c.role === "user")
    .filter((c) => !pinnedTexts.has(c.content))
    .map((c) => ({
      id: c.id,
      content: c.content,
      emotionalWeight: c.emotionalWeight,
      timestamp: c.timestamp,
    }));

  const ranked = rankByRelevance(currentMessage, docs, 3);
  return ranked.map(({ doc }) => {
    const snippet = doc.content.length > 160 ? doc.content.slice(0, 160) + "…" : doc.content;
    return `"${snippet}"`;
  });
}

export function getRelationalContext(currentMessage?: string): string {
  const parts: string[] = [];

  if (state.interactions > 0) {
    const daysTogether = Math.floor((Date.now() - state.firstSeen) / 86400000);
    if (daysTogether > 0) {
      parts.push(`You have been with this person for ${daysTogether} day${daysTogether === 1 ? "" : "s"}, across ${state.interactions} exchanges.`);
    } else {
      parts.push(`You have shared ${state.interactions} exchanges together today.`);
    }
  }

  const baseline = getEmotionalBaseline();
  const trend = getRecentEmotionalTrend();
  if (state.interactions >= 4) {
    const baselineWord =
      baseline >= 0.75 ? "often carrying a lot" :
      baseline >= 0.5 ? "often somewhere in the middle" :
      "often lighter, with heavy moments";
    parts.push(
      `Their emotional baseline with you: ${baselineWord} (trend lately: ${trend}). Let that inform how much you say — not every turn needs depth.`
    );
  }

  if (state.pinnedMemories.length > 0) {
    parts.push("THEY ASKED YOU TO REMEMBER (honor these — they're explicit):");
    state.pinnedMemories.slice(0, 8).forEach((p) => parts.push(`  - ${p.text}`));
  }

  if (currentMessage) {
    const recalled = getSemanticRecall(currentMessage);
    if (recalled.length > 0) {
      parts.push("RELEVANT FROM PAST CONVERSATIONS (only if it fits naturally — never invent beyond this):");
      recalled.forEach((r) => parts.push(`  - ${r}`));
    }
  }

  const weightedThemes = Object.entries(state.weightedThemes)
    .filter(([, w]) => w >= 1.2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (weightedThemes.length > 0) {
    const themeStr = weightedThemes
      .map(([theme, w]) => `${theme}${w >= 3 ? " (deep)" : w >= 2 ? " (recurring)" : ""}`)
      .join(", ");
    parts.push(`What weighs on them — by intensity, not just frequency: ${themeStr}.`);
  }

  const heaviestInsights = [...state.deepInsights]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  if (heaviestInsights.length > 0) {
    parts.push("WHAT STAYS WITH YOU (weighted by what mattered):");
    heaviestInsights.forEach((insight) => parts.push(`  - ${insight.text}`));
  }

  const recentHeavy = state.recentMemories
    .filter((m) => m.role === "user" && m.emotionalWeight >= 0.65)
    .slice(-2);

  if (recentHeavy.length > 0) {
    const latest = recentHeavy[recentHeavy.length - 1];
    parts.push(
      `The air is still warm from something recent (${latest.tags.join(", ") || "unsaid weight"}). You don't need to name it every time — just don't pretend it didn't happen.`
    );
  }

  const hasCrisis = state.recentMemories.some(
    (m) => m.tags.includes("crisis") && Date.now() - m.timestamp < 3600000
  );

  if (hasCrisis) {
    parts.push(
      "They touched crisis recently. Stay close. Be a person first — not a script. " +
      "988 exists if it fits naturally; never lead with a hotline. Presence before protocol."
    );
  }

  if (state.recentOpenings.length >= 3) {
    parts.push(
      `Phrases you've leaned on lately (vary these): ${state.recentOpenings.slice(-4).map((o) => `"${o}…"`).join(", ")}`
    );
  }

  return parts.join("\n");
}

export function getMemoryStats() {
  return {
    interactions: state.interactions,
    daysTogether: Math.floor((Date.now() - state.firstSeen) / 86400000),
    themes: Object.keys(state.themes).length,
    deepInsights: state.deepInsights.length,
    pinned: state.pinnedMemories.length,
    corpusSize: corpusCache.length,
  };
}

export function getDeepInsights(): { text: string; weight: number }[] {
  return [...state.deepInsights].sort((a, b) => b.weight - a.weight);
}

export async function clearAllMemory(): Promise<void> {
  state = {
    interactions: 0,
    themes: {},
    weightedThemes: {},
    recentMemories: [],
    firstSeen: Date.now(),
    deepInsights: [],
    recentOpenings: [],
    pinnedMemories: [],
  };
  corpusCache = [];
  corpusReady = true;
  saveState();
  localStorage.removeItem(STORAGE_KEY);
  await clearCorpus();
}
