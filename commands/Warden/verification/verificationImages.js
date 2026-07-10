const Discord = require('discord.js');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const fetch = require('node-fetch');
const {
    getVerificationChallengeStep,
    resolvePrompt,
    resolveSolutionImageIds,
    resolveControlImageIds,
} = require('./verificationChallenges');
const verificationEmbedConfig = require('./verificationEmbedConfig.json');


/**
 * Reusable image pools for verification gallery challenges.
 *
 * Each pool can be referenced by one or more verification challenges. Public pool entries
 * are neutral image inventory only. Per-challenge solution/control mappings live in DB
 * challenge overrides. Pools with `directory` read local image `fileName` entries from
 * that directory.
 *
 * Keep URLs and any displayed metadata neutral. Discord clients receive them.
 * - Changed code so images are turned into discordapp attachments before transmitting,
 * this will obscure image URLs atlest.
 */
const verificationImagesRegistry = {
    
    eliteVessels_c: {
        id: 'eliteVessels_c',
        description: 'Elite Dangerous vessel img pool for verification challenges.',
        images: [
            {
                id: 'ev8',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel8_c.png',
            },
            {
                id: 'ev1',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel1_c.png',
            },
            {
                id: 'ev2',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel2_c.png',
            },
            {
                id: 'ev3',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel3_c.png',
            },
            {
                id: 'ev9',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel9_c.png',
            },
            {
                id: 'ev4',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel4_c.png',
            },
            {
                id: 'ev5',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel5_c.png',
            },
            {
                id: 'ev6',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel6_c.png',
            },
            {
                id: 'ev10',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel10_c.png',
            },
            {
                id: 'ev7',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel7_c.png',
            },
        ],
    },
    eliteVessels_c_local: {
        id: 'eliteVessels_c_local',
        description: 'Local Elite Dangerous vessel img pool for verification challenges.',
        directory: '/home/container/verificationPool/',
        images: [
            {
                id: 'elitevessel8',
                fileName: 'elitevessel8_c.png',
            },
            {
                id: 'elitevessel1',
                fileName: 'elitevessel1_c.png',
            },
            {
                id: 'elitevessel2',
                fileName: 'elitevessel2_c.png',
            },
            {
                id: 'elitevessel3',
                fileName: 'elitevessel3_c.png',
            },
            {
                id: 'elitevessel9',
                fileName: 'elitevessel9_c.png',
            },
            {
                id: 'elitevessel4',
                fileName: 'elitevessel4_c.png',
            },
            {
                id: 'elitevessel5',
                fileName: 'elitevessel5_c.png',
            },
            {
                id: 'elitevessel6',
                fileName: 'elitevessel6_c.png',
            },
            {
                id: 'elitevessel10',
                fileName: 'elitevessel10_c.png',
            },
            {
                id: 'elitevessel7',
                fileName: 'elitevessel7_c.png',
            },
        ],
    },
};

let canvasApi;

function getCanvasApi() {
    if (!canvasApi) {
        canvasApi = require('@napi-rs/canvas');
    }

    return canvasApi;
}

const DEFAULT_IMAGE_GENERATION_CONFIG = {
    gallery: {
        defaultSize: 6,
        fetchTimeoutMs: 10000,
        composite: {
            gridColumns: 3,
            tileSize: 320,
            labelPadding: 16,
            labelSize: 72,
        },
    },
    prompt: {
        width: 960,
        minHeight: 320,
        padding: 64,
        fontSize: 64,
        lineHeight: 88,
        curveNoiseCount: 120,
        pixelNoiseCount: 6200,
        decoyGlyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?/#%&',
        decoyGlyphCount: 190,
        occlusionLineCount: 24,
        maxCharacterRotation: 0.08,
        characterJitter: 6,
        textWaveAmplitude: 5,
        textWaveFrequency: 0.45,
        textWaveRotation: 0.025,
        characterScaleJitter: 0.02,
        characterSkewJitter: 0.01,
        characterSpacingJitter: 3,
        characterOverlapEnabled: true,
        characterOverlapChance: 0.85,
        characterOverlapMin: 3,
        characterOverlapMax: 8,
        characterPositionMarginX: 72,
        characterPositionMarginY: 72,
        fontSizeJitter: 2,
        textStrokeEnabled: false,
        textShadowEnabled: false,
        textOffsetShadowEnabled: false,
        textStrokeWidthMin: 0,
        textStrokeWidthMax: 0,
        characterOcclusionLineCountMin: 2,
        characterOcclusionLineCountMax: 5,
        characterOcclusionLineWidthMin: 4,
        characterOcclusionLineWidthMax: 10,
        characterOcclusionLineAlphaMin: 0.34,
        characterOcclusionLineAlphaMax: 0.62,
        textShadowBlur: 0,
        textShadowOffsetMax: 0,
        textShadowAlphaMin: 0,
        textShadowAlphaMax: 0,
        textAlphaMin: 0.88,
        textAlphaMax: 0.96,
        textStrokeAlphaMin: 0,
        textStrokeAlphaMax: 0,
        textFillAlphaMin: 0.62,
        textFillAlphaMax: 0.80,
        textFontWeights: ['700', '800', '900'],
        textFontFamilies: ['Arial', 'Helvetica', 'Verdana', 'Trebuchet MS'],
        textFillColors: ['rgba(237, 246, 248, 0.72)', 'rgba(226, 238, 244, 0.68)', 'rgba(243, 234, 212, 0.66)'],
        occlusionLineAlphaMin: 0.16,
        occlusionLineAlphaMax: 0.34,
        occlusionLineWidthMin: 5,
        occlusionLineWidthMax: 14,
        occlusionLineCurveAmount: 150,
        occlusionLineDashChance: 0.55,
        occlusionLineUsePaletteColors: true,
        decoyGlyphAlphaMin: 0.04,
        decoyGlyphAlphaMax: 0.12,
        decoyGlyphSizeMin: 16,
        decoyGlyphSizeMax: 58,
        decoyGlyphRotationMax: 1.4,
        largeDecoyGlyphs: {
            enabled: true,
            count: 3,
            alphaMin: 0.075,
            alphaMax: 0.16,
            sizeMin: 96,
            sizeMax: 168,
            rotationMax: 0.45,
            centerBias: 0.72,
        },
        cutoutCount: 6,
        cutoutRadiusMin: 2,
        cutoutRadiusMax: 6,
        cutoutAlpha: 0.14,
        backgroundPattern: {
            enabled: true,
            gridLineCount: 48,
            ringCount: 32,
            microLineCount: 180,
            tileSize: 48,
            motifSize: 8,
            alpha: 0.14,
        },
        distortion: {
            enabled: true,
            rowShiftAmplitude: 3,
            rowShiftFrequency: 0.035,
            columnShiftAmplitude: 1,
            columnShiftFrequency: 0.025,
            finalWave: {
                enabled: true,
                amplitude: 5,
                frequency: 0.045,
                phaseJitter: true,
            },
        },
        palettes: [
            { background: ['#07111f', '#14213d', '#0b1020'], curve: ['#76d7ff', '#f5b7ff'], glyph: ['#d9f3ff', '#ffd9fb'], stroke: 'rgba(118, 215, 255, 0.70)' },
            { background: ['#1c0b2b', '#3d145c', '#10091f'], curve: ['#ff9cf5', '#8ad8ff'], glyph: ['#ffe2fb', '#d8f4ff'], stroke: 'rgba(255, 156, 245, 0.70)' },
            { background: ['#06261d', '#115740', '#071611'], curve: ['#8dffcc', '#ffe08a'], glyph: ['#dcfff0', '#fff2cc'], stroke: 'rgba(141, 255, 204, 0.70)' },
            { background: ['#2b1608', '#5a3112', '#120904'], curve: ['#ffcf8a', '#8ac7ff'], glyph: ['#fff1d8', '#d8ecff'], stroke: 'rgba(255, 207, 138, 0.70)' },
            { background: ['#25110f', '#5b1f2d', '#120708'], curve: ['#ff8aa8', '#ffd36e'], glyph: ['#ffe0e7', '#fff0c5'], stroke: 'rgba(255, 138, 168, 0.70)' },
        ],
    },
};

