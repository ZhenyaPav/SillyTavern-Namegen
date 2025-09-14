import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommandEnumValue, enumTypes } from '../../../slash-commands/SlashCommandEnumValue.js';

export { MODULE_NAME };

const MODULE_NAME = 'namegen';
// Prefer the README-recommended folder, but handle case-variant installs too
const PRIMARY_PATH = 'third-party/SillyTavern-Namegen';
const ALT_PATH = 'third-party/SillyTavern-NameGen';
// Compute the served base URL of this extension to reliably load sibling assets
const BASE_URL = (() => {
    try {
        const url = new URL('.', import.meta?.url || '');
        return url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
    } catch {
        // Fallback to expected served path prefix when import.meta.url is unavailable
        return `/scripts/extensions/${PRIMARY_PATH}/`;
    }
})();

const defaultSettings = Object.freeze({
    functionTool: false,
});

function insertNameIntoInput(text, { spaced = true } = {}) {
    try {
        const candidates = [
            '#send_textarea',
            'textarea#send_textarea',
            '#chat-input',
            'textarea:visible:enabled',
            'textarea',
        ];
        let $el = null;
        for (const sel of candidates) {
            const $cand = $(sel).filter(':visible');
            if ($cand && $cand.length) { $el = $cand.eq(0); break; }
        }
        if (!$el || !$el.length) return false;

        const el = $el[0];

        // Handle contentEditable fallback
        if (el.isContentEditable) {
            const selection = window.getSelection();
            if (!selection) return false;
            const insert = spaced ? (text.startsWith(' ') ? text : ' ' + text) : text;
            document.execCommand('insertText', false, insert);
            $el.trigger('input');
            return true;
        }

        const current = String($el.val() ?? '');
        const start = typeof el.selectionStart === 'number' ? el.selectionStart : current.length;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const needsSpaceBefore = spaced && before && !/\s$/.test(before);
        const needsSpaceAfter = spaced && after && !/^\s/.test(after);
        const insert = (needsSpaceBefore ? ' ' : '') + text + (needsSpaceAfter ? ' ' : '');
        const updated = before + insert + after;
        $el.val(updated).trigger('input');
        const newPos = (before + insert).length;
        try { el.selectionStart = el.selectionEnd = newPos; } catch {}
        $el.focus();
        return true;
    } catch (e) {
        console.error('NameGen: failed to insert into input', e);
        return false;
    }
}

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();

    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }

    return extensionSettings[MODULE_NAME];
}

async function ensureFantasticalLoaded() {
    try {
        if (!SillyTavern.libs) SillyTavern.libs = {};

        if (SillyTavern.libs.fantastical && typeof SillyTavern.libs.fantastical === 'object') {
            return SillyTavern.libs.fantastical;
        }

        const loadScript = (src) => new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(script);
        });
        const candidates = [
            `${BASE_URL}lib/fantastical.js`,
            // Fallbacks for unusual serve paths
            `/scripts/extensions/${PRIMARY_PATH}/lib/fantastical.js`,
            `/scripts/extensions/${ALT_PATH}/lib/fantastical.js`,
            `/${PRIMARY_PATH}/lib/fantastical.js`,
            `/${ALT_PATH}/lib/fantastical.js`,
        ];
        // Only load the vendored local copy; do not hit external CDNs at runtime
        let loaded = false;
        let lastError;
        for (const url of candidates) {
            try {
                await loadScript(url);
                loaded = true;
                break;
            } catch (e) {
                lastError = e;
            }
        }
        if (!loaded) throw lastError || new Error('Failed to load fantastical lib');

        const lib = window.fantastical || (window.exports && window.exports.fantastical) || undefined;
        if (!lib) throw new Error('Fantastical not found after loading local copy');

        SillyTavern.libs.fantastical = lib;
        return lib;
    } catch (error) {
        console.error('NameGen: Failed to load fantastical', error);
        toastr.error('NameGen: Could not load fantastical library');
        throw error;
    }
}

function resolveGenerator(kind) {
    // Normalize and provide a few friendly aliases
    if (!kind) return 'human';
    const map = {
        place: 'tavern',
        places: 'tavern',
        party: 'guild',
        parties: 'guild',
        adventure: 'adventure',
        adventures: 'adventure',
        hielf: 'highelf',
        high_elf: 'highelf',
        wood_elf: 'woodelf',
        dark_elf: 'darkelf',
        half_elf: 'halfelf',
        high_fairy: 'highfairy',
        cave_person: 'cavePerson',
        // settlements (aliases)
        town: 'settlement/town',
        city: 'settlement/city',
        village: 'settlement/village',
        hamlet: 'settlement/hamlet',
        settlement: 'settlement/any',
    };

    const k = String(kind).trim();
    const normalized = k.replace(/\s+/g, '').toLowerCase();

    for (const [key, val] of Object.entries(map)) {
        if (normalized === key.replace(/\s+/g, '').toLowerCase()) return val;
    }
    return k; // try raw provided name
}

function normalizeGender(g) {
    const s = String(g || '').trim().toLowerCase();
    if (['m', 'male', 'man', 'masc', 'boy'].includes(s)) return 'male';
    if (['f', 'female', 'woman', 'fem', 'girl'].includes(s)) return 'female';
    return undefined;
}

