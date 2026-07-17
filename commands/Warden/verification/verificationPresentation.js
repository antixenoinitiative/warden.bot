const verificationEmbedConfig = require('./verificationEmbedConfig.json');

const PRESENTATION_SURFACES = Object.freeze({
    admin: 'admin',
    runtimeNotice: 'runtimeNotice',
    publicContent: 'publicContent',
    legacyFallback: 'legacyFallback',
    staffLog: 'staffLog',
});

const PRESENTATION_TONES = Object.freeze({
    neutral: 'neutral',
    info: 'info',
    success: 'success',
    warning: 'warning',
    error: 'error',
});

function resolvePresentationPreset(surface, tone = PRESENTATION_TONES.info) {
    const preset = verificationEmbedConfig.presentationPresets?.[surface] ?? {};
    const colors = verificationEmbedConfig.responseDefaults?.colors ?? {};

    return Object.freeze({
        surface,
        tone,
        renderer: preset.renderer ?? 'legacy',
        transport: preset.transport ?? 'interaction',
        color: colors[tone] ?? colors.info ?? '#3498DB',
        footer: preset.footer === true,
        timestamp: preset.timestamp === true,
    });
}

function buildVerificationNotice({
    surface = PRESENTATION_SURFACES.runtimeNotice,
    tone = PRESENTATION_TONES.info,
    title,
    message,
    fields = [],
    actions = [],
} = {}) {
    return Object.freeze({
        kind: 'notice',
        presentation: resolvePresentationPreset(surface, tone),
        title: String(title ?? ''),
        message: String(message ?? ''),
        fields: Object.freeze([...fields]),
        actions: Object.freeze([...actions]),
    });
}

module.exports = {
    PRESENTATION_SURFACES,
    PRESENTATION_TONES,
    buildVerificationNotice,
    resolvePresentationPreset,
};