const GALLERY_IMAGE_ATTACHMENT_NAME_PREFIX = 'warden-gallery';
const GALLERY_IMAGE_FETCH_TIMEOUT_CODE = 'VERIFICATION_GALLERY_IMAGE_FETCH_TIMEOUT';
const GALLERY_COMPOSITE_ATTACHMENT_NAME_PREFIX = 'warden-gallery-grid';
const PROMPT_IMAGE_ATTACHMENT_NAME_PREFIX = 'warden-prompt';

function getPositiveInteger(value, fallback) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue < 1) {
        return fallback;
    }

    return numericValue;
}

function getNonNegativeInteger(value, fallback) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue < 0) {
        return fallback;
    }

    return numericValue;
}

function getNonNegativeNumber(value, fallback) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return fallback;
    }

    return numericValue;
}

function getString(value, fallback) {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function getBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function getBoundedNumber(value, fallback, min, max) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, numericValue));
}

function getNumberRange(minValue, maxValue, fallbackMin, fallbackMax, minAllowed, maxAllowed) {
    const min = getBoundedNumber(minValue, fallbackMin, minAllowed, maxAllowed);
    const max = getBoundedNumber(maxValue, fallbackMax, minAllowed, maxAllowed);

    return {
        min: Math.min(min, max),
        max: Math.max(min, max),
    };
}

