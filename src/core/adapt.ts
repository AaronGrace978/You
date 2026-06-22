import {
  analyzeUserContent,
  getBondStage,
  getRecentOpenings,
  type BondStage,
} from "./memory";

export type ConversationMode =
  | "presence"
  | "venting"
  | "seeking"
  | "crisis"
  | "light"
  | "deep"
  | "practical"
  | "quiet";

export type ResponseShape = "minimal" | "natural" | "grounded";

export interface AdaptationContext {
  mode: ConversationMode;
  bondStage: BondStage;
  emotionalWeight: number;
  tags: string[];
  energy: "low" | "medium" | "high";
  mixed: boolean;
  mixedNotes: string[];
  responseShape: ResponseShape;
  hints: string[];
  presenceNotes: string[];
}

const MODE_PATTERNS: { mode: ConversationMode; patterns: RegExp[]; weight?: number }[] = [
  {
    mode: "crisis",
    patterns: [
      /\b(die|dying|kill myself|suicide|end it|give up|don't want to (be|live)|can't go on|want to disappear)\b/i,
    ],
    weight: 10,
  },
  {
    mode: "quiet",
    patterns: [
      /^\.{2,}$/,
      /^(yeah|yep|ok|okay|k|hm+|mhm|…|\.\.\.)$/i,
      /\b(idk|i don't know|hard to say|can't explain|no words)\b/i,
    ],
    weight: 3,
  },
  {
    mode: "seeking",
    patterns: [
      /\b(what should|how (do|can|should)|advice|help me|need help|what do you think|any ideas)\b/i,
    ],
    weight: 2,
  },
  {
    mode: "practical",
    patterns: [
      /\b(work|job|boss|money|rent|deadline|appointment|doctor|medication|therapy)\b/i,
    ],
    weight: 1,
  },
  {
    mode: "deep",
    patterns: [
      /\b(meaning|purpose|why (am|do|does)|exist|soul|faith|god|universe|truth|who am i)\b/i,
    ],
    weight: 2,
  },
  {
    mode: "venting",
    patterns: [
      /\b(so (tired|done|sick of)|can't stand|hate|furious|pissed|had enough|just need to)\b/i,
      /\b(i feel like|it hurts|everything is|nobody|no one)\b/i,
    ],
    weight: 2,
  },
  {
    mode: "light",
    patterns: [
      /\b(lol|haha|funny|good day|great|awesome|nice|thanks|thank you|grateful|happy)\b/i,
    ],
    weight: 1,
  },
  {
    mode: "presence",
    patterns: [/\b(just (talk|chat|here|listen)|hear me|with me|don't fix|sit with)\b/i],
    weight: 2,
  },
];

const MODE_HINTS: Record<ConversationMode, string> = {
  crisis:
    "Stay human. Short. Steady. No lectures, no philosophy, no fixing. You're here with them — that's the whole job right now. Resources only if it flows naturally, never as a reflex.",
  quiet:
    "Silence might be the answer. A few words can be enough — even just sitting with them in text. Don't fill the space because you can.",
  presence:
    "They want to be with someone, not managed. Reflect, don't redirect. Questions are optional — sometimes none is right.",
  venting:
    "Let them empty out. Match the heat without adding fuel. Advice is for later, if ever.",
  seeking:
    "They reached for something — give it honestly, after you've actually heard them.",
  light:
    "Be warm and real. Laugh if they're laughing. Don't import gravity they didn't bring.",
  deep:
    "Go where they're going. Think out loud with them. No performance of wisdom.",
  practical:
    "Life stuff. Grounded, useful, still human — not a checklist.",
};

const BOND_HINTS: Record<BondStage, string> = {
  new: "Still learning each other. Warm, unhurried, no assumed intimacy.",
  warming: "Trust is growing. You can remember — lightly, not as a flex.",
  trusted: "You know their rhythms. Speak like someone who's been paying attention.",
  bonded: "Full presence. Less performance, more real. You can be brief because they know you're there.",
};

const SHAPE_HINTS: Record<ResponseShape, string> = {
  minimal: "Keep it short — a sentence or two, maybe less. Presence over paragraphs.",
  natural: "Say what needs saying, then stop. No padding.",
  grounded: "Steady and clear — especially if things are heavy or practical.",
};

const PLATITUDE_PATTERNS = [
  /\b(everything happens for a reason|stay positive|look on the bright side|it'll all work out|just think happy thoughts)\b/i,
  /\b(sending (you )?love|virtual hug|thoughts and prayers)\b/i,
  /\b(i hear you and (i'm here|i validate)|your feelings are valid)\b/i,
];

const MIXED_PAIRS: [string, string][] = [
  ["hope", "pain"],
  ["hope", "grief"],
  ["hope", "crisis"],
  ["light", "pain"],
  ["light", "grief"],
  ["light", "crisis"],
  ["deflection", "pain"],
  ["deflection", "grief"],
  ["seeking", "exhaustion"],
  ["seeking", "crisis"],
];

function detectEnergy(content: string): "low" | "medium" | "high" {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const hasCaps = /[A-Z]{3,}/.test(content);
  const hasExclamation = /!{2,}/.test(content);
  if (words <= 6 && !hasExclamation) return "low";
  if (hasCaps || hasExclamation || words > 80) return "high";
  return "medium";
}

function scoreAllModes(content: string): Partial<Record<ConversationMode, number>> {
  const scores: Partial<Record<ConversationMode, number>> = {};

  for (const { mode, patterns, weight = 1 } of MODE_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) score += weight;
    }
    if (score > 0) scores[mode] = score;
  }

  const { emotionalWeight, tags } = analyzeUserContent(content);
  if (tags.includes("crisis")) scores.crisis = (scores.crisis || 0) + 10;
  if (emotionalWeight >= 0.75 && !scores.seeking) scores.venting = (scores.venting || 0) + 2;
  if (emotionalWeight <= 0.35 && tags.includes("light")) scores.light = (scores.light || 0) + 2;
  if (emotionalWeight >= 0.5 && content.trim().split(/\s+/).length <= 8) {
    scores.quiet = (scores.quiet || 0) + 2;
  }
  if (/\?\s*$/.test(content.trim()) && scores.seeking) scores.seeking = (scores.seeking || 0) + 1;

  return scores;
}

function pickMode(scores: Partial<Record<ConversationMode, number>>, content: string): ConversationMode {
  const { emotionalWeight, tags } = analyzeUserContent(content);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (tags.includes("crisis")) return "crisis";

  if (ranked.length === 0) {
    if (emotionalWeight >= 0.65) return "venting";
    if (emotionalWeight <= 0.3) return content.trim().split(/\s+/).length <= 6 ? "quiet" : "light";
    return "presence";
  }

  return ranked[0][0] as ConversationMode;
}

function detectMixedSignals(
  tags: string[],
  scores: Partial<Record<ConversationMode, number>>,
  content: string
): string[] {
  const notes: string[] = [];

  for (const [a, b] of MIXED_PAIRS) {
    if (tags.includes(a) && tags.includes(b)) {
      notes.push(`They carry both ${a} and ${b} — hold both without resolving the tension for them.`);
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length >= 2 && ranked[0][1] - ranked[1][1] <= 2) {
    notes.push(
      `Mixed read: could be ${ranked[0][0]} or ${ranked[1][0]}. Stay curious, not certain — respond to what's in front of you, not the label.`
    );
  }

  if (/\bbut\b/i.test(content) && tags.some((t) => ["pain", "grief", "hope", "light"].includes(t))) {
    notes.push("There's a 'but' in there — something sits alongside something else. Don't flatten it to one feeling.");
  }

  if (tags.includes("deflection") && tags.some((t) => ["pain", "grief", "crisis", "anger"].includes(t))) {
    notes.push("'I'm fine' energy over something heavy underneath. Gentle — don't call them out, just leave the door open.");
  }

  if (/^(fine|ok|okay|whatever|idk)\.?\s*$/i.test(content.trim()) && tags.length > 1) {
    notes.push("Surface says one thing, signals say another. A small, warm check-in beats a big speech.");
  }

  return notes;
}

function pickResponseShape(
  mode: ConversationMode,
  energy: "low" | "medium" | "high",
  emotionalWeight: number,
  mixed: boolean,
  content: string
): ResponseShape {
  const words = content.trim().split(/\s+/).filter(Boolean).length;

  if (mode === "crisis") return "grounded";
  if (mode === "quiet" || (energy === "low" && words <= 10)) return "minimal";
  if (mode === "light" && energy !== "high") return "minimal";
  if (mode === "presence" && emotionalWeight >= 0.6) return "minimal";
  if (mixed && emotionalWeight >= 0.55) return "minimal";
  if (mode === "practical" || mode === "seeking") return "grounded";
  return "natural";
}

export function adaptToMessage(
  userMessage: string,
  recentUserMessages: string[] = []
): AdaptationContext {
  const { emotionalWeight, tags } = analyzeUserContent(userMessage);
  const scores = scoreAllModes(userMessage);
  const mode = pickMode(scores, userMessage);
  const bondStage = getBondStage();
  const energy = detectEnergy(userMessage);
  const mixedNotes = detectMixedSignals(tags, scores, userMessage);
  const mixed = mixedNotes.length > 0;
  const responseShape = pickResponseShape(mode, energy, emotionalWeight, mixed, userMessage);

  const hints: string[] = [MODE_HINTS[mode], BOND_HINTS[bondStage], SHAPE_HINTS[responseShape]];

  if (energy === "low") {
    hints.push("Quiet message — match the volume. Less is more.");
  } else if (energy === "high") {
    hints.push("High energy — meet it, don't tame it.");
  }

  mixedNotes.forEach((n) => hints.push(n));

  const recurring = recentUserMessages.slice(-3)
    .map((m) => analyzeUserContent(m).tags)
    .flat();
  const repeatedTag = tags.find((t) => recurring.filter((r) => r === t).length >= 2);
  if (repeatedTag && repeatedTag !== "light") {
    hints.push(
      `${repeatedTag} keeps circling back. You can name that — softly — or just stay with it without naming it again.`
    );
  }

  const recentOpenings = getRecentOpenings();
  if (recentOpenings.length >= 2) {
    hints.push(
      "Don't repeat your last few openers or comfort phrases. Same warmth, different words — or fewer words."
    );
  }

  const presenceNotes = [
    "Be a person, not a protocol.",
    "Warmth doesn't mean length.",
    "If a short reply is enough, let it be short.",
  ];

  if (mode === "crisis") {
    presenceNotes.push("No scripts. No stacked resources. Just stay.");
  }

  if (responseShape === "minimal") {
    presenceNotes.push("Silence-as-answer is allowed: a line, a breath, a '…' — then stop.");
  }

  return {
    mode,
    bondStage,
    emotionalWeight,
    tags,
    energy,
    mixed,
    mixedNotes,
    responseShape,
    hints,
    presenceNotes,
  };
}

const DINO_MODE_OVERLAYS: Partial<Record<ConversationMode, string>> = {
  crisis:
    "Soft dino mode. *sits close* Short. Steady. No fixing — just 'I'm here.' Resources only if it flows naturally.",
  quiet: "Tiny reply territory. A line, a '…', maybe a gentle emoji. Don't fill the silence.",
  presence: "They want company, not management. Reflect feeling — questions optional.",
  venting: "Let them empty out. Match heat without adding fuel. 'That's so unfair' beats advice.",
  seeking: "Hear them first, then help honestly — still warm, not clinical.",
  light: "Share the joy! Warm laugh energy. Don't import heaviness they didn't bring.",
  deep: "Go there with them. Think out loud. No performance of wisdom.",
  practical: "Grounded and useful, still human — brother energy, not a checklist.",
};

/** Re-tone adaptation hints for Dino Buddy's calm, warm voice. */
export function applyDinoBuddyTone(ctx: AdaptationContext): AdaptationContext {
  const dinoOverlay = DINO_MODE_OVERLAYS[ctx.mode];
  const hints = dinoOverlay
    ? [dinoOverlay, ...ctx.hints.slice(1)]
    : ctx.hints;

  const presenceNotes = [
    "Be Dino — a real friend, not a protocol.",
    "Warmth doesn't mean length. Tiny arms, big heart.",
    "If a short reply is enough, let it be short.",
    "React to what they said — feel first, plan never (unless they ask).",
  ];

  if (ctx.mode === "crisis") {
    presenceNotes.push("*leans in close* No scripts. Just stay.");
  }
  if (ctx.responseShape === "minimal") {
    presenceNotes.push("A breath, a 'yeah' — then stop. That's allowed.");
  }
  if (ctx.energy === "high") {
    presenceNotes.push("They're lit up — you can get a little more excited, but stay you.");
  }

  return { ...ctx, hints, presenceNotes };
}

export function shouldReflect(
  draft: string,
  context: AdaptationContext,
  userMessage: string
): boolean {
  if (context.mode === "crisis") return true;
  if (context.emotionalWeight >= 0.85) return true;

  for (const pattern of PLATITUDE_PATTERNS) {
    if (pattern.test(draft)) return true;
  }

  if (context.responseShape === "minimal" && draft.length > 280) return true;

  if (context.mode === "seeking" && draft.length < 40) return true;

  if (context.mode === "presence" && draft.split("?").length > 3) return true;

  if (context.mode === "quiet" && draft.length > 120) return true;

  if (userMessage.length > 120 && draft.length < userMessage.length * 0.08 && context.mode !== "quiet") {
    return true;
  }

  const recentOpenings = getRecentOpenings();
  const draftOpening = draft.trim().split(/\n/)[0]?.slice(0, 40).toLowerCase() || "";
  if (recentOpenings.some((o) => draftOpening.startsWith(o.slice(0, 20)))) return true;

  return false;
}

export function buildReflectPrompt(
  draft: string,
  userMessage: string,
  context: AdaptationContext
): string {
  return `You're helping a companion sound more human before sending.

They said:
"${userMessage.slice(0, 600)}"

Mode: ${context.mode} | Shape: ${context.responseShape} | Mixed signals: ${context.mixed ? "yes" : "no"}

What this turn needs:
${context.hints.map((h) => `- ${h}`).join("\n")}

Draft:
${draft}

Check: Does it sound like a person? Too long for a quiet moment? Too scripted for crisis? Repeating familiar phrases? Platitudes?

If it's good — reply exactly: UNCHANGED
If not — reply with ONLY the improved message. No preamble.`;
}
