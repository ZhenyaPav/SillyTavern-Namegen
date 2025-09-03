/*
 * Fantastical Name Generator – Function Tool for SillyTavern
 * Uses the `fantastical` package. If unavailable locally, loads from CDN.
 */

(function () {
  const EXT_ID = 'ZhenyaPav/SillyTavern-Namegen';
  // Backward/forward compatible bridge to ST APIs (global and ctx-based)
  const API = {
    ctx() {
      try {
        if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') return SillyTavern.getContext();
      } catch (_) {}
      try {
        if (typeof getContext === 'function') return getContext();
      } catch (_) {}
      return {};
    },
    registerExtension(id, obj) {
      try { if (typeof window !== 'undefined' && typeof window.registerExtension === 'function') return window.registerExtension(id, obj); } catch (_) {}
      const c = this.ctx();
      return c.registerExtension?.(id, obj);
    },
    registerFunctionTool(def) {
      try { if (typeof window !== 'undefined' && typeof window.registerFunctionTool === 'function') return window.registerFunctionTool(def); } catch (_) {}
      const c = this.ctx();
      return c.registerFunctionTool?.(def);
    },
    unregisterFunctionTool(name) {
      try { if (typeof window !== 'undefined' && typeof window.unregisterFunctionTool === 'function') return window.unregisterFunctionTool(name); } catch (_) {}
      const c = this.ctx();
      return c.unregisterFunctionTool?.(name);
    },
    registerSlashCommand(...args) {
      try { if (typeof window !== 'undefined' && typeof window.registerSlashCommand === 'function') return window.registerSlashCommand(...args); } catch (_) {}
      const c = this.ctx();
      return c.registerSlashCommand?.(...args);
    },
    unregisterSlashCommand(name) {
      try { if (typeof window !== 'undefined' && typeof window.unregisterSlashCommand === 'function') return window.unregisterSlashCommand(name); } catch (_) {}
      const c = this.ctx();
      return c.unregisterSlashCommand?.(name);
    },
    isToolCallingSupported() {
      try { if (typeof window !== 'undefined' && typeof window.isToolCallingSupported === 'function') return window.isToolCallingSupported(); } catch (_) {}
      const c = this.ctx();
      return c.isToolCallingSupported?.();
    },
    toast(msg) {
      const c = this.ctx();
      try { return c.toast?.(msg); } catch (_) {}
      try { if (typeof window !== 'undefined' && window.toastr?.info) return window.toastr.info(msg); } catch (_) {}
    },
    extensionSettings(ns) {
      const c = this.ctx();
      if (!c.extensionSettings) c.extensionSettings = {};
      if (!c.saveSettingsDebounced) c.saveSettingsDebounced = () => {};
      return c.extensionSettings[ns] || {};
    },
    setExtensionSettings(ns, values) {
      const c = this.ctx();
      if (!c.extensionSettings) c.extensionSettings = {};
      c.extensionSettings[ns] = values;
      c.saveSettingsDebounced?.();
    }
  };
  const SETTINGS_KEY = 'fantastical_namegen';
  const DEFAULTS = {
    enableFunctionTool: true,
    enableSlashCommand: true,
    cdnUrl: 'https://cdn.jsdelivr.net/npm/fantastical@latest/dist/index.js',
    preferCDN: true,
    cacheModule: true,
    showToasts: true,
  };

  /** Utility: read/write extension settings */
  function getSettings() {
    const store = API.extensionSettings(SETTINGS_KEY) || {};
    return { ...DEFAULTS, ...store };
  }
  function setSettings(partial) {
    const merged = { ...getSettings(), ...partial };
    API.setExtensionSettings(SETTINGS_KEY, merged);
  }

  /** Simple args parser for the /name slash command */
  function parseNameArgs(input) {
    const out = { category: 'species', type: '', count: 1, gender: undefined, allowMultipleNames: false };
    if (!input || !input.trim()) return out;

    const tokens = input.match(/(?:[^\s"']+|\"[^\"]*\"|'[^']*')+/g)?.map(t => t.replace(/^['\"]|['\"]$/g, '')) || [];
    const consume = () => tokens.shift();

    // First, extract any --key or --key=value pairs
    for (let i = 0; i < tokens.length; ) {
      const t = tokens[i];
      if (t?.startsWith('--')) {
        const [k, vRaw] = t.slice(2).split('=');
        let v = vRaw;
        if (!v && (i + 1) < tokens.length && !tokens[i + 1].startsWith('--')) {
          v = tokens[i + 1];
          tokens.splice(i, 2);
        } else {
          tokens.splice(i, 1);
        }
        switch (k) {
          case 'category':
          case 'cat':
            if (v) out.category = String(v); break;
          case 'type':
            if (v) out.type = String(v); break;
          case 'count':
          case 'n':
            if (v) out.count = Math.max(1, Math.min(50, Number(v) || 1)); break;
          case 'gender':
            if (v) out.gender = String(v); break;
          case 'allowMultipleNames':
          case 'multi':
            out.allowMultipleNames = v ? ['true', '1', 'yes', 'y'].includes(String(v).toLowerCase()) : true; break;
        }
        continue; // don't advance i (we already spliced)
      }
      i++;
    }

    // Remaining positional tokens
    const pos = tokens;
    if (pos.length) {
      // If first positional is one of known categories, treat as category
      const maybeCat = String(pos[0]).toLowerCase();
      if ([ 'species', 'parties', 'places', 'adventures' ].includes(maybeCat)) {
        out.category = consume().toLowerCase();
      }
    }
    if (pos.length) out.type = consume();
    if (pos.length) {
      const n = Number(pos[0]);
      if (!Number.isNaN(n)) { out.count = Math.max(1, Math.min(50, n)); consume(); }
    }
    if (pos.length) {
      // optional gender
      out.gender = consume();
    }

    return out;
  }

  /** Register the /name slash command */
  function registerSlash() {
    const ctx = API.ctx();
    const settings = getSettings();
    if (!settings.enableSlashCommand) return;

    const help = 'Generate fantasy names. Usage: /generateName [category] <type> [count] [gender] [--multi] or flags: --cat <category> --type <type> --count <n> --gender <g>';

    const handler = async (argsStr = '') => {
      try {
        const args = parseNameArgs(String(argsStr || ''));
        if (!args.type) return 'Usage: ' + help;
        const names = await generateNames(args);
        return names.join('\n');
      } catch (e) {
        console.error('[Fantastical] /name failed', e);
        return `Error: ${e?.message || e}`;
      }
    };

    try {
      // Form 1: name, handler, options
      if (typeof API.registerSlashCommand === 'function' || ctx.registerSlashCommand) {
        API.registerSlashCommand('generateName', handler, { help, aliases: ['fname'] });
        return;
      }
    } catch (e) {
      console.warn('[Fantastical] registerSlashCommand(name, fn, opts) failed; trying object form', e);
    }

    try {
      // Form 2: object descriptor
      API.registerSlashCommand?.({
        name: 'generateName',
        aliases: ['fname'],
        description: help,
        callback: handler,
      });
    } catch (e) {
      console.warn('[Fantastical] registerSlashCommand object form failed', e);
    }
  }

  /** Lightweight cache in the browser between sessions */
  const ModuleCache = {
    key: `${EXT_ID}:fantastical-src`,
    async get() {
      try { return (await localStorage.getItem(this.key)) || null; } catch (e) { return null; }
    },
    async set(code) {
      try { localStorage.setItem(this.key, code); } catch (e) {}
    },
    async clear() { try { localStorage.removeItem(this.key); } catch (e) {} },
  };

  /**
   * Dynamically import the `fantastical` library.
   * Strategy:
   * 1) If already loaded -> return.
   * 2) If cached JS string exists and caching enabled -> import from a Blob URL.
   * 3) Try local relative import (for cases when user `npm i fantastical` inside extension dir and the bundler exposes dist/index.js).
   * 4) Fallback to CDN (jsDelivr). Optionally cache the fetched code.
   */
  async function loadFantastical() {
    if (globalThis.__fantasticalLib) return globalThis.__fantasticalLib;

    const { preferCDN, cdnUrl, cacheModule } = getSettings();

    // 2) Load from cache (if any)
    if (!preferCDN && cacheModule) {
      const cached = await ModuleCache.get();
      if (cached) {
        try {
          const url = URL.createObjectURL(new Blob([cached], { type: 'text/javascript' }));
          const mod = await import(/* webpackIgnore: true */ url);
          URL.revokeObjectURL(url);
          if (mod && Object.keys(mod).length) {
            globalThis.__fantasticalLib = mod;
            return mod;
          }
        } catch (err) {
          console.warn('[Fantastical] Failed to import from cache', err);
        }
      }
    }

    // 3) Try a local relative import (works if user placed the built file manually)
    try {
      const localCandidates = [
        './node_modules/fantastical/dist/index.js',
        './dist/index.js',
      ];
      for (const rel of localCandidates) {
        try {
          const mod = await import(/* webpackIgnore: true */ rel);
          if (mod && Object.keys(mod).length) {
            globalThis.__fantasticalLib = mod;
            return mod;
          }
        } catch (_) { /* try next */ }
      }
    } catch (_) { /* ignore */ }

    // 4) CDN fallback
    try {
      const url = cdnUrl;
      // Fetch once (so we can optionally cache) and eval via Blob
      const resp = await fetch(url, { cache: 'force-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const code = await resp.text();
      if (cacheModule) await ModuleCache.set(code);
      const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const mod = await import(/* webpackIgnore: true */ blobUrl);
      URL.revokeObjectURL(blobUrl);
      globalThis.__fantasticalLib = mod;
      return mod;
    } catch (err) {
      console.error('[Fantastical] Failed to load module from CDN:', err);
      throw new Error('Fantastical module could not be loaded. Check your connection or CDN URL in settings.');
    }
  }

  /** Map inputs to the library API */
  function resolveGenerator(lib, category, type) {
    // Allow both grouped and top-level exports
    const groups = {
      species: lib.species || {},
      parties: lib.parties || {},
      places: lib.places || {},
      adventures: lib.adventures || {},
    };

    // Prefer grouped; otherwise try top-level function by name
    let fn = groups[category]?.[type];
    if (!fn && typeof lib[type] === 'function') fn = lib[type];

    if (typeof fn !== 'function') {
      throw new Error(`Unknown generator: ${category}.${type}`);
    }

    return fn;
  }

  async function generateNames({ category, type, gender = null, allowMultipleNames = false, count = 1 }) {
    const lib = await loadFantastical();
    const fn = resolveGenerator(lib, category, type);

    const results = [];
    for (let i = 0; i < Math.max(1, Math.min(50, Number(count) || 1)); i++) {
      let name;
      if (category === 'species') {
        // species may accept options incl. gender and allowMultipleNames
        const opts = {};
        if (gender != null && String(gender).length) opts.gender = gender;
        if (typeof allowMultipleNames === 'boolean') opts.allowMultipleNames = allowMultipleNames;
        name = fn(opts);
      } else {
        // parties/places/adventures typically accept no options
        name = fn();
      }
      results.push(String(name));
    }

    return results;
  }

  /** Register the Function Tool */
  function registerTool() {
    const ctx = API.ctx();
    const settings = getSettings();

    const supported = API.isToolCallingSupported?.();
    if (supported === false) {
      console.warn('[Fantastical] Tool calling not supported or disabled.');
      return;
    }

    if (!settings.enableFunctionTool) return;

    API.registerFunctionTool({
      name: 'fantasyName.generate',
      displayName: 'Generate Fantasy Name(s)',
      description: 'Generate fantasy names (species, parties, places, adventures) using the fantastical library. Use when the user asks for a fantasy name.',
      parameters: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Generator category: species, parties, places, adventures',
            enum: ['species', 'parties', 'places', 'adventures'],
          },
          type: {
            type: 'string',
            description: 'Specific generator name within the category (e.g., human, elf, dwarf, goblin, mysticOrder, guild, tavern, adventure).',
          },
          gender: {
            type: 'string',
            description: "Optional gender for species that support it: 'male', 'female', or leave blank.",
          },
          allowMultipleNames: {
            type: 'boolean',
            description: 'For species.human: allow multiple-part names when true.',
            default: false,
          },
          count: {
            type: 'integer',
            description: 'How many names to generate (1–50).',
            minimum: 1,
            maximum: 50,
            default: 1,
          }
        },
        required: ['category', 'type']
      },
      action: async (args) => {
        const { showToasts } = getSettings();
        try {
          const names = await generateNames(args);
          if (showToasts) API.toast('Generated fantasy name(s)');
          // Return as newline-joined string so it is readable in chat
          return names.join('\n');
        } catch (err) {
          console.error('[Fantastical] Generation failed', err);
          return `Error: ${err.message || err}`;
        }
      },
      formatMessage: ({ category, type, count = 1 }) => {
        const { showToasts } = getSettings();
        if (!showToasts) return '';
        return `Generating ${count} ${category}.${type} name(s)…`;
      },
      stealth: false,
    });
  }

  /** UI hook for settings panel to refresh registration on toggle */
  function reRegister() {
    // Unregister by name then re-register
    try { API.unregisterFunctionTool?.('fantasyName.generate'); } catch (_) {}
    try { API.unregisterSlashCommand?.('generateName'); } catch (_) {}
    registerTool();
    registerSlash();
  }

  /** Wire up when extensions are ready */
  async function init() {
    // Expose small API for debugging in console
    globalThis.FantasticalNameGen = { loadFantastical, generateNames, reRegister, getSettings, setSettings };
    registerTool();
    registerSlash();
  }

  // Register into the Extensions panel
  try {
    API.registerExtension?.(EXT_ID, {
      name: 'Fantastical Name Generator',
      async init() { await init(); },
      settings: {
        get: getSettings,
        set: setSettings,
        // Some ST builds display a HTML settings page when provided
        html: 'settings.html',
      },
      onSettingsChange() { reRegister(); },
    }) || init();
  } catch (err) {
    console.error('[Fantastical] Failed to register extension scaffold', err);
    // Fallback: just init
    init();
  }
})();