function randomBetween(min, max) {
    return min + (Math.random() * (max - min));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function pickRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function formatCanvasFontFamily(fontFamily) {
    return /\s/.test(fontFamily) ? `"${fontFamily.replace(/"/g, '')}"` : fontFamily;
}

function getStringArray(value, fallback, minimumLength = 1) {
    if (!Array.isArray(value)) {
        return fallback;
    }

    const strings = value.filter((item) => typeof item === 'string' && item.length > 0);
    return strings.length >= minimumLength ? strings : fallback;
}

function getPromptPalettes(value, fallback) {
    if (!Array.isArray(value)) {
        return fallback;
    }

    const palettes = value
        .map((palette) => {
            if (!palette || typeof palette !== 'object') {
                return undefined;
            }

            const background = getStringArray(palette.background, undefined, 3);
            const curve = getStringArray(palette.curve, undefined, 1);
            const glyph = getStringArray(palette.glyph, undefined, 1);
            const stroke = getString(palette.stroke, undefined);

            if (!background || !curve || !glyph || !stroke) {
                return undefined;
            }

            return { background, curve, glyph, stroke };
        })
        .filter(Boolean);

    return palettes.length > 0 ? palettes : fallback;
}

function getImageGenerationConfig() {
    const configured = verificationEmbedConfig.imageGeneration ?? {};
    const defaultGallery = DEFAULT_IMAGE_GENERATION_CONFIG.gallery;
    const defaultComposite = defaultGallery.composite;
    const defaultPrompt = DEFAULT_IMAGE_GENERATION_CONFIG.prompt;
    const gallery = configured.gallery ?? {};
    const composite = gallery.composite ?? {};
    const prompt = configured.prompt ?? {};
    const promptDistortion = prompt.distortion ?? {};
    const promptBackgroundPattern = prompt.backgroundPattern ?? {};
    const defaultDistortion = defaultPrompt.distortion;
    const promptFinalWave = promptDistortion.finalWave ?? {};
    const defaultFinalWave = defaultDistortion.finalWave;
    const promptLargeDecoys = prompt.largeDecoyGlyphs ?? {};
    const defaultLargeDecoys = defaultPrompt.largeDecoyGlyphs;
    const defaultBackgroundPattern = defaultPrompt.backgroundPattern;
    const textStrokeWidth = getNumberRange(prompt.textStrokeWidthMin, prompt.textStrokeWidthMax, defaultPrompt.textStrokeWidthMin, defaultPrompt.textStrokeWidthMax, 0, 8);
    const textAlpha = getNumberRange(prompt.textAlphaMin, prompt.textAlphaMax, defaultPrompt.textAlphaMin, defaultPrompt.textAlphaMax, 0.4, 1);
    const textShadowAlpha = getNumberRange(prompt.textShadowAlphaMin, prompt.textShadowAlphaMax, defaultPrompt.textShadowAlphaMin, defaultPrompt.textShadowAlphaMax, 0, 1);
    const textStrokeAlpha = getNumberRange(prompt.textStrokeAlphaMin, prompt.textStrokeAlphaMax, defaultPrompt.textStrokeAlphaMin, defaultPrompt.textStrokeAlphaMax, 0, 1);
    const characterOverlap = getNumberRange(prompt.characterOverlapMin, prompt.characterOverlapMax, defaultPrompt.characterOverlapMin, defaultPrompt.characterOverlapMax, 0, 14);
    const characterOcclusionLineCount = getNumberRange(prompt.characterOcclusionLineCountMin, prompt.characterOcclusionLineCountMax, defaultPrompt.characterOcclusionLineCountMin, defaultPrompt.characterOcclusionLineCountMax, 0, 12);
    const characterOcclusionLineWidth = getNumberRange(prompt.characterOcclusionLineWidthMin, prompt.characterOcclusionLineWidthMax, defaultPrompt.characterOcclusionLineWidthMin, defaultPrompt.characterOcclusionLineWidthMax, 1, 22);
    const characterOcclusionLineAlpha = getNumberRange(prompt.characterOcclusionLineAlphaMin, prompt.characterOcclusionLineAlphaMax, defaultPrompt.characterOcclusionLineAlphaMin, defaultPrompt.characterOcclusionLineAlphaMax, 0, 1);
    const textFillAlpha = getNumberRange(prompt.textFillAlphaMin, prompt.textFillAlphaMax, defaultPrompt.textFillAlphaMin, defaultPrompt.textFillAlphaMax, 0.4, 1);
    const occlusionLineAlpha = getNumberRange(prompt.occlusionLineAlphaMin, prompt.occlusionLineAlphaMax, defaultPrompt.occlusionLineAlphaMin, defaultPrompt.occlusionLineAlphaMax, 0, 0.75);
    const occlusionLineWidth = getNumberRange(prompt.occlusionLineWidthMin, prompt.occlusionLineWidthMax, defaultPrompt.occlusionLineWidthMin, defaultPrompt.occlusionLineWidthMax, 1, 18);
    const decoyGlyphAlpha = getNumberRange(prompt.decoyGlyphAlphaMin, prompt.decoyGlyphAlphaMax, defaultPrompt.decoyGlyphAlphaMin, defaultPrompt.decoyGlyphAlphaMax, 0, 0.4);
    const decoyGlyphSize = getNumberRange(prompt.decoyGlyphSizeMin, prompt.decoyGlyphSizeMax, defaultPrompt.decoyGlyphSizeMin, defaultPrompt.decoyGlyphSizeMax, 6, 96);
    const cutoutRadius = getNumberRange(prompt.cutoutRadiusMin, prompt.cutoutRadiusMax, defaultPrompt.cutoutRadiusMin, defaultPrompt.cutoutRadiusMax, 1, 14);
    const largeDecoyAlpha = getNumberRange(promptLargeDecoys.alphaMin, promptLargeDecoys.alphaMax, defaultLargeDecoys.alphaMin, defaultLargeDecoys.alphaMax, 0, 0.28);
    const largeDecoySize = getNumberRange(promptLargeDecoys.sizeMin, promptLargeDecoys.sizeMax, defaultLargeDecoys.sizeMin, defaultLargeDecoys.sizeMax, 48, 240);

    return {
        gallery: {
            defaultSize: getPositiveInteger(gallery.defaultSize, defaultGallery.defaultSize),
            fetchTimeoutMs: getPositiveInteger(gallery.fetchTimeoutMs, defaultGallery.fetchTimeoutMs),
            composite: {
                gridColumns: getPositiveInteger(composite.gridColumns, defaultComposite.gridColumns),
                tileSize: getPositiveInteger(composite.tileSize, defaultComposite.tileSize),
                labelPadding: getNonNegativeInteger(composite.labelPadding, defaultComposite.labelPadding),
                labelSize: getPositiveInteger(composite.labelSize, defaultComposite.labelSize),
            },
        },
        prompt: {
            width: getPositiveInteger(prompt.width, defaultPrompt.width),
            minHeight: getPositiveInteger(prompt.minHeight, defaultPrompt.minHeight),
            padding: getNonNegativeInteger(prompt.padding, defaultPrompt.padding),
            fontSize: getPositiveInteger(prompt.fontSize, defaultPrompt.fontSize),
            lineHeight: getPositiveInteger(prompt.lineHeight, defaultPrompt.lineHeight),
            curveNoiseCount: getNonNegativeInteger(prompt.curveNoiseCount, defaultPrompt.curveNoiseCount),
            pixelNoiseCount: getNonNegativeInteger(prompt.pixelNoiseCount, defaultPrompt.pixelNoiseCount),
            decoyGlyphs: getString(prompt.decoyGlyphs, defaultPrompt.decoyGlyphs),
            decoyGlyphCount: getNonNegativeInteger(prompt.decoyGlyphCount, defaultPrompt.decoyGlyphCount),
            occlusionLineCount: getNonNegativeInteger(prompt.occlusionLineCount, defaultPrompt.occlusionLineCount),
            maxCharacterRotation: getBoundedNumber(prompt.maxCharacterRotation, defaultPrompt.maxCharacterRotation, 0, 0.35),
            characterJitter: getBoundedNumber(prompt.characterJitter, defaultPrompt.characterJitter, 0, 14),
            textWaveAmplitude: getBoundedNumber(prompt.textWaveAmplitude, defaultPrompt.textWaveAmplitude, 0, 24),
            textWaveFrequency: getBoundedNumber(prompt.textWaveFrequency, defaultPrompt.textWaveFrequency, 0, 3),
            textWaveRotation: getBoundedNumber(prompt.textWaveRotation, defaultPrompt.textWaveRotation, 0, 0.25),
            characterScaleJitter: getBoundedNumber(prompt.characterScaleJitter, defaultPrompt.characterScaleJitter, 0, 0.22),
            characterSkewJitter: getBoundedNumber(prompt.characterSkewJitter, defaultPrompt.characterSkewJitter, 0, 0.18),
            characterSpacingJitter: getBoundedNumber(prompt.characterSpacingJitter, defaultPrompt.characterSpacingJitter, 0, 24),
            characterOverlapEnabled: getBoolean(prompt.characterOverlapEnabled, defaultPrompt.characterOverlapEnabled),
            characterOverlapChance: getBoundedNumber(prompt.characterOverlapChance, defaultPrompt.characterOverlapChance, 0, 1),
            characterOverlapMin: characterOverlap.min,
            characterOverlapMax: characterOverlap.max,
            characterPositionMarginX: getBoundedNumber(prompt.characterPositionMarginX, defaultPrompt.characterPositionMarginX, 0, 96),
            characterPositionMarginY: getBoundedNumber(prompt.characterPositionMarginY, defaultPrompt.characterPositionMarginY, 0, 96),
            fontSizeJitter: getBoundedNumber(prompt.fontSizeJitter, defaultPrompt.fontSizeJitter, 0, 9),
            textStrokeEnabled: getBoolean(prompt.textStrokeEnabled, defaultPrompt.textStrokeEnabled),
            textShadowEnabled: getBoolean(prompt.textShadowEnabled, defaultPrompt.textShadowEnabled),
            textOffsetShadowEnabled: getBoolean(prompt.textOffsetShadowEnabled, defaultPrompt.textOffsetShadowEnabled),
            textStrokeWidthMin: textStrokeWidth.min,
            textStrokeWidthMax: textStrokeWidth.max,
            textShadowBlur: getBoundedNumber(prompt.textShadowBlur, defaultPrompt.textShadowBlur, 0, 16),
            textShadowOffsetMax: getBoundedNumber(prompt.textShadowOffsetMax, defaultPrompt.textShadowOffsetMax, 0, 16),
            textShadowAlphaMin: textShadowAlpha.min,
            textShadowAlphaMax: textShadowAlpha.max,
            textAlphaMin: textAlpha.min,
            textAlphaMax: textAlpha.max,
            textStrokeAlphaMin: textStrokeAlpha.min,
            textStrokeAlphaMax: textStrokeAlpha.max,
            characterOcclusionLineCountMin: characterOcclusionLineCount.min,
            characterOcclusionLineCountMax: characterOcclusionLineCount.max,
            characterOcclusionLineWidthMin: characterOcclusionLineWidth.min,
            characterOcclusionLineWidthMax: characterOcclusionLineWidth.max,
            characterOcclusionLineAlphaMin: characterOcclusionLineAlpha.min,
            characterOcclusionLineAlphaMax: characterOcclusionLineAlpha.max,
            textFillAlphaMin: textFillAlpha.min,
            textFillAlphaMax: textFillAlpha.max,
            textFontWeights: getStringArray(prompt.textFontWeights, defaultPrompt.textFontWeights),
            textFontFamilies: getStringArray(prompt.textFontFamilies, defaultPrompt.textFontFamilies),
            textFillColors: getStringArray(prompt.textFillColors, defaultPrompt.textFillColors),
            occlusionLineAlphaMin: occlusionLineAlpha.min,
            occlusionLineAlphaMax: occlusionLineAlpha.max,
            occlusionLineWidthMin: occlusionLineWidth.min,
            occlusionLineWidthMax: occlusionLineWidth.max,
            occlusionLineCurveAmount: getBoundedNumber(prompt.occlusionLineCurveAmount, defaultPrompt.occlusionLineCurveAmount, 0, 220),
            occlusionLineDashChance: getBoundedNumber(prompt.occlusionLineDashChance, defaultPrompt.occlusionLineDashChance, 0, 1),
            occlusionLineUsePaletteColors: getBoolean(prompt.occlusionLineUsePaletteColors, defaultPrompt.occlusionLineUsePaletteColors),
            decoyGlyphAlphaMin: decoyGlyphAlpha.min,
            decoyGlyphAlphaMax: decoyGlyphAlpha.max,
            decoyGlyphSizeMin: decoyGlyphSize.min,
            decoyGlyphSizeMax: decoyGlyphSize.max,
            decoyGlyphRotationMax: getBoundedNumber(prompt.decoyGlyphRotationMax, defaultPrompt.decoyGlyphRotationMax, 0, 3),
            largeDecoyGlyphs: {
                enabled: getBoolean(promptLargeDecoys.enabled, defaultLargeDecoys.enabled),
                count: getBoundedNumber(promptLargeDecoys.count, defaultLargeDecoys.count, 0, 8),
                alphaMin: largeDecoyAlpha.min,
                alphaMax: largeDecoyAlpha.max,
                sizeMin: largeDecoySize.min,
                sizeMax: largeDecoySize.max,
                rotationMax: getBoundedNumber(promptLargeDecoys.rotationMax, defaultLargeDecoys.rotationMax, 0, 1.2),
                centerBias: getBoundedNumber(promptLargeDecoys.centerBias, defaultLargeDecoys.centerBias, 0, 1),
            },
            cutoutCount: getBoundedNumber(prompt.cutoutCount, defaultPrompt.cutoutCount, 0, 60),
            cutoutRadiusMin: cutoutRadius.min,
            cutoutRadiusMax: cutoutRadius.max,
            cutoutAlpha: getBoundedNumber(prompt.cutoutAlpha, defaultPrompt.cutoutAlpha, 0, 0.7),
            backgroundPattern: {
                enabled: getBoolean(promptBackgroundPattern.enabled, defaultBackgroundPattern.enabled),
                gridLineCount: getBoundedNumber(promptBackgroundPattern.gridLineCount, defaultBackgroundPattern.gridLineCount, 0, 400),
                ringCount: getBoundedNumber(promptBackgroundPattern.ringCount, defaultBackgroundPattern.ringCount, 0, 400),
                microLineCount: getBoundedNumber(promptBackgroundPattern.microLineCount, defaultBackgroundPattern.microLineCount, 0, 400),
                tileSize: getBoundedNumber(promptBackgroundPattern.tileSize, defaultBackgroundPattern.tileSize, 18, 140),
                motifSize: getBoundedNumber(promptBackgroundPattern.motifSize, defaultBackgroundPattern.motifSize, 3, 28),
                alpha: getBoundedNumber(promptBackgroundPattern.alpha, defaultBackgroundPattern.alpha, 0, 0.5),
            },
            distortion: {
                enabled: getBoolean(promptDistortion.enabled, defaultDistortion.enabled),
                rowShiftAmplitude: getBoundedNumber(promptDistortion.rowShiftAmplitude, defaultDistortion.rowShiftAmplitude, 0, 30),
                rowShiftFrequency: getBoundedNumber(promptDistortion.rowShiftFrequency, defaultDistortion.rowShiftFrequency, 0, 0.2),
                columnShiftAmplitude: getBoundedNumber(promptDistortion.columnShiftAmplitude, defaultDistortion.columnShiftAmplitude, 0, 30),
                columnShiftFrequency: getBoundedNumber(promptDistortion.columnShiftFrequency, defaultDistortion.columnShiftFrequency, 0, 0.2),
                finalWave: {
                    enabled: getBoolean(promptFinalWave.enabled, defaultFinalWave.enabled),
                    amplitude: getBoundedNumber(promptFinalWave.amplitude, defaultFinalWave.amplitude, 0, 14),
                    frequency: getBoundedNumber(promptFinalWave.frequency, defaultFinalWave.frequency, 0, 0.12),
                    phaseJitter: getBoolean(promptFinalWave.phaseJitter, defaultFinalWave.phaseJitter),
                },
            },
            palettes: getPromptPalettes(prompt.palettes, defaultPrompt.palettes),
        },
    };
}

function createPromptImageNonce() {
    return crypto.randomBytes(12).toString('hex');
}

function buildPromptImageAttachmentName() {
    return `${PROMPT_IMAGE_ATTACHMENT_NAME_PREFIX}-${createPromptImageNonce()}.png`;
}

function wrapCanvasText(context, text, maxWidth) {
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (context.measureText(testLine).width <= maxWidth || !currentLine) {
            currentLine = testLine;
        }
        else {
            lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
}

function pickPromptImagePalette(promptConfig) {
    return promptConfig.palettes[Math.floor(Math.random() * promptConfig.palettes.length)];
}

function drawPromptBackgroundPattern(context, width, height, palette, promptConfig) {
    const patternConfig = promptConfig.backgroundPattern;
    if (!patternConfig?.enabled) return;

    const tileSize = Math.max(18, patternConfig.tileSize);
    const motifSize = Math.min(patternConfig.motifSize, tileSize / 3);
    const offsetStep = (width + height) / Math.max(1, patternConfig.gridLineCount);
    const motifColumns = Math.ceil(width / tileSize) + 1;
    const motifRows = Math.ceil(height / tileSize) + 1;

    context.save();
    context.globalAlpha = patternConfig.alpha;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (let index = 0; index < patternConfig.gridLineCount; index += 1) {
        const offset = index * offsetStep;
        context.strokeStyle = palette.curve[index % palette.curve.length];
        context.lineWidth = index % 3 === 0 ? 1.4 : 0.8;
        context.beginPath();
        context.moveTo(offset - height, 0);
        context.lineTo(offset, height);
        context.stroke();

        if (index % 2 === 0) {
            context.strokeStyle = palette.glyph[index % palette.glyph.length];
            context.beginPath();
            context.moveTo(width - offset + height, 0);
            context.lineTo(width - offset, height);
            context.stroke();
        }
    }

    for (let row = 0; row < motifRows; row += 1) {
        for (let column = 0; column < motifColumns; column += 1) {
            const x = (column * tileSize) + ((row % 2) * tileSize / 2);
            const y = row * tileSize;
            const motifIndex = row + column;

            context.strokeStyle = motifIndex % 2 === 0 ? palette.glyph[motifIndex % palette.glyph.length] : palette.curve[motifIndex % palette.curve.length];
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(x, y - motifSize);
            context.lineTo(x + motifSize, y);
            context.lineTo(x, y + motifSize);
            context.lineTo(x - motifSize, y);
            context.closePath();
            context.stroke();
        }
    }

    for (let index = 0; index < patternConfig.ringCount; index += 1) {
        const radiusStep = Math.max(motifSize * 1.5, Math.min(width, height) / Math.max(1, patternConfig.ringCount));
        const radius = motifSize + (index * radiusStep * 0.65);
        const x = (index % 2 === 0) ? width * 0.2 : width * 0.8;
        const y = (index % 3 === 0) ? height * 0.22 : height * 0.78;

        context.strokeStyle = index % 2 === 0 ? palette.curve[index % palette.curve.length] : palette.glyph[index % palette.glyph.length];
        context.lineWidth = index % 4 === 0 ? 1.2 : 0.7;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.stroke();
    }

    for (let index = 0; index < patternConfig.microLineCount; index += 1) {
        const column = index % Math.max(1, Math.ceil(width / (tileSize / 2)));
        const row = Math.floor(index / Math.max(1, Math.ceil(width / (tileSize / 2))));
        const x = (column * tileSize / 2) + ((row % 2) * motifSize);
        const y = (row * tileSize / 2) % (height + tileSize);
        const hatchLength = motifSize * 1.4;

        context.strokeStyle = index % 2 === 0 ? palette.curve[0] : palette.glyph[0];
        context.lineWidth = 0.8;
        context.beginPath();
        context.moveTo(x - hatchLength / 2, y - hatchLength / 2);
        context.lineTo(x + hatchLength / 2, y + hatchLength / 2);
        context.stroke();
    }

    context.restore();
}

function drawPromptImageNoise(context, width, height, palette, promptConfig) {
    const patternStride = Math.max(12, height / Math.max(1, promptConfig.curveNoiseCount / 4));

    for (let index = 0; index < promptConfig.curveNoiseCount; index += 1) {
        const row = index % Math.max(1, Math.ceil(height / patternStride));
        const band = Math.floor(index / Math.max(1, Math.ceil(height / patternStride)));
        const y = (row * patternStride) + ((band % 4) * patternStride / 4);
        const wave = 18 + ((index % 5) * 4);
        const direction = index % 2 === 0 ? 1 : -1;

        context.save();
        context.globalAlpha = 0.10 + ((index % 4) * 0.035);
        context.strokeStyle = palette.curve[index % palette.curve.length];
        context.lineWidth = 0.8 + (index % 3);
        context.beginPath();
        context.moveTo(-24, y);
        context.bezierCurveTo(
            width * 0.28,
            y + (wave * direction),
            width * 0.72,
            y - (wave * direction),
            width + 24,
            y,
        );
        context.stroke();
        context.restore();
    }

    for (let index = 0; index < promptConfig.pixelNoiseCount; index += 1) {
        context.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
        context.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 4, 1 + Math.random() * 4);
    }
}

function drawPromptDecoyGlyphs(context, width, height, palette, promptConfig) {
    const glyphs = promptConfig.decoyGlyphs;

    for (let index = 0; index < promptConfig.decoyGlyphCount; index += 1) {
        const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
        context.save();
        context.translate(Math.random() * width, Math.random() * height);
        context.rotate(randomBetween(-promptConfig.decoyGlyphRotationMax, promptConfig.decoyGlyphRotationMax));
        context.globalAlpha = randomBetween(promptConfig.decoyGlyphAlphaMin, promptConfig.decoyGlyphAlphaMax);
        context.font = `700 ${randomBetween(promptConfig.decoyGlyphSizeMin, promptConfig.decoyGlyphSizeMax)}px Arial, Helvetica, sans-serif`;
        context.fillStyle = palette.glyph[Math.floor(Math.random() * palette.glyph.length)];
        context.fillText(glyph, 0, 0);
        context.restore();
    }
}

function drawPromptLargeDecoyGlyphs(context, width, height, palette, promptConfig) {
    const largeDecoyConfig = promptConfig.largeDecoyGlyphs;
    if (!largeDecoyConfig?.enabled || largeDecoyConfig.count < 1) return;

    const glyphs = promptConfig.decoyGlyphs;
    const centerX = width / 2;
    const centerY = height / 2;
    const spreadX = width * (1 - largeDecoyConfig.centerBias);
    const spreadY = height * (1 - largeDecoyConfig.centerBias);

    for (let index = 0; index < largeDecoyConfig.count; index += 1) {
        const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
        const fontWeight = pickRandomItem(promptConfig.textFontWeights);
        const fontFamily = formatCanvasFontFamily(pickRandomItem(promptConfig.textFontFamilies));

        const x = clamp(
            centerX + randomBetween(-width * 0.42, width * 0.42) * largeDecoyConfig.centerBias + randomBetween(-spreadX, spreadX),
            width * 0.12,
            width * 0.88,
        );
        const y = clamp(
            centerY + randomBetween(-height * 0.30, height * 0.30) * largeDecoyConfig.centerBias + randomBetween(-spreadY, spreadY),
            height * 0.20,
            height * 0.82,
        );

        context.save();
        context.translate(x, y);
        context.rotate(randomBetween(-largeDecoyConfig.rotationMax, largeDecoyConfig.rotationMax));
        context.globalAlpha = randomBetween(largeDecoyConfig.alphaMin, largeDecoyConfig.alphaMax);
        context.font = `${fontWeight} ${randomBetween(largeDecoyConfig.sizeMin, largeDecoyConfig.sizeMax)}px ${fontFamily}, Arial, Helvetica, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = Math.random() > 0.5
            ? pickRandomItem(palette.glyph)
            : pickRandomItem(palette.curve);
        context.fillText(glyph, 0, 0);
        context.restore();
    }
}

function drawPromptOcclusionLines(context, width, height, palette, promptConfig) {
    for (let index = 0; index < promptConfig.occlusionLineCount; index += 1) {
        const y = Math.random() * height;
        const curveAmount = promptConfig.occlusionLineCurveAmount;

        context.save();
        context.globalAlpha = randomBetween(promptConfig.occlusionLineAlphaMin, promptConfig.occlusionLineAlphaMax);
        if (promptConfig.occlusionLineUsePaletteColors) {
            const occlusionPalette = [
                ...palette.background,
                ...palette.curve,
                ...palette.glyph,
            ];
            context.strokeStyle = pickRandomItem(occlusionPalette);
        }
        else {
            context.strokeStyle = index % 2 === 0 ? '#07111f' : '#ffffff';
        }
        context.lineWidth = randomBetween(promptConfig.occlusionLineWidthMin, promptConfig.occlusionLineWidthMax);
        context.lineCap = 'round';
        context.lineJoin = 'round';

        if (Math.random() < promptConfig.occlusionLineDashChance) {
            context.setLineDash([
                randomBetween(10, 34),
                randomBetween(6, 22),
            ]);
        }

        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(
            width * 0.25,
            y + randomBetween(-curveAmount, curveAmount),
            width * 0.75,
            y + randomBetween(-curveAmount, curveAmount),
            width,
            y + randomBetween(-curveAmount * 0.5, curveAmount * 0.5),
        );
        context.stroke();
        context.restore();
    }
}

function drawCharacterOcclusionLines(context, characterWidth, fontSize, palette, promptConfig) {
    const lineCount = Math.round(randomBetween(
        promptConfig.characterOcclusionLineCountMin,
        promptConfig.characterOcclusionLineCountMax,
    ));

    for (let index = 0; index < lineCount; index += 1) {
        const y = randomBetween(-fontSize * 0.42, fontSize * 0.34);
        const xPad = randomBetween(characterWidth * 0.18, characterWidth * 0.42);

        context.save();
        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.globalAlpha = randomBetween(
            promptConfig.characterOcclusionLineAlphaMin,
            promptConfig.characterOcclusionLineAlphaMax,
        );
        context.strokeStyle = Math.random() > 0.45
            ? pickRandomItem(palette.curve)
            : pickRandomItem(palette.glyph);
        context.lineWidth = randomBetween(
            promptConfig.characterOcclusionLineWidthMin,
            promptConfig.characterOcclusionLineWidthMax,
        );
        context.lineCap = 'round';
        context.lineJoin = 'round';

        context.beginPath();
        context.moveTo((-characterWidth / 2) - xPad, y);
        context.bezierCurveTo(
            -characterWidth * 0.18,
            y + randomBetween(-fontSize * 0.18, fontSize * 0.18),
            characterWidth * 0.18,
            y + randomBetween(-fontSize * 0.18, fontSize * 0.18),
            (characterWidth / 2) + xPad,
            y + randomBetween(-fontSize * 0.10, fontSize * 0.10),
        );
        context.stroke();
        context.restore();
    }
}

function drawPromptTextLine(context, line, centerX, centerY, palette, promptConfig, lineIndex = 0, canvasWidth = promptConfig.width, canvasHeight = promptConfig.minHeight) {
    const characters = [...line];
    const characterWidths = characters.map((character) => context.measureText(character).width);
    const overlaps = characters.map((character, index) => {
        const nextCharacter = characters[index + 1];

        if (
            !promptConfig.characterOverlapEnabled
            || index >= characters.length - 1
            || character === ' '
            || nextCharacter === ' '
            || Math.random() > promptConfig.characterOverlapChance
        ) {
            return 0;
        }

        return randomBetween(promptConfig.characterOverlapMin, promptConfig.characterOverlapMax);
    });
    const totalWidth = characterWidths.reduce((sum, width, index) => sum + width - overlaps[index], 0);
    const wavePhase = Math.random() * Math.PI * 2 + lineIndex;
    let currentX = centerX - (totalWidth / 2);

    characters.forEach((character, index) => {
        const characterWidth = characterWidths[index];
        const wave = Math.sin((index * promptConfig.textWaveFrequency) + wavePhase);
        const spacingJitter = randomBetween(-promptConfig.characterSpacingJitter, promptConfig.characterSpacingJitter);
        const rawX = currentX + (characterWidth / 2) + randomBetween(-promptConfig.characterJitter, promptConfig.characterJitter);
        const rawY = centerY + (wave * promptConfig.textWaveAmplitude) + randomBetween(-promptConfig.characterJitter, promptConfig.characterJitter);
        const safeMarginX = Math.min(promptConfig.characterPositionMarginX, Math.floor(canvasWidth / 2));
        const safeMarginY = Math.min(promptConfig.characterPositionMarginY, Math.floor(canvasHeight / 2));
        const x = clamp(rawX, safeMarginX, canvasWidth - safeMarginX);
        const y = clamp(rawY, safeMarginY, canvasHeight - safeMarginY);
        const fontSize = promptConfig.fontSize + randomBetween(-promptConfig.fontSizeJitter, promptConfig.fontSizeJitter);
        const rotation = randomBetween(-promptConfig.maxCharacterRotation, promptConfig.maxCharacterRotation) + (wave * promptConfig.textWaveRotation);
        const scaleX = 1 + randomBetween(-promptConfig.characterScaleJitter, promptConfig.characterScaleJitter);
        const scaleY = 1 + randomBetween(-promptConfig.characterScaleJitter, promptConfig.characterScaleJitter);
        const safeScaleX = Math.max(0.65, scaleX);
        const safeScaleY = Math.max(0.65, scaleY);
        const skewX = randomBetween(-promptConfig.characterSkewJitter, promptConfig.characterSkewJitter);
        const skewY = randomBetween(-promptConfig.characterSkewJitter, promptConfig.characterSkewJitter);
        const strokeWidth = randomBetween(promptConfig.textStrokeWidthMin, promptConfig.textStrokeWidthMax);
        const fontWeight = pickRandomItem(promptConfig.textFontWeights);
        const fontFamily = formatCanvasFontFamily(pickRandomItem(promptConfig.textFontFamilies));
        const fillColor = pickRandomItem(promptConfig.textFillColors);
        const shadowAlpha = randomBetween(promptConfig.textShadowAlphaMin, promptConfig.textShadowAlphaMax);

        context.save();
        context.translate(x, y);
        context.rotate(rotation);
        context.transform(safeScaleX, skewY, skewX, safeScaleY, 0, 0);
        context.font = `${fontWeight} ${fontSize}px ${fontFamily}, Arial, Helvetica, sans-serif`;
        context.globalAlpha = randomBetween(promptConfig.textAlphaMin, promptConfig.textAlphaMax);

        if (promptConfig.textShadowEnabled) {
            context.shadowColor = `rgba(0, 0, 0, ${shadowAlpha})`;
            context.shadowBlur = promptConfig.textShadowBlur;
            context.shadowOffsetX = randomBetween(-promptConfig.textShadowOffsetMax, promptConfig.textShadowOffsetMax);
            context.shadowOffsetY = randomBetween(-promptConfig.textShadowOffsetMax, promptConfig.textShadowOffsetMax);
        }
        else {
            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
        }

        if (promptConfig.textOffsetShadowEnabled) {
            context.fillStyle = 'rgba(0, 0, 0, 0.42)';
            context.fillText(character, 3, 4);
        }

        if (promptConfig.textStrokeEnabled && strokeWidth > 0 && promptConfig.textStrokeAlphaMax > 0) {
            context.shadowBlur = 0;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
            context.fillStyle = palette.stroke;
            context.globalAlpha = randomBetween(promptConfig.textStrokeAlphaMin, promptConfig.textStrokeAlphaMax);
            context.fillText(character, randomBetween(-strokeWidth, strokeWidth), randomBetween(-strokeWidth, strokeWidth));
        }

        context.globalAlpha = randomBetween(promptConfig.textFillAlphaMin, promptConfig.textFillAlphaMax);
        context.fillStyle = fillColor;
        context.fillText(character, 0, 0);
        drawCharacterOcclusionLines(context, characterWidth, fontSize, palette, promptConfig);
        context.restore();

        currentX += characterWidth - overlaps[index] + spacingJitter;
    });
}

function applyPromptImageDistortion(context, width, height, promptConfig) {
    const distortionConfig = promptConfig.distortion;
    if (!distortionConfig?.enabled) return;

    const source = context.getImageData(0, 0, width, height);
    const output = context.createImageData(width, height);
    const sourceData = source.data;
    const outputData = output.data;

    for (let y = 0; y < height; y += 1) {
        const rowShift = Math.round(Math.sin(y * distortionConfig.rowShiftFrequency) * distortionConfig.rowShiftAmplitude);

        for (let x = 0; x < width; x += 1) {
            const columnShift = Math.round(Math.sin(x * distortionConfig.columnShiftFrequency) * distortionConfig.columnShiftAmplitude);
            const sourceX = clamp(x + rowShift, 0, width - 1);
            const sourceY = clamp(y + columnShift, 0, height - 1);
            const sourceIndex = ((sourceY * width) + sourceX) * 4;
            const outputIndex = ((y * width) + x) * 4;

            outputData[outputIndex] = sourceData[sourceIndex];
            outputData[outputIndex + 1] = sourceData[sourceIndex + 1];
            outputData[outputIndex + 2] = sourceData[sourceIndex + 2];
            outputData[outputIndex + 3] = sourceData[sourceIndex + 3];
        }
    }

    context.putImageData(output, 0, 0);
}

function applyPromptFinalWaveDistortion(context, width, height, promptConfig) {
    const waveConfig = promptConfig.distortion?.finalWave;
    if (!waveConfig?.enabled || waveConfig.amplitude <= 0 || waveConfig.frequency <= 0) return;

    const phase = waveConfig.phaseJitter ? Math.random() * Math.PI * 2 : 0;
    const source = context.getImageData(0, 0, width, height);
    const output = context.createImageData(width, height);
    const sourceData = source.data;
    const outputData = output.data;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const verticalShift = Math.round(Math.sin((x * waveConfig.frequency) + phase) * waveConfig.amplitude);
            const sourceX = x;
            const sourceY = clamp(y + verticalShift, 0, height - 1);
            const sourceIndex = ((sourceY * width) + sourceX) * 4;
            const outputIndex = ((y * width) + x) * 4;

            outputData[outputIndex] = sourceData[sourceIndex];
            outputData[outputIndex + 1] = sourceData[sourceIndex + 1];
            outputData[outputIndex + 2] = sourceData[sourceIndex + 2];
            outputData[outputIndex + 3] = sourceData[sourceIndex + 3];
        }
    }

    context.putImageData(output, 0, 0);
}

function drawPromptCutouts(context, width, height, promptConfig) {
    if (promptConfig.cutoutCount < 1 || promptConfig.cutoutAlpha <= 0) return;

    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.globalAlpha = promptConfig.cutoutAlpha;

    for (let index = 0; index < promptConfig.cutoutCount; index += 1) {
        context.beginPath();
        context.arc(
            Math.random() * width,
            Math.random() * height,
            randomBetween(promptConfig.cutoutRadiusMin, promptConfig.cutoutRadiusMax),
            0,
            Math.PI * 2,
        );
        context.fill();
    }

    context.restore();
    context.globalCompositeOperation = 'source-over';
}

async function createPromptImageAttachment(prompt) {
    const { createCanvas } = getCanvasApi();
    const { prompt: promptConfig } = getImageGenerationConfig();
    const measureCanvas = createCanvas(promptConfig.width, promptConfig.minHeight);
    const measureContext = measureCanvas.getContext('2d');
    measureContext.font = `700 ${promptConfig.fontSize}px Arial, Helvetica, sans-serif`;
    const maxTextWidth = Math.max(1, promptConfig.width - (promptConfig.padding * 2));
    const lines = wrapCanvasText(measureContext, prompt, maxTextWidth);
    const height = Math.max(promptConfig.minHeight, (promptConfig.padding * 2) + (lines.length * promptConfig.lineHeight));
    const canvas = createCanvas(promptConfig.width, height);
    const context = canvas.getContext('2d');

    const palette = pickPromptImagePalette(promptConfig);
    const gradient = context.createLinearGradient(0, 0, promptConfig.width, height);
    gradient.addColorStop(0, palette.background[0]);
    gradient.addColorStop(0.5, palette.background[1]);
    gradient.addColorStop(1, palette.background[2]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, promptConfig.width, height);

    drawPromptBackgroundPattern(context, promptConfig.width, height, palette, promptConfig);
    drawPromptImageNoise(context, promptConfig.width, height, palette, promptConfig);
    drawPromptDecoyGlyphs(context, promptConfig.width, height, palette, promptConfig);
    drawPromptLargeDecoyGlyphs(context, promptConfig.width, height, palette, promptConfig);

    context.font = `700 ${promptConfig.fontSize}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'center';

    const startY = (height - ((lines.length - 1) * promptConfig.lineHeight)) / 2;
    lines.forEach((line, index) => {
        const y = startY + (index * promptConfig.lineHeight);
        const x = promptConfig.width / 2;
        drawPromptTextLine(context, line, x, y, palette, promptConfig, index, promptConfig.width, height);
    });

    applyPromptImageDistortion(context, promptConfig.width, height, promptConfig);
    applyPromptFinalWaveDistortion(context, promptConfig.width, height, promptConfig);
    drawPromptCutouts(context, promptConfig.width, height, promptConfig);
    drawPromptOcclusionLines(context, promptConfig.width, height, palette, promptConfig);

    const name = buildPromptImageAttachmentName();
    const buffer = await canvas.encode('png');

    return {
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
    };
}

async function preparePromptImageAttachment(challenge, step) {
    if (!step?.promptImageGallery && !challenge?.promptImageGallery) {
        return undefined;
    }

    const prompt = resolvePrompt(challenge, step);
    return createPromptImageAttachment(prompt);
}

function createGalleryImageNonce() {
    return crypto.randomBytes(12).toString('hex');
}

function getGalleryImageExtension(imageUrl, contentType) {
    const contentTypeExtensions = new Map([
        ['image/jpeg', 'jpg'],
        ['image/jpg', 'jpg'],
        ['image/png', 'png'],
        ['image/gif', 'gif'],
        ['image/webp', 'webp'],
    ]);

    const normalizedContentType = String(contentType ?? '').split(';')[0].trim().toLowerCase();
    if (contentTypeExtensions.has(normalizedContentType)) {
        return contentTypeExtensions.get(normalizedContentType);
    }

    try {
        const pathname = new URL(imageUrl).pathname;
        const extensionMatch = pathname.match(/\.([a-zA-Z0-9]{1,8})$/);
        if (extensionMatch) {
            return extensionMatch[1].toLowerCase();
        }
    }
    catch (err) {
        // Fall back to png below when the configured image URL is not parseable.
    }

    return 'png';
}

function buildGalleryAttachmentName(image, extension) {
    return `${GALLERY_IMAGE_ATTACHMENT_NAME_PREFIX}-${createGalleryImageNonce()}-${image.position}.${extension}`;
}

function isLocalGalleryImage(image) {
    return Boolean(image?.directory && (image.fileName || image.url));
}

function resolveLocalGalleryImagePath(image) {
    const fileName = image.fileName ?? image.url;
    const resolvedDirectory = path.resolve(image.directory);
    const resolvedPath = path.resolve(resolvedDirectory, fileName);

    if (!resolvedPath.startsWith(`${resolvedDirectory}${path.sep}`) && resolvedPath !== resolvedDirectory) {
        throw new Error(`Invalid local verification gallery image path for position ${image.position}.`);
    }

    return resolvedPath;
}

function getGalleryImageExtensionFromPath(filePath) {
    const extension = path.extname(filePath).slice(1).toLowerCase();

    return /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'png';
}

const localGalleryImageBufferCache = new Map();

async function readCachedLocalImageBuffer(filePath) {
    const stat = await fs.stat(filePath);
    const cacheKey = `${filePath}:${stat.size}:${stat.mtimeMs}`;

    if (localGalleryImageBufferCache.has(cacheKey)) {
        return localGalleryImageBufferCache.get(cacheKey);
    }

    const buffer = await fs.readFile(filePath);
    localGalleryImageBufferCache.set(cacheKey, buffer);
    return buffer;
}

async function readLocalGalleryImageAttachment(image) {
    const filePath = resolveLocalGalleryImagePath(image);
    const extension = getGalleryImageExtensionFromPath(filePath);
    const name = buildGalleryAttachmentName(image, extension);
    const buffer = await readCachedLocalImageBuffer(filePath);

    return {
        ...image,
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
        buffer,
    };
}

function buildGalleryCompositeAttachmentName() {
    return `${GALLERY_COMPOSITE_ATTACHMENT_NAME_PREFIX}-${createGalleryImageNonce()}.png`;
}

function shouldUseCompositeGallery(challenge, step) {
    return step?.compositeImageGallery === true || challenge?.compositeImageGallery === true;
}

async function fetchRemoteGalleryImageAttachment(image) {
    const { gallery: galleryConfig } = getImageGenerationConfig();
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), galleryConfig.fetchTimeoutMs);
    let response;

    try {
        response = await fetch(image.url, { signal: abortController.signal });
    }
    catch (err) {
        if (err.name === 'AbortError') {
            const timeoutError = new Error(`Timed out fetching verification gallery image for position ${image.position} after ${galleryConfig.fetchTimeoutMs}ms.`);
            timeoutError.code = GALLERY_IMAGE_FETCH_TIMEOUT_CODE;
            throw timeoutError;
        }

        throw err;
    }
    finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch verification gallery image for position ${image.position}: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    const extension = getGalleryImageExtension(image.url, contentType);
    const name = buildGalleryAttachmentName(image, extension);
    const buffer = await response.buffer();

    return {
        ...image,
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
        buffer,
    };
}

