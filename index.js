import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

export { MODULE_NAME };

const MODULE_NAME = 'namegen';
const TEMPLATE_PATH = 'third-party/SillyTavern-Namegen';

const defaultSettings = Object.freeze({
    functionTool: false,
});

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

        const localUrl = `/${TEMPLATE_PATH}/lib/fantastical.js`;
        const cdnUrls = [
            'https://cdn.jsdelivr.net/npm/fantastical@2.0.1/dist/index.js',
            'https://unpkg.com/fantastical@2.0.1/dist/index.js',
        ];

        const tryUrls = [localUrl, ...cdnUrls];
        let lastError;
        for (const url of tryUrls) {
            try {
                await loadScript(url);
                break;
            } catch (err) {
                lastError = err;
            }
        }

        const lib = window.fantastical || (window.exports && window.exports.fantastical) || undefined;
        if (!lib) {
            if (lastError) throw lastError;
            throw new Error('Fantastical not found after loading attempts');
        }

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
    };

    const k = String(kind).trim();
    const normalized = k.replace(/\s+/g, '').toLowerCase();

    for (const [key, val] of Object.entries(map)) {
        if (normalized === key.replace(/\s+/g, '').toLowerCase()) return val;
    }
    return k; // try raw provided name
}

async function generateName(kind, gender) {
    const api = await ensureFantasticalLoaded();

    const resolved = resolveGenerator(kind);
    let fn = api[resolved];

    if (typeof fn !== 'function') {
        toastr.warning(`NameGen: Unknown generator "${resolved}"; defaulting to human`);
        fn = api.human;
    }

    // Many species accept an optional gender; if provided use it, else default to 'male'
    const gen = String(gender || '').toLowerCase();
    const genderArg = gen === 'female' ? 'female' : gen === 'male' ? 'male' : 'male';

    // Heuristic: If function expects any args, pass gender
    try {
        const name = fn.length > 0 ? fn(genderArg) : fn();
        return String(name || '').trim();
    } catch (error) {
        console.error('NameGen: error generating name', error);
        toastr.error('NameGen: Error generating name');
        return '';
    }
}

async function addSettingsPanel() {
    const settingsHtml = await renderExtensionTemplateAsync(TEMPLATE_PATH, 'settings');
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
            },
        });

        registerFunctionTool({
            name: 'GenerateName',
            displayName: 'Name Generator',
            description: 'Generates a fantasy-style name using the fantastical library.',
            parameters: schema,
            action: async (args) => {
                const kind = args?.kind || 'human';
                const gender = args?.gender || 'male';
                const name = await generateName(kind, gender);
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
            const gender = String(args.gender || 'male');
            const result = await generateName(kind, gender);
            return result;
        },
        helpString: 'Generate a fantasy name (e.g., /generateName elf --gender female).',
        returns: 'generated name',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'gender',
                description: 'Gender for gendered species',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'male',
                enumProvider: commonEnumProviders.string(['male', 'female']),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'kind',
                description: 'Generator kind, e.g. human, elf, dwarf, tavern, guild, adventure',
                isRequired: false,
                typeList: [ARGUMENT_TYPE.STRING],
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

