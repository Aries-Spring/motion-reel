// ElevenLabs tools for the motion-reel skill, as a local MCP server (stdio, Node 18+, no dependencies).
//
// Tools: quota, voices, tts (cached takes + forced alignment), transcribe (Scribe speech-to-text).
// The API key is the plugin option `elevenlabs_api_key` (plugin.json userConfig, sensitive: stored in
// the OS credential store), which Claude Code hands to this process as MOTION_REEL_ELEVENLABS_KEY.
// The key is sent only to api.elevenlabs.io, in the xi-api-key header, and is never written to disk.
// Everything the tools write goes under the film directory the caller names.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

const API = 'https://api.elevenlabs.io/v1';
const VERSION = '1.1.0';
const configured = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('${');
const KEY = configured(process.env.MOTION_REEL_ELEVENLABS_KEY) ? process.env.MOTION_REEL_ELEVENLABS_KEY : '';
const NO_KEY = 'No ElevenLabs API key is set for the motion-reel plugin. In Claude Code run '
  + '/plugin configure motion-reel (or /plugin > Installed > motion-reel > Configure options), paste the key '
  + 'into "ElevenLabs API key", then /reload-plugins.';

// ---------------------------------------------------------------- ElevenLabs

async function el(route, { method = 'GET', json, form } = {}) {
  if (!KEY) throw new Error(NO_KEY);
  const headers = { 'xi-api-key': KEY };
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const r = await fetch(`${API}${route}`, { method, headers, body });
  const text = await r.text();
  if (!r.ok) throw new Error(`ElevenLabs ${r.status} on ${route}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const fileForm = (fields, file) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  f.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  return f;
};

// v4 audio tags like [excited] or [whispers] steer delivery; they aren't spoken, so not aligned
const spoken = (t) => t.replace(/\[[^\]]*\]\s*/g, '');
const abs = (p) => path.resolve(p);

async function voiceId(name) {
  if (/^[A-Za-z0-9]{20}$/.test(name)) return name;
  const { voices } = await el('/voices');
  const v = voices.find((x) => x.name.split(' ')[0].toLowerCase() === name.toLowerCase() || x.name.toLowerCase() === name.toLowerCase());
  if (!v) throw new Error(`no voice named "${name}"; call the voices tool`);
  return v.voice_id;
}

// ---------------------------------------------------------------- tools

const TOOLS = {
  quota: {
    description: 'ElevenLabs plan and characters left this month. Check before requesting takes: free-tier keys can use premade voices only and run at most 2 requests at once.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const d = await el('/user/subscription');
      return `${d.tier}: ${d.character_limit - d.character_count} of ${d.character_limit} characters left this month`;
    },
  },
  voices: {
    description: 'Voices this ElevenLabs key can use (id, name, category, gender, age, accent).',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const { voices } = await el('/voices');
      return voices.map((v) => {
        const l = v.labels || {};
        return `${v.voice_id}  ${v.name}  [${v.category || ''}] ${l.gender || ''} ${l.age || ''} ${l.accent || ''}`.trim();
      }).join('\n');
    },
  },
  tts: {
    description: 'Record one voice-over take into <film_dir>/audio/vo/<take>.mp3 with character timestamps (<take>.json) '
      + 'and a forced alignment of the take against its own audio (<take>.fa.json, which the edit and lip sync use). '
      + 'Takes are cached: an existing take is never re-requested (delete its files to redo it). Returns the aligned words.',
    inputSchema: {
      type: 'object',
      required: ['film_dir', 'voice'],
      properties: {
        film_dir: { type: 'string', description: 'Absolute path of the film directory' },
        voice: { type: 'string', description: 'Premade voice name (first word, e.g. "bill") or a voice id' },
        script_path: { type: 'string', description: 'Absolute path of the script text file (default <film_dir>/audio/script.txt)' },
        text: { type: 'string', description: 'The line itself, instead of script_path' },
        take: { type: 'string', description: 'Take name (default <voice>_<hash of the settings>)' },
        language: { type: 'string', description: 'ISO 639-1 code for eleven_v4, e.g. ur, hi, ar' },
        model: { type: 'string', default: 'eleven_v4' },
        speed: { type: 'number', default: 1.0 },
        stability: { type: 'number', default: 0.5 },
      },
    },
    async run(a) {
      const film = abs(a.film_dir);
      const text = (a.text ?? fs.readFileSync(abs(a.script_path || path.join(film, 'audio', 'script.txt')), 'utf8')).trim();
      const model = a.model || 'eleven_v4';
      const settings = { stability: a.stability ?? 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: a.speed ?? 1.0 };
      const sig = crypto.createHash('sha1').update(JSON.stringify([text, a.voice, model, a.language || null, settings])).digest('hex').slice(0, 8);
      const take = a.take || `${a.voice.toLowerCase()}_${sig}`;
      const dir = path.join(film, 'audio', 'vo');
      fs.mkdirSync(dir, { recursive: true });
      const mp3 = path.join(dir, `${take}.mp3`), meta = path.join(dir, `${take}.json`), fa = path.join(dir, `${take}.fa.json`);
      const log = [];
      if (!(fs.existsSync(mp3) && fs.existsSync(meta))) {
        const vid = await voiceId(a.voice);
        const body = { text, model_id: model, voice_settings: settings, ...(a.language ? { language_code: a.language } : {}) };
        const d = await el(`/text-to-speech/${vid}/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', json: body });
        fs.writeFileSync(mp3, Buffer.from(d.audio_base64, 'base64'));
        fs.writeFileSync(meta, JSON.stringify({ text, voice: a.voice, voice_id: vid, model, language: a.language || null, settings, alignment: d.alignment }, null, 1));
        const ends = d.alignment?.character_end_times_seconds || [0];
        log.push(`recorded ${mp3} (${text.length} chars, speech ends ${ends[ends.length - 1].toFixed(2)} s)`);
      } else {
        log.push(`cached: ${mp3}`);
      }
      if (!fs.existsSync(fa)) {
        fs.writeFileSync(fa, JSON.stringify(await el('/forced-alignment', { method: 'POST', form: fileForm({ text: spoken(text) }, mp3) }), null, 1));
        log.push(`aligned -> ${fa}`);
      }
      const words = JSON.parse(fs.readFileSync(fa, 'utf8')).words.filter((w) => w.text.replace(/[\s—-]/g, ''));
      log.push(words.map((w, i) => `${i}:${w.text} ${w.start.toFixed(2)}`).join(' | '));
      return log.join('\n');
    },
  },
  transcribe: {
    description: 'Transcribe audio files (takes or the final mix) with ElevenLabs Scribe, to check every word, the brand name above all, comes through.',
    inputSchema: {
      type: 'object',
      required: ['paths'],
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of audio files' },
        language: { type: 'string', description: 'ISO 639-1/-3 code (e.g. urd); default auto-detect' },
      },
    },
    async run(a) {
      const out = [];
      for (const p of a.paths) {
        const fields = { model_id: 'scribe_v1', ...(a.language ? { language_code: a.language } : {}) };
        const d = await el('/speech-to-text', { method: 'POST', form: fileForm(fields, abs(p)) });
        out.push(`${p}:\n  ${d.text}`);
      }
      return out.join('\n\n');
    },
  },
};

// ---------------------------------------------------------------- MCP over stdio (newline-delimited JSON-RPC)

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function handle(m) {
  if (m.id === undefined) return;                         // notifications (initialized, cancelled)
  try {
    if (m.method === 'initialize') {
      return send({ id: m.id, result: {
        protocolVersion: m.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'motion-reel-elevenlabs', version: VERSION },
      } });
    }
    if (m.method === 'ping') return send({ id: m.id, result: {} });
    if (m.method === 'tools/list') {
      return send({ id: m.id, result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) } });
    }
    if (m.method === 'tools/call') {
      const tool = TOOLS[m.params?.name];
      if (!tool) return send({ id: m.id, error: { code: -32602, message: `unknown tool ${m.params?.name}` } });
      try {
        const text = await tool.run(m.params.arguments || {});
        return send({ id: m.id, result: { content: [{ type: 'text', text }] } });
      } catch (e) {
        return send({ id: m.id, result: { content: [{ type: 'text', text: e.message }], isError: true } });
      }
    }
    send({ id: m.id, error: { code: -32601, message: `method not found: ${m.method}` } });
  } catch (e) {
    send({ id: m.id, error: { code: -32603, message: e.message } });
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let m;
  try { m = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'parse error' } }); }
  handle(m);
});