async function fetchGalleryImageAttachment(image) {
    if (isLocalGalleryImage(image)) {
        return readLocalGalleryImageAttachment(image);
    }

    return fetchRemoteGalleryImageAttachment(image);
}

function drawImageCover(context, image, x, y, width, height) {
    const sourceRatio = image.width / image.height;
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    if (sourceRatio > targetRatio) {
        sourceWidth = image.height * targetRatio;
        sourceX = (image.width - sourceWidth) / 2;
    }
    else {
        sourceHeight = image.width / targetRatio;
        sourceY = (image.height - sourceHeight) / 2;
    }

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawGalleryCompositeLabel(context, label, x, y, compositeConfig) {
    context.save();
    context.font = `700 ${compositeConfig.labelSize}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'top';
    context.textAlign = 'left';
    const metrics = context.measureText(label);
    const labelWidth = metrics.width + (compositeConfig.labelPadding * 2);
    const labelHeight = compositeConfig.labelSize + (compositeConfig.labelPadding * 1.5);

    context.fillStyle = 'rgba(0, 0, 0, 0.72)';
    context.fillRect(x, y, labelWidth, labelHeight);
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineWidth = 4;
    context.strokeRect(x, y, labelWidth, labelHeight);
    context.fillStyle = '#ffffff';
    context.fillText(label, x + compositeConfig.labelPadding, y + (compositeConfig.labelPadding / 2));
    context.restore();
}

async function createGalleryCompositeAttachment(selectedImages) {
    const { createCanvas, loadImage } = getCanvasApi();
    const { gallery: { composite: compositeConfig } } = getImageGenerationConfig();
    const columns = compositeConfig.gridColumns;
    const rows = Math.ceil(selectedImages.length / columns);
    const width = columns * compositeConfig.tileSize;
    const height = rows * compositeConfig.tileSize;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    context.fillStyle = '#05070d';
    context.fillRect(0, 0, width, height);

    const loadedImages = await Promise.all(selectedImages.map((image) => loadImage(image.buffer)));

    loadedImages.forEach((loadedImage, index) => {
        const image = selectedImages[index];
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = column * compositeConfig.tileSize;
        const y = row * compositeConfig.tileSize;

        drawImageCover(context, loadedImage, x, y, compositeConfig.tileSize, compositeConfig.tileSize);
        drawGalleryCompositeLabel(context, String(image.position), x + 12, y + 12, compositeConfig);
    });

    const name = buildGalleryCompositeAttachmentName();
    const buffer = await canvas.encode('png');

    return {
        displayUrl: `attachment://${name}`,
        attachment: new Discord.AttachmentBuilder(buffer, { name }),
    };
}

