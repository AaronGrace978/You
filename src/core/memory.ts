import type { Message } from "../store";

interface MemoryEntry {
  content: string;
  role: "user" | "assistant";
  timestamp: number;
  emotionalWeight: number;
  tags: string[];
}

interface RelationalState {
  interactions: number;
  themes: Record<string, number>;
  weightedThemes: Record<string, number>;
  recentMemories: MemoryEntry[];
  firstSeen: number;
  deepInsights: { text: string; weight: number; tags: string[] }[];
  recentOpenings: string[];
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

let state: RelationalState = loadState();

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
  };
}

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function extractOpening(content: string): string {
  const line = content.trim().split(/\n/)[0] || "";
  return line.slice(0, 60).toLowerCase();
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

export function getRelationalContext(): string {
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
  };
}
