import { analyzeUserContent, getBondStage, type BondStage } from "./memory";

export type ConversationMode =
  | "presence"
  | "venting"
  | "seeking"
  | "crisis"
  | "light"
  | "deep"
  | "practical";

export interface AdaptationContext {
  mode: ConversationMode;
  bondStage: BondStage;
  emotionalWeight: number;
  tags: string[];
  energy: "low" | "medium" | "high";
  hints: string[];
  guardrails: string[];
}

const MODE_PATTERNS: { mode: ConversationMode; patterns: RegExp[]; weight?: number }[] = [
  {
    mode: "crisis",
    patterns: [
      /\b(die|dying|kill myself|suicide|end it|give up|don't want to (be|live)|can't go on)\b/i,
    ],
    weight: 10,
  },
  {
    mode: "seeking",
    patterns: [
      /\b(what should|how (do|can|should)|advice|help me|need help|what do you think|any ideas)\b/i,
      /\?$/,
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
    patterns: [/\b(just (talk|chat|here)|listen|hear me|with me|don't fix)\b/i],
    weight: 2,
  },
];

const MODE_HINTS: Record<ConversationMode, string> = {
  crisis:
    "They may be in crisis. Lead with immediate warmth and presence. Keep it grounded — no philosophy, no fixing. Gently mention 988 if appropriate, but stay with them first.",
  presence:
    "They want presence, not solutions. Hold space. Reflect back what you hear. Do not rush to advice or questions.",
  venting:
    "They are venting. Validate first. Do not problem-solve unless they ask. Match their intensity without escalating.",
  seeking:
    "They are asking for something — guidance, perspective, or a clear answer. Be direct and useful after acknowledging them.",
  light:
    "The energy is lighter. Match it — warm, natural, maybe a little playful. Don't drag the mood down.",
  deep:
    "They are in deep territory. Go with them — thoughtful, unhurried, honest. No platitudes.",
  practical:
    "This is practical life stuff. Be grounded and concrete. Warmth first, then useful clarity.",
};

const BOND_HINTS: Record<BondStage, string> = {
  new: "You're still getting to know each other. Be warm but don't assume deep familiarity.",
  warming:
    "Trust is building. You can reference what they've shared before, but stay attentive — don't perform closeness.",
  trusted:
    "You know this person. Speak naturally, reference shared history when it helps, be more direct when needed.",
  bonded:
    "You have real history together. Be fully yourself — less formal, more intimate, like someone who truly knows them.",
};

const PLATITUDE_PATTERNS = [
  /\b(everything happens for a reason|stay positive|look on the bright side|it'll all work out|just think happy thoughts)\b/i,
  /\b(sending (you )?love|virtual hug|thoughts and prayers)\b/i,
];

function detectEnergy(content: string): "low" | "medium" | "high" {
  const words = content.trim().split(/\s+/).length;
  const hasCaps = /[A-Z]{3,}/.test(content);
  const hasExclamation = /!{2,}/.test(content);
  if (words <= 8 && !hasExclamation) return "low";
  if (hasCaps || hasExclamation || words > 80) return "high";
  return "medium";
}

function scoreModes(content: string): ConversationMode {
  const scores: Partial<Record<ConversationMode, number>> = {};

  for (const { mode, patterns, weight = 1 } of MODE_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) score += weight;
    }
    if (score > 0) scores[mode] = score;
  }

  const { emotionalWeight, tags } = analyzeUserContent(content);
  if (tags.includes("crisis")) return "crisis";
  if (emotionalWeight >= 0.85 && !scores.seeking) scores.venting = (scores.venting || 0) + 2;
  if (emotionalWeight <= 0.3 && tags.includes("light")) scores.light = (scores.light || 0) + 2;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return emotionalWeight >= 0.7 ? "venting" : emotionalWeight <= 0.3 ? "light" : "presence";
  }
  return ranked[0][0] as ConversationMode;
}

export function adaptToMessage(
  userMessage: string,
  recentUserMessages: string[] = []
): AdaptationContext {
  const { emotionalWeight, tags } = analyzeUserContent(userMessage);
  const mode = scoreModes(userMessage);
  const bondStage = getBondStage();
  const energy = detectEnergy(userMessage);

  const hints: string[] = [MODE_HINTS[mode], BOND_HINTS[bondStage]];

  if (energy === "low") {
    hints.push("Their message is brief or quiet. Match the pace — don't overwhelm with length.");
  } else if (energy === "high") {
    hints.push("Their energy is high. Meet it — don't flatten them with calm clinical tone.");
  }

  const recurring = recentUserMessages.slice(-3)
    .map((m) => analyzeUserContent(m).tags)
    .flat();
  const repeatedTag = tags.find((t) => recurring.filter((r) => r === t).length >= 2);
  if (repeatedTag && repeatedTag !== "light") {
    hints.push(
      `This theme (${repeatedTag}) keeps surfacing. Acknowledge the pattern gently — they may be circling something important.`
    );
  }

  const guardrails = [
    "Answer what they actually said first. One emotional beat, then substance.",
    "No stacked metaphors, no performative empathy, no therapist-speak.",
    "If unsure what they need, ask one honest question — not three.",
  ];

  if (mode !== "deep" && mode !== "crisis") {
    guardrails.push("Don't philosophize unless they invite it.");
  }

  return { mode, bondStage, emotionalWeight, tags, energy, hints, guardrails };
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

  if (context.mode === "seeking" && draft.length < 40) return true;

  if (context.mode === "presence" && /\?/.test(draft) && draft.split("?").length > 2) {
    return true;
  }

  if (userMessage.length > 120 && draft.length < userMessage.length * 0.15) {
    return true;
  }

  return false;
}

export function buildReflectPrompt(
  draft: string,
  userMessage: string,
  context: AdaptationContext
): string {
  return `You are reviewing a companion's draft reply before it is sent.

THE PERSON SAID:
"${userMessage.slice(0, 600)}"

DETECTED MODE: ${context.mode}
EMOTIONAL WEIGHT: ${context.emotionalWeight.toFixed(2)}

ADAPTATION HINTS:
${context.hints.map((h) => `- ${h}`).join("\n")}

DRAFT REPLY:
${draft}

Review the draft for:
- Does it actually address what they said?
- Does the tone fit the mode (${context.mode})?
- Any platitudes, hollow affirmations, or therapist-speak?
- Right length for their energy?

If the draft is good enough, reply with exactly: UNCHANGED
If it needs improvement, reply with ONLY the improved message — no explanation, no quotes, no preamble.`;
}