async function prepareGalleryImageAttachments(galleryState) {
    if (!galleryState?.selectedImages?.length) {
        return galleryState;
    }

    const fetchedImages = await Promise.all(galleryState.selectedImages.map(fetchGalleryImageAttachment));
    const compositeImage = galleryState.useCompositeImage
        ? await createGalleryCompositeAttachment(fetchedImages)
        : undefined;
    const selectedImages = fetchedImages.map(({ buffer, attachment, ...image }) => {
        if (galleryState.useCompositeImage) {
            return image;
        }

        return { ...image, attachment };
    });

    return {
        ...galleryState,
        selectedImages,
        compositeImage,
    };
}

function createGalleryToken() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function shuffleArray(items) {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
}

function pickRandomItems(items, count, itemRole) {
    if (items.length < count) {
        throw new Error(`Verification image pool does not contain enough ${itemRole} images. Required ${count}, found ${items.length}.`);
    }

    return shuffleArray(items).slice(0, count);
}

function pickRandomItemsWithRepeats(items, count, itemRole) {
    if (count <= 0) {
        return [];
    }

    if (items.length < 1) {
        throw new Error(`Verification image pool does not contain any ${itemRole} images. Required ${count}.`);
    }

    if (items.length >= count) {
        return pickRandomItems(items, count, itemRole);
    }

    const selectedItems = [];

    while (selectedItems.length < count) {
        selectedItems.push(items[Math.floor(Math.random() * items.length)]);
    }

    return selectedItems;
}

