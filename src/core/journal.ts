/**
 * Parse a journal exported by the app (`you-journal-*.md`) back into messages,
 * so a person's history can be re-imported after an update or on a new device.
 * The export format, per message, is:
 *
 *   **Name** — *9:40 PM*
 *
 *   message content (may span multiple lines/paragraphs)
 *
 *   ---
 *
 * with a title block at the top and a closing benediction at the bottom.
 */

export interface ParsedJournalMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// **Name** — *time*  (em dash, en dash, or hyphen, to survive hand-edits)
const HEADER_RE = /^\*\*(.+?)\*\*\s*[—–-]\s*\*(.+?)\*\s*$/;

// Closing lines the export appends after the final message; never real content.
const KNOWN_FOOTERS = new Set([
  "*Whatever you carry, you can set it down here.*",
  "*🦖 Thanks for hanging out, bro.*",
  "*🎮 GG. Catch you next session.*",
  "*🦖🎮 GG. Catch you next session, bro.*",
]);

function roleFromName(name: string): "user" | "assistant" {
  return /\(ai\)/i.test(name) ||
    /dino\s*buddy/i.test(name) ||
    /game\s*buddy/i.test(name) ||
    /^you$/i.test(name.trim())
    ? "assistant"
    : "user";
}

/** Pull the export date from the `*Exported <weekday>, <date>*` header line. */
function parseExportDate(md: string): number {
  const m = md.match(/^\*Exported (.+?)\*\s*$/m);
  if (m) {
    const cleaned = m[1].replace(/^[A-Za-z]+,\s*/, "").trim();
    const t = Date.parse(cleaned);
    if (!Number.isNaN(t)) return t;
  }
  return NaN;
}

/** Combine the journal's date with a per-message time like "9:40 PM". */
function combineDateTime(baseMs: number, timeStr: string): number {
  if (Number.isNaN(baseMs)) return NaN;
  const dateOnly = new Date(baseMs).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const t = Date.parse(`${dateOnly} ${timeStr.trim()}`);
  return Number.isNaN(t) ? NaN : t;
}

function cleanBody(body: string[]): string {
  const lines = [...body];
  while (lines.length && !lines[0].trim()) lines.shift();

  // Strip trailing blank lines, separators, and the closing benediction —
  // looping so any combination at the tail is removed while real `---` rules
  // inside the message body are preserved.
  let changed = true;
  while (changed) {
    changed = false;
    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
      changed = true;
    }
    const last = lines.length ? lines[lines.length - 1].trim() : "";
    if (last === "---" || KNOWN_FOOTERS.has(last)) {
      lines.pop();
      changed = true;
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseJournalMarkdown(
  md: string,
  fallbackDate: number = Date.now()
): ParsedJournalMessage[] {
  const baseDate = parseExportDate(md);
  const base = Number.isNaN(baseDate) ? fallbackDate : baseDate;
  const lines = md.split(/\r?\n/);

  interface Raw {
    role: "user" | "assistant";
    time: string;
    body: string[];
  }

  const raws: Raw[] = [];
  let current: Raw | null = null;

  for (const line of lines) {
    const header = line.match(HEADER_RE);
    if (header) {
      if (current) raws.push(current);
      current = { role: roleFromName(header[1]), time: header[2], body: [] };
      continue;
    }
    // Everything before the first header (title block) is ignored.
    if (current) current.body.push(line);
  }
  if (current) raws.push(current);

  const out: ParsedJournalMessage[] = [];
  raws.forEach((raw, i) => {
    const content = cleanBody(raw.body);
    if (!content) return;
    let ts = combineDateTime(base, raw.time);
    if (Number.isNaN(ts)) ts = base + i * 1000;
    out.push({ role: raw.role, content, timestamp: ts });
  });

  return out;
}