async function generateName(kind, gender, options = {}) {
    const api = await ensureFantasticalLoaded();

    const resolved = resolveGenerator(kind);

    // Settlements: use the library's human generator as requested
    if (resolved?.startsWith('settlement/')) {
        const genderArg = normalizeGender(gender);
        // prefer multi-word options for variety (can be overridden)
        const allowMultipleNames = options.allowMultipleNames ?? true;
        return api.human({ allowMultipleNames, gender: genderArg });
    }

    let fn = api[resolved];

    if (typeof fn !== 'function') {
        toastr.warning(`NameGen: Unknown generator "${resolved}"; defaulting to human`);
        fn = api.human;
    }

    // Normalize gender and only pass it to species that take a gendered arg
    const genderArg = normalizeGender(gender);
    try {
        let name;
        if (resolved === 'human') {
            // Pass gender in the options object even though the library ignores it
            const allowMultipleNames = options.allowMultipleNames ?? false;
            name = fn({ allowMultipleNames, gender: genderArg });
        } else if (fn.length >= 1 && genderArg) {
            name = fn(genderArg);
        } else if (fn.length === 0) {
            name = fn();
        } else {
            // function expects an argument but no valid gender; try calling without
            name = fn();
        }
        return String(name || '').trim();
    } catch (error) {
        console.error('NameGen: error generating name', error);
        toastr.error('NameGen: Error generating name');
        return '';
    }
}

async function addSettingsPanel() {
    let settingsHtml;
    try {
        settingsHtml = await renderExtensionTemplateAsync(PRIMARY_PATH, 'settings');
    } catch (err) {
        try {
            settingsHtml = await renderExtensionTemplateAsync(ALT_PATH, 'settings');
        } catch (err2) {
            console.error('NameGen: Failed to load settings template from both paths', err, err2);
            toastr.error('NameGen: Could not load settings panel');
            return;
        }
    }
    const getSettingsContainer = () => $(document.getElementById('namegen_container') ?? document.getElementById('extensions_settings2'));
    getSettingsContainer().append(settingsHtml);

    const settings = getSettings();
    $('#namegen_function_tool').prop('checked', settings.functionTool).on('change', function () {
        settings.functionTool = !!$(this).prop('checked');
        SillyTavern.getContext().saveSettingsDebounced();
        registerFunctionTools();
    });
}

function registerFunctionTools() {
    try {
        const { registerFunctionTool, unregisterFunctionTool } = SillyTavern.getContext();
        if (!registerFunctionTool || !unregisterFunctionTool) {
            console.debug('NameGen: function tools are not supported');
            return;
        }

        unregisterFunctionTool('GenerateName');

        const settings = getSettings();
        if (!settings.functionTool) {
            return;
        }

        const schema = Object.freeze({
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    description: 'The generator to use, e.g. human, elf, dwarf, tavern, guild, adventure',
                },
                gender: {
                    type: 'string',
                    description: 'Gender for species that support it',
                    enum: ['male', 'female'],
                },
                allowMultipleNames: {
                    type: 'boolean',
                    description: 'For kind=human or settlements: allow multiple human-style name parts (defaults: human=false, settlements=true).',
                },
            },
        });

        registerFunctionTool({
            name: 'GenerateName',
            displayName: 'Name Generator',
            description: 'Generates a fantasy-style name using the fantastical library. Optional: allowMultipleNames (boolean) for human/settlements.',
            parameters: schema,
            action: async (args) => {
                const kind = args?.kind || 'human';
                const gender = args?.gender; // leave undefined when not provided
                const allowMultipleNames = typeof args?.allowMultipleNames === 'boolean' ? args.allowMultipleNames : undefined;
                const name = await generateName(kind, gender, { allowMultipleNames });
                return name || 'Unknown';
            },
            formatMessage: () => '',
        });
    } catch (error) {
        console.error('NameGen: Error registering function tools', error);
    }
}

jQuery(async function () {
    await addSettingsPanel();
    registerFunctionTools();

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'generateName',
        aliases: ['genname', 'name'],
        callback: async (args, value) => {
            const kind = String(value || args.kind || 'human');
            const gender = args.gender ? String(args.gender) : undefined;
            const allowMultipleNames = args.allowMultipleNames !== undefined
                ? String(args.allowMultipleNames).toLowerCase() === 'true'
                : undefined;
            const result = await generateName(kind, gender, { allowMultipleNames });
            if (result) {
                const inserted = insertNameIntoInput(result, { spaced: true });
                if (inserted) {
                    toastr.success(`Inserted name: ${result}`);
                    return '';
                }
            }
            return result;
        },
        helpString: 'Generate a fantasy name (e.g., /generateName elf --gender female --allowMultipleNames true).',
        returns: 'generated name',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'gender',
                description: 'Gender for gendered species',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'male',
                // Provide a static string enum provider compatible with current ST versions
                enumProvider: (() => {
                    const values = ['male', 'female'];
                    return () => values.map(v => new SlashCommandEnumValue(v, v, enumTypes.string));
                })(),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'kind',
                description: 'Generator kind, e.g. human, elf, dwarf, tavern, guild, adventure',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'allowMultipleNames',
                description: 'For human/settlements: allow multi-part names (true/false).',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: (() => {
                    const values = ['true', 'false'];
                    return () => values.map(v => new SlashCommandEnumValue(v, v, enumTypes.string));
                })(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Kind (fallback if not provided via --kind)',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
    }));
});