function pickRandomItemsWithRepeatLimit(items, count, maxRepeats, itemRole) {
    const normalizedMaxRepeats = Math.floor(Number(maxRepeats ?? 1));

    if (!Number.isInteger(normalizedMaxRepeats) || normalizedMaxRepeats < 1) {
        throw new Error(`Invalid ${itemRole} image repeat limit: ${maxRepeats}`);
    }

    if (items.length * normalizedMaxRepeats < count) {
        throw new Error(`Verification image pool does not contain enough ${itemRole} image capacity. Required ${count}, capacity ${items.length * normalizedMaxRepeats}.`);
    }

    const selectedItems = [];
    const selectedCounts = new Map();

    while (selectedItems.length < count) {
        const availableItems = items.filter((item) => (selectedCounts.get(item.id) ?? 0) < normalizedMaxRepeats);
        const selectedItem = availableItems[Math.floor(Math.random() * availableItems.length)];
        selectedCounts.set(selectedItem.id, (selectedCounts.get(selectedItem.id) ?? 0) + 1);
        selectedItems.push(selectedItem);
    }

    return selectedItems;
}

function resolveGalleryImageCounts(challenge, step) {
    const { gallery: galleryConfig } = getImageGenerationConfig();
    const gallerySize = Number(step?.gallerySize ?? challenge.gallerySize ?? galleryConfig.defaultSize);
    const solutionRange = step?.solutionImageCount ?? challenge.solutionImageCount ?? { min: 1, max: 1 };
    const controlRange = step?.controlImageCount ?? challenge.controlImageCount;

    if (!Number.isInteger(gallerySize) || gallerySize < 1) {
        throw new Error(`Invalid gallery size for challenge ${challenge.id}: ${gallerySize}`);
    }

    const solutionMin = Math.ceil(Number(solutionRange.min ?? 1));
    const solutionMax = Math.floor(Number(solutionRange.max ?? 1));
    const controlMin = controlRange ? Math.ceil(Number(controlRange.min ?? 0)) : 0;
    const controlMax = controlRange ? Math.floor(Number(controlRange.max ?? gallerySize)) : gallerySize;
    const validSolutionCounts = [];

    for (let solutionCount = solutionMin; solutionCount <= solutionMax; solutionCount += 1) {
        const controlCount = gallerySize - solutionCount;

        if (solutionCount >= 1 && controlCount >= 0 && controlCount >= controlMin && controlCount <= controlMax) {
            validSolutionCounts.push(solutionCount);
        }
    }

    if (validSolutionCounts.length < 1) {
        throw new Error(`No valid solution/control image count combination exists for challenge ${challenge.id}.`);
    }

    const solutionCount = validSolutionCounts[Math.floor(Math.random() * validSolutionCounts.length)];
    const controlCount = gallerySize - solutionCount;

    return { gallerySize, solutionCount, controlCount };
}

