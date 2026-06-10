import * as fs from 'fs';
import * as path from 'path';

export interface Skill {
  name: string;
  description: string;
  triggers: string[];
  tools: string[];
  requireTools: boolean;  // erzwingt mindestens 1 Tool-Call vor finaler Antwort
  icon?: string;
  body: string;        // Markdown-Body — wird Teil des System-Prompts
}

const DATA_DIR = process.env['DATA_DIR'] ?? './data';
const USER_AGENT_DIR = path.join(DATA_DIR, 'agents');
const USER_AGENT_FILE = path.join(USER_AGENT_DIR, 'agent.md');
const USER_SKILLS_DIR = path.join(USER_AGENT_DIR, 'skills');
const DEFAULT_AGENT_DIR_CANDIDATES = [
  path.resolve(__dirname, 'default-agents'),                    // production (dist/server/default-agents/...)
  path.resolve(__dirname, '../../src/server/default-agents'),   // dev (tsx)
];

function findDefaultsRoot(): string | null {
  for (const c of DEFAULT_AGENT_DIR_CANDIDATES) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Auf erstem Start: Default-Skills aus dem Repo nach DATA_DIR/agents/skills/
 * kopieren, damit der Power-User sie editieren kann ohne Rebuild.
 */
export function bootstrapAgentSkills(): void {
  fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
  const defaultsRoot = findDefaultsRoot();
  if (!defaultsRoot) {
    console.warn('⚠ Default-Agents-Verzeichnis nicht gefunden — kein Bootstrap.');
    return;
  }
  // agent.md — Top-Level-Persona
  const defaultAgent = path.join(defaultsRoot, 'agent.md');
  if (fs.existsSync(defaultAgent) && !fs.existsSync(USER_AGENT_FILE)) {
    fs.copyFileSync(defaultAgent, USER_AGENT_FILE);
  }
  // skills/*.md
  const defaultsSkillsDir = path.join(defaultsRoot, 'skills');
  if (fs.existsSync(defaultsSkillsDir)) {
    for (const fname of fs.readdirSync(defaultsSkillsDir)) {
      if (!fname.endsWith('.md')) continue;
      const dst = path.join(USER_SKILLS_DIR, fname);
      if (fs.existsSync(dst)) continue; // niemals User-Edits überschreiben
      fs.copyFileSync(path.join(defaultsSkillsDir, fname), dst);
    }
  }
}

/** Frontmatter-Parser für unsere Skill-Markdowns. Sehr minimal — wir kennen
 *  nur ein paar Schlüssel (name, description, triggers, tools, icon). */
function parseFrontmatter(raw: string): { meta: Record<string, any>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const endIdx = raw.indexOf('\n---', 4);
  if (endIdx === -1) return { meta: {}, body: raw };
  const fmText = raw.substring(4, endIdx);
  const body = raw.substring(endIdx + 4).replace(/^\s*\n/, '');
  const meta: Record<string, any> = {};
  for (const rawLine of fmText.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value: string = m[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      const arr = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      meta[key] = arr;
    } else {
      meta[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body };
}

let cachedSkills: Skill[] | null = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

export function loadSkills(): Skill[] {
  const now = Date.now();
  if (cachedSkills && now - cachedAt < CACHE_MS) return cachedSkills;

  fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
  const skills: Skill[] = [];
  for (const fname of fs.readdirSync(USER_SKILLS_DIR)) {
    if (!fname.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(USER_SKILLS_DIR, fname), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    if (!meta['name']) continue;
    skills.push({
      name: String(meta['name']),
      description: String(meta['description'] ?? ''),
      triggers: Array.isArray(meta['triggers']) ? meta['triggers'] : [],
      tools: Array.isArray(meta['tools']) ? meta['tools'] : [],
      requireTools: String(meta['require_tools']) === 'true',
      icon: meta['icon'] ? String(meta['icon']) : undefined,
      body: body.trim(),
    });
  }
  cachedSkills = skills;
  cachedAt = now;
  return skills;
}

export function invalidateSkillCache(): void {
  cachedSkills = null;
  cachedAt = 0;
  cachedAgent = null;
}

/**
 * Lädt das Top-Level agent.md mit Persona + Meta-Regeln.
 * Markdown-Body wird mit Template-Substitution gerendert (Mustache-light).
 */
export interface AgentTemplate {
  meta: Record<string, any>;
  body: string;
}

let cachedAgent: AgentTemplate | null = null;
let cachedAgentAt = 0;

export function loadAgent(): AgentTemplate | null {
  const now = Date.now();
  if (cachedAgent && now - cachedAgentAt < CACHE_MS) return cachedAgent;
  if (!fs.existsSync(USER_AGENT_FILE)) return null;
  const raw = fs.readFileSync(USER_AGENT_FILE, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  cachedAgent = { meta, body: body.trim() };
  cachedAgentAt = now;
  return cachedAgent;
}

/**
 * Minimaler Mustache-light-Renderer. Unterstützt {{key}} und {{key.subkey}}.
 * Fehlende Keys werden zu '' (silent). Kein Code-Eval, keine Helpers.
 */
export function renderTemplate(tpl: string, context: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (_match, key) => {
    const parts = key.split('.');
    let v: any = context;
    for (const p of parts) {
      if (v == null) return '';
      v = v[p];
    }
    return v == null ? '' : String(v);
  });
}

/**
 * Routing-Hilfe ohne LLM: trigger-keyword-Match.
 * Längster passender Trigger gewinnt — verhindert dass „welche" (generisch)
 * vor „welche überfälligen" (spezifisch) matched. Wenn nichts matched →
 * null → Caller nutzt LLM-Router oder Fallback.
 */
export function quickRouteByTrigger(skills: Skill[], userMessage: string): Skill | null {
  const text = userMessage.toLowerCase();
  let best: { skill: Skill; len: number } | null = null;
  for (const s of skills) {
    for (const t of s.triggers) {
      if (!t) continue;
      const tl = t.toLowerCase();
      if (text.includes(tl) && (!best || tl.length > best.len)) {
        best = { skill: s, len: tl.length };
      }
    }
  }
  return best?.skill ?? null;
}
