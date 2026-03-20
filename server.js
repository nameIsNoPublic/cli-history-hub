const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3456;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CODEX_DIR = path.join(os.homedir(), '.codex');
const CODEX_SESSIONS_DIR = path.join(CODEX_DIR, 'sessions');
const CODEX_INDEX_PATH = path.join(CODEX_DIR, 'session_index.jsonl');
const GEMINI_DIR = path.join(os.homedir(), '.gemini');
const GEMINI_TMP_DIR = path.join(GEMINI_DIR, 'tmp');
const GEMINI_PROJECTS_PATH = path.join(GEMINI_DIR, 'projects.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// In-memory cache: keyed by absolute file path, stores { mtime, data }
// ---------------------------------------------------------------------------
const sessionCache = new Map();

// ---------------------------------------------------------------------------
// XML tag stripping for user messages
// ---------------------------------------------------------------------------
const XML_STRIP_TAGS = [
  'local-command-caveat',
  'command-name',
  'command-message',
  'command-args',
  'local-command-stdout',
  'system-reminder',
];

function stripXmlTags(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text;
  for (const tag of XML_STRIP_TAGS) {
    cleaned = cleaned.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'g'), '');
  }
  return cleaned.trim();
}

// ---------------------------------------------------------------------------
// Read sidecar meta file for a session
// ---------------------------------------------------------------------------
function readSidecarMeta(projectDir, sessionId) {
  const metaPath = path.join(projectDir, 'session-meta', `${sessionId}.json`);
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

// ---------------------------------------------------------------------------
// Write sidecar meta file for a session
// ---------------------------------------------------------------------------
function writeSidecarMeta(projectDir, sessionId, meta) {
  const metaDir = path.join(projectDir, 'session-meta');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  const metaPath = path.join(metaDir, `${sessionId}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

// ---------------------------------------------------------------------------
// Extract session metadata from a .jsonl file (with caching by mtime)
// ---------------------------------------------------------------------------
function extractSessionMeta(filePath, sessionId, projectDir) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let firstPrompt = null;
    let customNameFromJsonl = null;
    let created = null;
    let modified = null;
    let gitBranch = null;
    let projectPath = null;
    let messageCount = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      // Track timestamps
      if (obj.timestamp) {
        const ts = obj.timestamp;
        if (!created || ts < created) created = ts;
        if (!modified || ts > modified) modified = ts;
      }

      // Extract git branch and project path
      if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
      if (!projectPath && obj.cwd) projectPath = obj.cwd;

      // Extract session rename from system messages
      if (obj.type === 'system' && obj.subtype === 'local_command' &&
          typeof obj.content === 'string' && obj.content.includes('Session renamed to:')) {
        const match = obj.content.match(/Session renamed to:\s*(.+?)(?:<|$)/);
        if (match) customNameFromJsonl = match[1].trim();
      }

      // Extract first user prompt
      if (obj.type === 'user' && obj.message && !obj.isMeta && !firstPrompt) {
        const c = obj.message.content;
        if (typeof c === 'string') {
          const cleaned = stripXmlTags(c);
          if (cleaned) firstPrompt = cleaned;
        } else if (Array.isArray(c)) {
          const text = stripXmlTags(
            c.filter(b => b.type === 'text').map(b => b.text).join('\n')
          );
          if (text) firstPrompt = text;
        }
      }

      // Count user and assistant messages
      if ((obj.type === 'user' && obj.message && !obj.isMeta) ||
          (obj.type === 'assistant' && obj.message)) {
        messageCount++;
      }
    }

    // Read sidecar meta for custom name, tags, favorite
    const sidecar = readSidecarMeta(projectDir, sessionId);
    const customName = sidecar.customName || customNameFromJsonl || null;
    const tags = sidecar.tags || [];
    const isFavorite = sidecar.isFavorite || false;

    return {
      sessionId,
      firstPrompt: firstPrompt || 'No prompt',
      customName,
      displayName: customName || (firstPrompt ? firstPrompt.substring(0, 100) : 'Untitled'),
      messageCount,
      created,
      modified,
      gitBranch,
      projectPath,
      tags,
      isFavorite,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scan all sessions for a project directory (with caching)
// ---------------------------------------------------------------------------
function scanProjectSessions(projectDir) {
  let files;
  try {
    files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
  } catch {
    return [];
  }

  const sessions = [];
  for (const file of files) {
    const sessionId = file.replace('.jsonl', '');
    const filePath = path.join(projectDir, file);
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }

    const cacheKey = filePath;
    const cached = sessionCache.get(cacheKey);

    // Also check sidecar mtime so tag/fav/name changes invalidate
    const sidecarPath = path.join(projectDir, 'session-meta', `${sessionId}.json`);
    let sidecarMtime = 0;
    try { sidecarMtime = fs.statSync(sidecarPath).mtimeMs; } catch { /* no sidecar */ }

    if (cached && cached.mtime === stat.mtimeMs && cached.sidecarMtime === sidecarMtime) {
      if (cached.data && cached.data.messageCount > 0) sessions.push(cached.data);
      continue;
    }

    const meta = extractSessionMeta(filePath, sessionId, projectDir);
    sessionCache.set(cacheKey, { mtime: stat.mtimeMs, sidecarMtime, data: meta });
    if (meta && meta.messageCount > 0) {
      sessions.push(meta);
    }
  }

  return sessions.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
}

// ---------------------------------------------------------------------------
// Get real project path by scanning jsonl files for cwd field
// ---------------------------------------------------------------------------
function getProjectPath(projectDir) {
  let files;
  try {
    files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
  } catch {
    return null;
  }

  for (const jf of files.slice(0, 5)) {
    try {
      const content = fs.readFileSync(path.join(projectDir, jf), 'utf-8');
      for (const line of content.split('\n').slice(0, 30)) {
        if (!line.trim()) continue;
        const obj = JSON.parse(line);
        if (obj.cwd) return obj.cwd;
      }
    } catch { /* continue */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parse all messages from a jsonl file, merge consecutive assistant turns
// ---------------------------------------------------------------------------
function parseSessionMessages(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const rawMessages = [];
  let customNameFromJsonl = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    // Extract rename
    if (obj.type === 'system' && obj.subtype === 'local_command' &&
        typeof obj.content === 'string' && obj.content.includes('Session renamed to:')) {
      const match = obj.content.match(/Session renamed to:\s*(.+?)(?:<|$)/);
      if (match) customNameFromJsonl = match[1].trim();
    }

    // User messages (non-meta)
    if (obj.type === 'user' && obj.message && !obj.isMeta) {
      rawMessages.push(formatUserMessage(obj));
    }
    // Assistant messages
    else if (obj.type === 'assistant' && obj.message) {
      rawMessages.push(formatAssistantMessage(obj));
    }
  }

  // Merge consecutive assistant messages into turns
  const merged = [];
  for (const msg of rawMessages) {
    if (msg.type === 'assistant' && merged.length > 0 && merged[merged.length - 1].type === 'assistant') {
      const prev = merged[merged.length - 1];
      // Merge blocks
      prev.blocks = (prev.blocks || []).concat(msg.blocks || []);
      // Use later timestamp
      if (msg.timestamp && (!prev.timestamp || msg.timestamp > prev.timestamp)) {
        prev.timestamp = msg.timestamp;
      }
      // Use later model if present
      if (msg.model) prev.model = msg.model;
      // Aggregate usage
      if (msg.usage) {
        if (!prev.usage) {
          prev.usage = { ...msg.usage };
        } else {
          prev.usage.input_tokens = (prev.usage.input_tokens || 0) + (msg.usage.input_tokens || 0);
          prev.usage.output_tokens = (prev.usage.output_tokens || 0) + (msg.usage.output_tokens || 0);
          prev.usage.cache_creation_input_tokens = (prev.usage.cache_creation_input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0);
          prev.usage.cache_read_input_tokens = (prev.usage.cache_read_input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0);
        }
      }
      // Merge gitBranch
      if (msg.gitBranch && !prev.gitBranch) prev.gitBranch = msg.gitBranch;
    } else {
      merged.push(msg);
    }
  }

  return { messages: merged, customNameFromJsonl };
}

function formatUserMessage(obj) {
  const msg = {
    type: 'user',
    uuid: obj.uuid,
    timestamp: obj.timestamp,
  };
  const content = obj.message?.content;
  if (typeof content === 'string') {
    msg.text = stripXmlTags(content);
  } else if (Array.isArray(content)) {
    msg.text = stripXmlTags(
      content.filter(c => c.type === 'text').map(c => c.text).join('\n')
    );
  } else {
    msg.text = '';
  }
  return msg;
}

function formatAssistantMessage(obj) {
  const msg = {
    type: 'assistant',
    uuid: obj.uuid,
    timestamp: obj.timestamp,
    model: obj.message?.model || null,
    usage: obj.message?.usage || null,
    gitBranch: obj.gitBranch || null,
    blocks: [],
  };

  const content = obj.message?.content;
  if (Array.isArray(content)) {
    msg.blocks = content.map(block => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      } else if (block.type === 'thinking') {
        return { type: 'thinking', thinking: block.thinking || '' };
      } else if (block.type === 'tool_use') {
        return { type: 'tool_use', name: block.name, input: block.input };
      } else if (block.type === 'tool_result') {
        return { type: 'tool_result', content: block.content };
      }
      return { type: block.type || 'unknown' };
    });
  } else if (typeof content === 'string') {
    msg.blocks = [{ type: 'text', text: content }];
  }

  return msg;
}

// ---------------------------------------------------------------------------
// List all project directories
// ---------------------------------------------------------------------------
function listProjectDirs() {
  try {
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({
        dirName: e.name,
        dirPath: path.join(PROJECTS_DIR, e.name),
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Gemini stats helpers
// ---------------------------------------------------------------------------
function findGeminiSessionFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findGeminiSessionFiles(fullPath));
      } else if (entry.name.startsWith('session-') && entry.name.endsWith('.json')) {
        results.push(fullPath);
      }
    }
  } catch { /* directory doesn't exist */ }
  return results;
}

function readGeminiProjectRoots() {
  try {
    const data = JSON.parse(fs.readFileSync(GEMINI_PROJECTS_PATH, 'utf-8'));
    return Object.keys(data.projects || {});
  } catch {
    return [];
  }
}

function collectKnownProjectPaths() {
  const known = new Set(readGeminiProjectRoots());

  known.add(os.homedir());

  for (const { dirPath } of listProjectDirs()) {
    const projectPath = getProjectPath(dirPath);
    if (projectPath) known.add(projectPath);
  }

  for (const cp of getCodexProjects()) {
    if (cp.projectPath) known.add(cp.projectPath);
  }

  return Array.from(known).sort((a, b) => b.length - a.length);
}

function buildGeminiProjectPathMap(knownPaths) {
  const pathMap = new Map();
  for (const projectPath of knownPaths) {
    const projectHash = crypto.createHash('sha256').update(projectPath).digest('hex');
    pathMap.set(projectHash, projectPath);
  }
  return pathMap;
}

function resolveGeminiProjectPath(projectHash, sessionData, knownPaths, hashToPath) {
  if (projectHash && hashToPath.has(projectHash)) {
    return hashToPath.get(projectHash);
  }

  if (!sessionData || !Array.isArray(sessionData.messages)) {
    return projectHash ? `gemini:${projectHash}` : 'unknown';
  }

  for (const message of sessionData.messages) {
    if (!Array.isArray(message.toolCalls)) continue;
    for (const toolCall of message.toolCalls) {
      const filePath = toolCall && toolCall.args && toolCall.args.file_path;
      if (!filePath || !path.isAbsolute(filePath)) continue;

      const matchedRoot = knownPaths.find(projectPath =>
        filePath === projectPath || filePath.startsWith(projectPath + path.sep)
      );
      if (matchedRoot) return matchedRoot;
    }
  }

  return projectHash ? `gemini:${projectHash}` : 'unknown';
}

// ---------------------------------------------------------------------------
// Extract file changes (Edit/Write operations) from parsed messages
// ---------------------------------------------------------------------------
function extractFileChanges(messages) {
  const fileMap = new Map(); // file path -> { operations: [], changeCount }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type !== 'assistant' || !msg.blocks) continue;

    for (const block of msg.blocks) {
      if (block.type !== 'tool_use') continue;
      if (block.name !== 'Edit' && block.name !== 'Write') continue;

      const input = block.input || {};
      const filePath = input.file_path;
      if (!filePath) continue;

      const op = {
        type: block.name === 'Edit' ? 'edit' : 'write',
        timestamp: msg.timestamp || null,
        messageIndex: i,
      };

      if (block.name === 'Edit') {
        op.oldString = input.old_string || '';
        op.newString = input.new_string || '';
      } else {
        // Write operation
        op.content = input.content || '';
      }

      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, { file: filePath, changeCount: 0, operations: [] });
      }
      const entry = fileMap.get(filePath);
      entry.changeCount++;
      entry.operations.push(op);
    }
  }

  return Array.from(fileMap.values());
}

// ---------------------------------------------------------------------------
// Codex data source helpers
// ---------------------------------------------------------------------------

/**
 * Read the Codex session_index.jsonl to build a map of session ID -> thread_name.
 */
function readCodexSessionIndex() {
  const indexMap = new Map(); // id -> { thread_name, updated_at }
  try {
    if (!fs.existsSync(CODEX_INDEX_PATH)) return indexMap;
    const content = fs.readFileSync(CODEX_INDEX_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.id) {
          indexMap.set(obj.id, {
            thread_name: obj.thread_name || null,
            updated_at: obj.updated_at || null,
          });
        }
      } catch { /* skip bad lines */ }
    }
  } catch { /* index file doesn't exist or unreadable */ }
  return indexMap;
}

/**
 * Recursively find all .jsonl files under ~/.codex/sessions/.
 */
function findCodexJsonlFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findCodexJsonlFiles(fullPath));
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  } catch { /* directory doesn't exist */ }
  return results;
}

/**
 * Extract session ID (UUID) from a Codex filename like rollout-1234567890-abcd-efgh.jsonl.
 * The UUID is everything after the second hyphen-separated segment (timestamp).
 */
function codexSessionIdFromPath(filePath) {
  const base = path.basename(filePath, '.jsonl');
  // Format: rollout-<timestamp>-<uuid>
  // The UUID part may itself contain hyphens, so we split on 'rollout-' prefix
  // and then strip the timestamp portion
  const match = base.match(/^rollout-\d+-(.+)$/);
  return match ? match[1] : base;
}

/**
 * Read lightweight Codex session info needed for grouping and model stats.
 * Newer Codex logs record the actual model in turn_context instead of session_meta.
 * Returns { cwd, model, cli_version } or null.
 */
function readCodexSessionHead(filePath) {
  const cacheKey = 'codex-head:' + filePath;
  let stat;
  try { stat = fs.statSync(filePath); } catch { return null; }

  const cached = sessionCache.get(cacheKey);
  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.data;
  }

  try {
    // Read in chunks (up to 256KB) instead of the entire file
    const CHUNK_SIZE = 262144;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(CHUNK_SIZE, stat.size));
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const lines = buf.toString('utf-8', 0, bytesRead).split('\n');

    let cwd = null;
    let model = null;
    let cliVersion = null;

    for (const line of lines) {
      if (!line.trim()) continue;

      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (obj.type === 'session_meta' && obj.payload) {
        cwd = obj.payload.cwd || cwd;
        model = obj.payload.model || model;
        cliVersion = obj.payload.cli_version || cliVersion;
      } else if (obj.type === 'turn_context' && obj.payload) {
        model =
          obj.payload.model ||
          (obj.payload.collaboration_mode &&
            obj.payload.collaboration_mode.settings &&
            obj.payload.collaboration_mode.settings.model) ||
          model;
      }

      if (cwd && model && cliVersion) break;
    }

    const head = { cwd, model, cli_version: cliVersion };
    sessionCache.set(cacheKey, { mtime: stat.mtimeMs, data: head });
    return head;
  } catch { /* ignore */ }
  return null;
}

/**
 * List Codex sessions grouped by cwd (project).
 * Returns an array of { projectId, projectPath, sessions[] }.
 * Each session: { sessionId, filePath, displayName, modified, ... }
 */
function listCodexProjects() {
  if (!fs.existsSync(CODEX_SESSIONS_DIR)) return [];

  const indexMap = readCodexSessionIndex();
  const files = findCodexJsonlFiles(CODEX_SESSIONS_DIR);
  const projectMap = new Map(); // cwd -> { sessions[] }

  for (const filePath of files) {
    const sessionId = codexSessionIdFromPath(filePath);
    const head = readCodexSessionHead(filePath);
    const cwd = (head && head.cwd) || 'unknown';

    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }

    const indexEntry = indexMap.get(sessionId) || {};
    const displayName = indexEntry.thread_name || null;
    const modified = indexEntry.updated_at || stat.mtime.toISOString();

    if (!projectMap.has(cwd)) {
      projectMap.set(cwd, []);
    }
    projectMap.get(cwd).push({
      sessionId,
      filePath,
      displayName,
      modified,
      model: head ? head.model : null,
    });
  }

  const projects = [];
  for (const [cwd, sessions] of projectMap) {
    // Generate a project ID that won't collide with Claude project IDs
    const projectId = 'codex:' + cwd.replace(/\//g, '-').replace(/^-/, '');
    projects.push({
      projectId,
      projectPath: cwd,
      sessions,
    });
  }
  return projects;
}

// Codex project cache: projectId -> { sessions[] }
const codexProjectCache = new Map();
let codexProjectCacheTime = 0;
const CODEX_CACHE_TTL = 30000; // 30 seconds

function getCodexProjects() {
  const now = Date.now();
  if (now - codexProjectCacheTime < CODEX_CACHE_TTL && codexProjectCache.size > 0) {
    return Array.from(codexProjectCache.values());
  }
  const projects = listCodexProjects();
  codexProjectCache.clear();
  for (const p of projects) {
    codexProjectCache.set(p.projectId, p);
  }
  codexProjectCacheTime = now;
  return projects;
}

/**
 * Extract session metadata for a Codex session (for sessions-full listing).
 */
function extractCodexSessionMeta(filePath, sessionId, displayName) {
  const cacheKey = 'codex:' + filePath;
  let stat;
  try { stat = fs.statSync(filePath); } catch { return null; }

  const sidecarPath = path.join(CODEX_SESSIONS_DIR, 'session-meta', `${sessionId}.json`);
  let sidecarMtime = 0;
  try { sidecarMtime = fs.statSync(sidecarPath).mtimeMs; } catch { /* no sidecar */ }

  const cached = sessionCache.get(cacheKey);
  if (cached && cached.mtime === stat.mtimeMs && cached.sidecarMtime === sidecarMtime) {
    return cached.data;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let firstPrompt = null;
    let created = null;
    let modified = null;
    let messageCount = 0;
    let model = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (obj.type === 'session_meta' && obj.payload) {
        model = obj.payload.model || model;
        continue;
      }

      if (obj.type === 'turn_context' && obj.payload) {
        model =
          obj.payload.model ||
          (obj.payload.collaboration_mode &&
            obj.payload.collaboration_mode.settings &&
            obj.payload.collaboration_mode.settings.model) ||
          model;
      }

      if (obj.type === 'event_msg' && obj.payload) {
        const p = obj.payload;
        // Track timestamps from event_msg
        if (obj.timestamp) {
          if (!created || obj.timestamp < created) created = obj.timestamp;
          if (!modified || obj.timestamp > modified) modified = obj.timestamp;
        }

        if (p.type === 'user_message') {
          messageCount++;
          if (!firstPrompt && p.message) {
            firstPrompt = typeof p.message === 'string' ? p.message : JSON.stringify(p.message);
          }
        } else if (p.type === 'agent_message') {
          messageCount++;
        }
      }
    }

    // Fallback timestamps from file stat
    if (!created) created = stat.birthtime.toISOString();
    if (!modified) modified = stat.mtime.toISOString();

    const sidecar = readSidecarMeta(CODEX_SESSIONS_DIR, sessionId);
    const meta = {
      sessionId,
      firstPrompt: firstPrompt || 'No prompt',
      customName: sidecar.customName || null,
      displayName: sidecar.customName || displayName || (firstPrompt ? firstPrompt.substring(0, 100) : 'Untitled'),
      messageCount,
      created,
      modified,
      gitBranch: null,
      projectPath: null,
      tags: sidecar.tags || [],
      isFavorite: sidecar.isFavorite || false,
      source: 'codex',
      model,
    };

    sessionCache.set(cacheKey, { mtime: stat.mtimeMs, sidecarMtime, data: meta });
    return meta;
  } catch {
    return null;
  }
}

/**
 * Parse messages from a Codex JSONL file into the internal format.
 */
/**
 * Parse Codex JSONL — transparent passthrough, no format conversion.
 * Returns raw Codex events with source: 'codex' marker.
 * Frontend handles rendering via separate Codex rendering path.
 */
function parseCodexMessages(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const rawEvents = [];
  let sessionMeta = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (obj.type === 'session_meta') {
      sessionMeta = obj.payload || {};
      continue;
    }

    // Pass through all event_msg and turn_context as-is
    if (obj.type === 'event_msg' || obj.type === 'turn_context') {
      rawEvents.push(obj);
    }
  }

  return { source: 'codex', sessionMeta, rawEvents, customNameFromJsonl: null };
}

/**
 * Check if a project ID is a Codex project.
 */
function isCodexProject(pid) {
  return pid.startsWith('codex:');
}

/**
 * Find the Codex JSONL file path for a given session ID.
 */
function findCodexSessionFile(sessionId) {
  const projects = getCodexProjects();
  for (const proj of projects) {
    for (const sess of proj.sessions) {
      if (sess.sessionId === sessionId) {
        return sess.filePath;
      }
    }
  }
  return null;
}

// ===========================================================================
// API ENDPOINTS
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. GET /api/projects
// ---------------------------------------------------------------------------
app.get('/api/projects', (req, res) => {
  try {
    const projectDirs = listProjectDirs();
    const projects = [];

    for (const { dirName, dirPath } of projectDirs) {
      const sessions = scanProjectSessions(dirPath);
      const sessionCount = sessions.length;
      if (sessionCount === 0) continue;

      const projectPath = getProjectPath(dirPath);
      const displayPath = projectPath || dirName.replace(/^-/, '/').replace(/-/g, '/');

      projects.push({
        id: dirName,
        name: displayPath,
        shortName: displayPath.split('/').filter(Boolean).slice(-2).join('/') || dirName,
        sessionCount,
        source: 'claude',
      });
    }

    // Merge Codex projects
    const codexProjects = getCodexProjects();
    for (const cp of codexProjects) {
      // Count only sessions with actual messages (consistent with sessions-full filter)
      var sessionCount = 0;
      for (const sess of cp.sessions) {
        const meta = extractCodexSessionMeta(sess.filePath, sess.sessionId, sess.displayName);
        if (meta && meta.messageCount > 0) sessionCount++;
      }
      if (sessionCount === 0) continue;

      const displayPath = cp.projectPath || 'unknown';
      projects.push({
        id: cp.projectId,
        name: displayPath,
        shortName: displayPath.split('/').filter(Boolean).slice(-2).join('/') || cp.projectId,
        sessionCount,
        source: 'codex',
      });
    }

    projects.sort((a, b) => b.sessionCount - a.sessionCount);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. GET /api/projects/:pid/sessions-full
// ---------------------------------------------------------------------------
app.get('/api/projects/:pid/sessions-full', (req, res) => {
  try {
    const pid = req.params.pid;

    // Handle Codex projects
    if (isCodexProject(pid)) {
      const codexProjects = getCodexProjects();
      const cp = codexProjects.find(p => p.projectId === pid);
      if (!cp) return res.json([]);

      const sessions = [];
      for (const sess of cp.sessions) {
        const meta = extractCodexSessionMeta(sess.filePath, sess.sessionId, sess.displayName);
        if (meta && meta.messageCount > 0) {
          sessions.push(meta);
        }
      }
      sessions.sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
      return res.json(sessions);
    }

    // Claude projects
    const projectDir = path.join(PROJECTS_DIR, pid);
    if (!fs.existsSync(projectDir)) return res.json([]);
    const sessions = scanProjectSessions(projectDir);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. GET /api/projects/:pid/sessions/:sid?page=1&pageSize=30
// ---------------------------------------------------------------------------
app.get('/api/projects/:pid/sessions/:sid', (req, res) => {
  try {
    const pid = req.params.pid;
    const sid = req.params.sid;

    // Handle Codex sessions
    if (isCodexProject(pid)) {
      const codexFile = findCodexSessionFile(sid);
      if (!codexFile || !fs.existsSync(codexFile)) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Transparent passthrough — no format conversion
      const { source, sessionMeta, rawEvents } = parseCodexMessages(codexFile);

      const sidecar = readSidecarMeta(CODEX_SESSIONS_DIR, sid);
      return res.json({
        source,
        sessionMeta,
        rawEvents,
        customName: sidecar.customName || null,
        tags: sidecar.tags || [],
        isFavorite: sidecar.isFavorite || false,
        totalMessages: rawEvents.filter(e => e.type === 'event_msg' && e.payload && (e.payload.type === 'user_message' || e.payload.type === 'agent_message')).length,
        page: 1,
        totalPages: 1,
      });
    }

    // Claude sessions
    const projectDir = path.join(PROJECTS_DIR, pid);
    const jsonlPath = path.join(projectDir, `${sid}.jsonl`);
    if (!fs.existsSync(jsonlPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { messages, customNameFromJsonl } = parseSessionMessages(jsonlPath);

    // Sidecar meta
    const sidecar = readSidecarMeta(projectDir, req.params.sid);
    const customName = sidecar.customName || customNameFromJsonl || null;
    const tags = sidecar.tags || [];
    const isFavorite = sidecar.isFavorite || false;

    // Extract file changes from all messages
    const fileChanges = extractFileChanges(messages);

    const totalMessages = messages.length;

    // Pagination: page 1 = most recent messages
    const pageParam = req.query.page ? parseInt(req.query.page, 10) : null;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 30;

    if (pageParam !== null && pageParam > 0) {
      const totalPages = Math.max(1, Math.ceil(totalMessages / pageSize));
      const page = Math.min(pageParam, totalPages);

      // page 1 = most recent, page N = oldest
      // Calculate the slice from the end
      const endIdx = totalMessages - (page - 1) * pageSize;
      const startIdx = Math.max(0, endIdx - pageSize);
      const sliced = messages.slice(startIdx, endIdx);

      return res.json({
        customName,
        tags,
        isFavorite,
        messages: sliced,
        fileChanges,
        totalMessages,
        page,
        pageSize,
        totalPages,
      });
    }

    // No pagination — return all
    res.json({
      customName,
      tags,
      isFavorite,
      messages,
      fileChanges,
      totalMessages,
      page: 1,
      pageSize: totalMessages,
      totalPages: 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. PUT /api/projects/:pid/sessions/:sid/meta
// ---------------------------------------------------------------------------
app.put('/api/projects/:pid/sessions/:sid/meta', (req, res) => {
  try {
    const pid = req.params.pid;
    const sid = req.params.sid;
    let sidecarDir;
    let cacheKey;

    if (isCodexProject(pid)) {
      const codexFile = findCodexSessionFile(sid);
      if (!codexFile) {
        return res.status(404).json({ error: 'Session not found' });
      }
      sidecarDir = CODEX_SESSIONS_DIR;
      cacheKey = 'codex:' + codexFile;
    } else {
      const projectDir = path.join(PROJECTS_DIR, pid);
      const jsonlPath = path.join(projectDir, `${sid}.jsonl`);
      if (!fs.existsSync(jsonlPath)) {
        return res.status(404).json({ error: 'Session not found' });
      }
      sidecarDir = projectDir;
      cacheKey = jsonlPath;
    }

    const { customName, tags, isFavorite } = req.body;
    const existing = readSidecarMeta(sidecarDir, sid);

    if (customName !== undefined) existing.customName = customName;
    if (tags !== undefined) existing.tags = tags;
    if (isFavorite !== undefined) existing.isFavorite = isFavorite;
    existing.updatedAt = new Date().toISOString();

    writeSidecarMeta(sidecarDir, sid, existing);

    // Invalidate cache for this session
    sessionCache.delete(cacheKey);

    res.json({ ok: true, meta: existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. GET /api/search?q=keyword&project=projectId
// ---------------------------------------------------------------------------
app.get('/api/search', (req, res) => {
  try {
    const query = (req.query.q || '').trim().toLowerCase();
    if (!query) {
      return res.status(400).json({ error: 'q parameter is required' });
    }

    const projectFilter = req.query.project || null;
    const MAX_RESULTS = 50;
    const results = [];

    const projectDirs = listProjectDirs();
    const targetDirs = projectFilter
      ? projectDirs.filter(p => p.dirName === projectFilter)
      : projectDirs;

    outer:
    for (const { dirName, dirPath } of targetDirs) {
      const projectPath = getProjectPath(dirPath);
      const projectName = projectPath || dirName.replace(/^-/, '/').replace(/-/g, '/');

      let files;
      try {
        files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      } catch { continue; }

      for (const file of files) {
        if (results.length >= MAX_RESULTS) break outer;

        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(dirPath, file);
        let content;
        try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }

        // Get session display name
        const sidecar = readSidecarMeta(dirPath, sessionId);
        let sessionName = sidecar.customName || null;

        for (const line of content.split('\n')) {
          if (results.length >= MAX_RESULTS) break;
          if (!line.trim()) continue;

          let obj;
          try { obj = JSON.parse(line); } catch { continue; }

          // Extract rename for session name fallback
          if (!sessionName && obj.type === 'system' && obj.subtype === 'local_command' &&
              typeof obj.content === 'string' && obj.content.includes('Session renamed to:')) {
            const match = obj.content.match(/Session renamed to:\s*(.+?)(?:<|$)/);
            if (match) sessionName = match[1].trim();
          }

          let searchText = null;

          if (obj.type === 'user' && obj.message && !obj.isMeta) {
            const c = obj.message.content;
            if (typeof c === 'string') {
              searchText = stripXmlTags(c);
            } else if (Array.isArray(c)) {
              searchText = stripXmlTags(
                c.filter(b => b.type === 'text').map(b => b.text).join('\n')
              );
            }
          } else if (obj.type === 'assistant' && obj.message) {
            const c = obj.message.content;
            if (Array.isArray(c)) {
              searchText = c
                .filter(b => b.type === 'text')
                .map(b => b.text)
                .join('\n');
            } else if (typeof c === 'string') {
              searchText = c;
            }
          }

          if (searchText) {
            const lowerText = searchText.toLowerCase();
            const idx = lowerText.indexOf(query);
            if (idx !== -1) {
              const contextStart = Math.max(0, idx - 50);
              const contextEnd = Math.min(searchText.length, idx + query.length + 50);
              const matchContext = (contextStart > 0 ? '...' : '') +
                searchText.substring(contextStart, contextEnd) +
                (contextEnd < searchText.length ? '...' : '');

              results.push({
                projectId: dirName,
                projectName,
                sessionId,
                sessionName: sessionName || sessionId.substring(0, 8),
                matchContext,
                timestamp: obj.timestamp || null,
              });
            }
          }
        }
      }
    }

    // Search Codex sessions
    if (results.length < MAX_RESULTS) {
      const codexProjects = getCodexProjects();
      const targetCodex = projectFilter
        ? codexProjects.filter(p => p.projectId === projectFilter)
        : codexProjects;

      outerCodex:
      for (const cp of targetCodex) {
        for (const sess of cp.sessions) {
          if (results.length >= MAX_RESULTS) break outerCodex;

          let content;
          try { content = fs.readFileSync(sess.filePath, 'utf-8'); } catch { continue; }

          for (const line of content.split('\n')) {
            if (results.length >= MAX_RESULTS) break;
            if (!line.trim()) continue;

            let obj;
            try { obj = JSON.parse(line); } catch { continue; }

            if (obj.type !== 'event_msg' || !obj.payload) continue;
            const p = obj.payload;
            let searchText = null;

            if (p.type === 'user_message' && p.message) {
              searchText = typeof p.message === 'string' ? p.message : JSON.stringify(p.message);
            } else if (p.type === 'agent_message' && p.message) {
              searchText = typeof p.message === 'string' ? p.message : JSON.stringify(p.message);
            }

            if (searchText) {
              const lowerText = searchText.toLowerCase();
              const idx = lowerText.indexOf(query);
              if (idx !== -1) {
                const contextStart = Math.max(0, idx - 50);
                const contextEnd = Math.min(searchText.length, idx + query.length + 50);
                const matchContext = (contextStart > 0 ? '...' : '') +
                  searchText.substring(contextStart, contextEnd) +
                  (contextEnd < searchText.length ? '...' : '');

                results.push({
                  projectId: cp.projectId,
                  projectName: cp.projectPath,
                  sessionId: sess.sessionId,
                  sessionName: sess.displayName || sess.sessionId.substring(0, 8),
                  matchContext,
                  timestamp: obj.timestamp || null,
                });
              }
            }
          }
        }
      }
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. GET /api/stats?project=projectId
// ---------------------------------------------------------------------------
app.get('/api/stats', (req, res) => {
  try {
    const projectFilter = req.query.project || null;
    const geminiProjectFilter = projectFilter && projectFilter.startsWith('gemini:') ? projectFilter : null;
    const projectDirs = listProjectDirs();
    const targetDirs = projectFilter && !isCodexProject(projectFilter) && !geminiProjectFilter
      ? projectDirs.filter(p => p.dirName === projectFilter)
      : (!projectFilter ? projectDirs : []);

    const totalTokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
    let totalSessions = 0;
    let totalMessages = 0;

    const dailyMap = new Map(); // date string -> { input, output }
    const byProjectMap = new Map(); // projectId -> { projectName, input, output, source }
    const byModelMap = new Map(); // model -> { count, output }

    // Determine the 30-day window
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const { dirName, dirPath } of targetDirs) {
      const projectPath = getProjectPath(dirPath);
      const projectName = projectPath || dirName.replace(/^-/, '/').replace(/-/g, '/');

      let files;
      try {
        files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      } catch { continue; }

      let projectInput = 0;
      let projectOutput = 0;
      let projectSessionCount = 0;

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        let content;
        try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }

        let sessionHasMessages = false;

        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          let obj;
          try { obj = JSON.parse(line); } catch { continue; }

          // Count user + assistant messages
          if ((obj.type === 'user' && obj.message && !obj.isMeta) ||
              (obj.type === 'assistant' && obj.message)) {
            totalMessages++;
            sessionHasMessages = true;
          }

          // Aggregate usage from assistant messages
          if (obj.type === 'assistant' && obj.message && obj.message.usage) {
            const usage = obj.message.usage;
            const inputTok = usage.input_tokens || 0;
            const outputTok = usage.output_tokens || 0;
            const cachCreation = usage.cache_creation_input_tokens || 0;
            const cachRead = usage.cache_read_input_tokens || 0;

            totalTokens.input += inputTok;
            totalTokens.output += outputTok;
            totalTokens.cacheCreation += cachCreation;
            totalTokens.cacheRead += cachRead;

            projectInput += inputTok;
            projectOutput += outputTok;

            // Daily aggregation (last 30 days only)
            if (obj.timestamp) {
              const ts = new Date(obj.timestamp);
              if (ts >= thirtyDaysAgo) {
                const dateStr = ts.toISOString().split('T')[0];
                const existing = dailyMap.get(dateStr) || { input: 0, output: 0 };
                existing.input += inputTok;
                existing.output += outputTok;
                dailyMap.set(dateStr, existing);
              }
            }

            // By model
            const model = obj.message.model || 'unknown';
            const modelEntry = byModelMap.get(model) || { count: 0, input: 0, output: 0 };
            modelEntry.count += 1;
            modelEntry.input += inputTok;
            modelEntry.output += outputTok;
            byModelMap.set(model, modelEntry);
          }
        }

        if (sessionHasMessages) {
          projectSessionCount++;
        }
      }

      totalSessions += projectSessionCount;

      if (projectInput > 0 || projectOutput > 0) {
        byProjectMap.set(dirName, {
          projectId: dirName,
          projectName,
          input: projectInput,
          output: projectOutput,
          source: 'claude',
        });
      }
    }

    // Aggregate Codex stats
    const codexProjects = getCodexProjects();
    const targetCodexStats = projectFilter && !geminiProjectFilter
      ? codexProjects.filter(p => p.projectId === projectFilter)
      : (!projectFilter ? codexProjects : []);

    for (const cp of targetCodexStats) {
      let projectInput = 0;
      let projectOutput = 0;
      let projectSessionCount = 0;

      for (const sess of cp.sessions) {
        let content;
        try { content = fs.readFileSync(sess.filePath, 'utf-8'); } catch { continue; }

        let sessionHasMessages = false;

        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          let obj;
          try { obj = JSON.parse(line); } catch { continue; }

          if (obj.type === 'event_msg' && obj.payload) {
            const p = obj.payload;
            if (p.type === 'user_message' || p.type === 'agent_message') {
              totalMessages++;
              sessionHasMessages = true;
            }

            if (p.type === 'token_count' && p.info && p.info.total_token_usage) {
              const u = p.info.total_token_usage;
              const inputTok = u.input_tokens || 0;
              const outputTok = u.output_tokens || 0;
              const cachRead = u.cached_input_tokens || 0;

              totalTokens.input += inputTok;
              totalTokens.output += outputTok;
              totalTokens.cacheRead += cachRead;

              projectInput += inputTok;
              projectOutput += outputTok;

              // Daily aggregation
              if (obj.timestamp) {
                const ts = new Date(obj.timestamp);
                if (ts >= thirtyDaysAgo) {
                  const dateStr = ts.toISOString().split('T')[0];
                  const existing = dailyMap.get(dateStr) || { input: 0, output: 0 };
                  existing.input += inputTok;
                  existing.output += outputTok;
                  dailyMap.set(dateStr, existing);
                }
              }

              // By model
              const model = sess.model || 'unknown';
              const modelEntry = byModelMap.get(model) || { count: 0, input: 0, output: 0 };
              modelEntry.count += 1;
              modelEntry.input += inputTok;
              modelEntry.output += outputTok;
              byModelMap.set(model, modelEntry);
            }
          }
        }

        if (sessionHasMessages) {
          projectSessionCount++;
        }
      }

      totalSessions += projectSessionCount;

      if (projectInput > 0 || projectOutput > 0) {
        byProjectMap.set(cp.projectId, {
          projectId: cp.projectId,
          projectName: cp.projectPath,
          input: projectInput,
          output: projectOutput,
          source: 'codex',
        });
      }
    }

    // Aggregate Gemini stats
    if (!projectFilter || geminiProjectFilter) {
      const knownProjectPaths = collectKnownProjectPaths();
      const geminiProjectPathMap = buildGeminiProjectPathMap(knownProjectPaths);
      const geminiSessionFiles = findGeminiSessionFiles(GEMINI_TMP_DIR);

      for (const filePath of geminiSessionFiles) {
        let sessionData;
        try { sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { continue; }

        const projectHash = sessionData.projectHash || null;
        const projectId = 'gemini:' + (projectHash || sessionData.sessionId || path.basename(filePath, '.json'));
        if (geminiProjectFilter && projectId !== geminiProjectFilter) continue;

        const projectPath = resolveGeminiProjectPath(projectHash, sessionData, knownProjectPaths, geminiProjectPathMap);
        const messages = Array.isArray(sessionData.messages) ? sessionData.messages : [];

        let projectInput = 0;
        let projectOutput = 0;
        let sessionHasMessages = false;

        for (const msg of messages) {
          if (msg.type === 'user' || msg.type === 'gemini') {
            totalMessages++;
            sessionHasMessages = true;
          }

          if (msg.type === 'gemini' && msg.tokens) {
            const tokens = msg.tokens;
            const inputTok = tokens.input || 0;
            const outputTok = tokens.output || 0;
            const cacheRead = tokens.cached || 0;

            totalTokens.input += inputTok;
            totalTokens.output += outputTok;
            totalTokens.cacheRead += cacheRead;

            projectInput += inputTok;
            projectOutput += outputTok;

            if (msg.timestamp) {
              const ts = new Date(msg.timestamp);
              if (ts >= thirtyDaysAgo) {
                const dateStr = ts.toISOString().split('T')[0];
                const existing = dailyMap.get(dateStr) || { input: 0, output: 0 };
                existing.input += inputTok;
                existing.output += outputTok;
                dailyMap.set(dateStr, existing);
              }
            }

            const model = msg.model || 'unknown';
            const modelEntry = byModelMap.get(model) || { count: 0, input: 0, output: 0 };
            modelEntry.count += 1;
            modelEntry.input += inputTok;
            modelEntry.output += outputTok;
            byModelMap.set(model, modelEntry);
          }
        }

        if (sessionHasMessages) {
          totalSessions++;
        }

        if (projectInput > 0 || projectOutput > 0) {
          const existingProject = byProjectMap.get(projectId);
          if (existingProject) {
            existingProject.input += projectInput;
            existingProject.output += projectOutput;
          } else {
            byProjectMap.set(projectId, {
              projectId,
              projectName: projectPath,
              input: projectInput,
              output: projectOutput,
              source: 'gemini',
            });
          }
        }
      }
    }

    // Build daily array sorted by date
    const daily = Array.from(dailyMap.entries())
      .map(([date, vals]) => ({ date, input: vals.input, output: vals.output }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Build byProject array sorted by total descending
    const byProject = Array.from(byProjectMap.values())
      .sort((a, b) => (b.input + b.output) - (a.input + a.output));

    // Build byModel array sorted by count descending
    const byModel = Array.from(byModelMap.entries())
      .map(([model, vals]) => ({ model, count: vals.count, input: vals.input, output: vals.output }))
      .sort((a, b) => b.count - a.count);

    res.json({
      totalTokens,
      totalSessions,
      totalMessages,
      daily,
      byProject,
      byModel,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 7. GET /api/timeline?months=3
// ---------------------------------------------------------------------------
app.get('/api/timeline', (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 3, 1), 12);
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - months);

    const projectDirs = listProjectDirs();
    const dayMap = new Map(); // "YYYY-MM-DD" -> { sessionCount, messageCount, totalTokens, sessions[] }

    for (const { dirName, dirPath } of projectDirs) {
      const projectPath = getProjectPath(dirPath);
      const projectName = projectPath || dirName.replace(/^-/, '/').replace(/-/g, '/');
      const shortName = (projectPath || dirName).split('/').filter(Boolean).slice(-2).join('/') || dirName;

      const sessions = scanProjectSessions(dirPath);

      for (const session of sessions) {
        // Use the session's created date to place it on the timeline
        const dateStr = session.created
          ? new Date(session.created).toISOString().split('T')[0]
          : (session.modified ? new Date(session.modified).toISOString().split('T')[0] : null);
        if (!dateStr) continue;

        const sessionDate = new Date(dateStr);
        if (sessionDate < startDate || sessionDate > endDate) continue;

        if (!dayMap.has(dateStr)) {
          dayMap.set(dateStr, { sessionCount: 0, messageCount: 0, totalTokens: 0, sessions: [] });
        }
        const day = dayMap.get(dateStr);
        day.sessionCount++;
        day.messageCount += session.messageCount || 0;
        day.sessions.push({
          sessionId: session.sessionId,
          projectId: dirName,
          projectName: shortName,
          title: session.customName || session.displayName || 'Untitled',
          messageCount: session.messageCount || 0,
        });
      }
    }

    // Add Codex sessions to the timeline
    const codexProjectsTimeline = getCodexProjects();
    for (const cp of codexProjectsTimeline) {
      const shortName = cp.projectPath.split('/').filter(Boolean).slice(-2).join('/') || cp.projectId;

      for (const sess of cp.sessions) {
        const meta = extractCodexSessionMeta(sess.filePath, sess.sessionId, sess.displayName);
        if (!meta || meta.messageCount === 0) continue;

        const dateStr = meta.created
          ? new Date(meta.created).toISOString().split('T')[0]
          : (meta.modified ? new Date(meta.modified).toISOString().split('T')[0] : null);
        if (!dateStr) continue;

        const sessionDate = new Date(dateStr);
        if (sessionDate < startDate || sessionDate > endDate) continue;

        if (!dayMap.has(dateStr)) {
          dayMap.set(dateStr, { sessionCount: 0, messageCount: 0, totalTokens: 0, sessions: [] });
        }
        const day = dayMap.get(dateStr);
        day.sessionCount++;
        day.messageCount += meta.messageCount || 0;
        day.sessions.push({
          sessionId: sess.sessionId,
          projectId: cp.projectId,
          projectName: shortName,
          title: meta.displayName || 'Untitled',
          messageCount: meta.messageCount || 0,
        });
      }
    }

    // Aggregate token usage per day by scanning JSONL files
    for (const { dirPath } of projectDirs) {
      let files;
      try {
        files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      } catch { continue; }

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        let content;
        try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }

        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          let obj;
          try { obj = JSON.parse(line); } catch { continue; }

          if (obj.type === 'assistant' && obj.message && obj.message.usage && obj.timestamp) {
            const ts = new Date(obj.timestamp);
            if (ts < startDate || ts > endDate) continue;
            const dateStr = ts.toISOString().split('T')[0];
            if (dayMap.has(dateStr)) {
              const usage = obj.message.usage;
              dayMap.get(dateStr).totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
            }
          }
        }
      }
    }

    const days = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      days,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 8. GET /api/tags
// ---------------------------------------------------------------------------
app.get('/api/tags', (req, res) => {
  try {
    const allTags = new Set();
    const projectDirs = listProjectDirs();

    for (const { dirPath } of projectDirs) {
      const metaDir = path.join(dirPath, 'session-meta');
      let metaFiles;
      try {
        metaFiles = fs.readdirSync(metaDir).filter(f => f.endsWith('.json'));
      } catch { continue; }

      for (const mf of metaFiles) {
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(metaDir, mf), 'utf-8'));
          if (Array.isArray(meta.tags)) {
            for (const tag of meta.tags) {
              if (typeof tag === 'string' && tag.trim()) {
                allTags.add(tag.trim());
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    res.json({ tags: Array.from(allTags).sort() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 9. GET /api/prompts
// ---------------------------------------------------------------------------
app.get('/api/prompts', (req, res) => {
  try {
    const projectFilter = req.query.project || null;
    const sessionFilter = req.query.session || null;
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 50;

    const projectDirs = listProjectDirs();
    const targetDirs = projectFilter
      ? projectDirs.filter(p => p.dirName === projectFilter)
      : projectDirs;

    const allPrompts = [];

    for (const { dirName, dirPath } of targetDirs) {
      const projectPath = getProjectPath(dirPath);
      const projectName = projectPath || dirName.replace(/^-/, '/').replace(/-/g, '/');

      let files;
      try {
        files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      } catch { continue; }

      if (sessionFilter) {
        files = files.filter(f => f === `${sessionFilter}.jsonl`);
      }

      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(dirPath, file);
        let content;
        try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }

        // Get session display name
        const sidecar = readSidecarMeta(dirPath, sessionId);
        let sessionName = sidecar.customName || null;

        for (const line of content.split('\n')) {
          if (!line.trim()) continue;

          let obj;
          try { obj = JSON.parse(line); } catch { continue; }

          if (!sessionName && obj.type === 'system' && obj.subtype === 'local_command' &&
              typeof obj.content === 'string' && obj.content.includes('Session renamed to:')) {
             const match = obj.content.match(/Session renamed to:\\s*(.+?)(?:<|$)/);
             if (match) sessionName = match[1].trim();
          }

          if (obj.type === 'user' && obj.message && !obj.isMeta) {
            let text = null;
            const c = obj.message.content;
            if (typeof c === 'string') {
              text = stripXmlTags(c);
            } else if (Array.isArray(c)) {
              text = stripXmlTags(
                c.filter(b => b.type === 'text').map(b => b.text).join('\n')
              );
            }

            if (text) {
              allPrompts.push({
                projectId: dirName,
                projectName,
                sessionId,
                sessionName: sessionName || sessionId.substring(0, 8),
                text,
                timestamp: obj.timestamp || null,
              });
            }
          }
        }
      }
    }

    // Add Codex prompts
    const codexProjectsPrompts = getCodexProjects();
    const targetCodexPrompts = projectFilter
      ? codexProjectsPrompts.filter(p => p.projectId === projectFilter)
      : codexProjectsPrompts;

    for (const cp of targetCodexPrompts) {
      for (const sess of cp.sessions) {
        if (sessionFilter && sess.sessionId !== sessionFilter) continue;

        let content;
        try { content = fs.readFileSync(sess.filePath, 'utf-8'); } catch { continue; }

        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          let obj;
          try { obj = JSON.parse(line); } catch { continue; }

          if (obj.type === 'event_msg' && obj.payload && obj.payload.type === 'user_message') {
            const text = typeof obj.payload.message === 'string'
              ? obj.payload.message
              : JSON.stringify(obj.payload.message);
            if (text) {
              allPrompts.push({
                projectId: cp.projectId,
                projectName: cp.projectPath,
                sessionId: sess.sessionId,
                sessionName: sess.displayName || sess.sessionId.substring(0, 8),
                text,
                timestamp: obj.timestamp || null,
              });
            }
          }
        }
      }
    }

    // Sort globally by timestamp, newest first
    allPrompts.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    const total = allPrompts.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const paginated = allPrompts.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      prompts: paginated,
      total,
      page,
      pageSize,
      totalPages
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================================
// Start server
// ===========================================================================
app.listen(PORT, () => {
  console.log(`CLI History Hub running at http://localhost:${PORT}`);
  console.log(`Reading data from: ${CLAUDE_DIR}`);
  if (fs.existsSync(CODEX_DIR)) {
    console.log(`Reading Codex data from: ${CODEX_DIR}`);
  }
});