function getPoolImagesByIds(imagePool, imageIds, roleName, challengeId) {
    const imageMap = new Map((imagePool.images ?? []).map((image) => [image.id, image]));
    const images = [];

    for (const imageId of imageIds) {
        const image = imageMap.get(imageId);
        if (!image) {
            throw new Error(`Verification challenge "${challengeId}" references unknown ${roleName} image ID "${imageId}" in pool "${imagePool.id}".`);
        }

        images.push({
            ...image,
            role: roleName,
        });
    }

    return images;
}

function createGalleryState(challenge, stepIndex = 0, verificationSettings) {
    const step = getVerificationChallengeStep(challenge.id, stepIndex);
    const imagePoolId = step?.imagePoolId ?? challenge.imagePoolId;
    const imagePool = getVerificationImagePool(imagePoolId);

    if (!imagePool) {
        throw new Error(`Unknown verification image pool "${imagePoolId}" for challenge "${challenge.id}".`);
    }

    const { solutionCount, controlCount } = resolveGalleryImageCounts(challenge, step);
    const solutionImageIds = resolveSolutionImageIds(challenge, step, verificationSettings);
    const controlImageIds = resolveControlImageIds(challenge, step, verificationSettings);

    if (solutionImageIds.length < 1) {
        throw new Error(`Verification challenge "${challenge.id}" has no configured solution image IDs.`);
    }

    if (controlImageIds.length < 1) {
        throw new Error(`Verification challenge "${challenge.id}" has no configured control image IDs.`);
    }

    const solutionImages = getPoolImagesByIds(imagePool, solutionImageIds, 'solution', challenge.id);
    const controlImages = getPoolImagesByIds(imagePool, controlImageIds, 'control', challenge.id);
    const maxControlImageRepeats = step?.maxControlImageRepeats ?? challenge.maxControlImageRepeats ?? 1;
    const selectedImages = shuffleArray([
        ...pickRandomItemsWithRepeats(solutionImages, solutionCount, 'solution'),
        ...pickRandomItemsWithRepeatLimit(controlImages, controlCount, maxControlImageRepeats, 'control'),
    ]).map((image, index) => ({
        ...image,
        directory: imagePool.directory,
        position: index + 1,
    }));

    return {
        token: createGalleryToken(),
        imagePoolId,
        selectedImages,
        useCompositeImage: shouldUseCompositeGallery(challenge, step),
        solutionPositions: selectedImages
            .filter((image) => image.role === 'solution')
            .map((image) => image.position)
            .sort((left, right) => left - right),
    };
}


function getVerificationImagePool(poolId) {
    if (!poolId) return undefined;

    return verificationImagesRegistry[poolId];
}

async function getLocalVerificationImagePoolIssues() {
    const issues = [];

    for (const pool of Object.values(verificationImagesRegistry)) {
        if (!pool.directory) continue;

        const resolvedDirectory = path.resolve(pool.directory);

        for (const image of pool.images ?? []) {
            if (!image.fileName) continue;

            const filePath = path.resolve(resolvedDirectory, image.fileName);

            if (!filePath.startsWith(`${resolvedDirectory}${path.sep}`)) {
                issues.push(`${pool.id}/${image.id}: invalid local path ${image.fileName}`);
                continue;
            }

            try {
                await fs.access(filePath);
            }
            catch (err) {
                issues.push(`${pool.id}/${image.id}: missing local file ${filePath}`);
            }
        }
    }

    return issues;
}

module.exports = {
    GALLERY_IMAGE_FETCH_TIMEOUT_CODE,
    ['verification' + 'ImagePools']: verificationImagesRegistry,
    getVerificationImagePool,
    getLocalVerificationImagePoolIssues,
    createGalleryState,
    prepareGalleryImageAttachments,
    createPromptImageAttachment,
    preparePromptImageAttachment,
};
