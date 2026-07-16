const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Discord = require('discord.js');

const repositoryRoot = path.resolve(__dirname, '..');
const verificationDirectory = path.join(repositoryRoot, 'commands', 'Warden', 'verification');
const interactionDelivery = require(path.join(verificationDirectory, 'verificationInteraction'));
const verificationResponses = require(path.join(verificationDirectory, 'verificationResponses'));
const verificationValidation = require(path.join(verificationDirectory, 'verificationValidation'));
const verificationChallenges = require(path.join(verificationDirectory, 'verificationChallenges', 'verificationChallenges'));
const verificationImages = require(path.join(verificationDirectory, 'verificationImages'));
const galleryStandard = require(path.join(verificationDirectory, 'verificationChallenges', 'questionTasks', 'galleryStandard'));
const rotationAlignment = require(path.join(verificationDirectory, 'verificationChallenges', 'questionTasks', 'rotationAlignment'));
const galleryShared = require(path.join(verificationDirectory, 'verificationChallenges', 'questionTasks', 'shared', 'gallery'));

function buildCatalogReport(challengeId, questions) {
    return verificationValidation.evaluateVerificationConfig({
        mode: 'challenge',
        activeChallengeIds: [challengeId],
        challenges: [{ id: challengeId, enabled: true, questions }],
    });
}

function getIssueCodes(report) {
    return new Set(report.activeBlockingIssues.map((issue) => issue.code));
}

function restoreModule(modulePath, cachedModule) {
    delete require.cache[modulePath];
    if (cachedModule) require.cache[modulePath] = cachedModule;
}

test('panel modal acknowledgement updates the source and keeps errors in follow-ups', async () => {
    const calls = [];
    const interaction = {
        deferred: false,
        replied: false,
        isFromMessage: () => true,
        deferUpdate: async () => {
            interaction.deferred = true;
            calls.push(['deferUpdate']);
        },
        editReply: async (payload) => calls.push(['editReply', payload]),
        followUp: async (payload) => calls.push(['followUp', payload]),
    };

    const acknowledgement = await interactionDelivery.acknowledgePanelSubmit(interaction);
    await interactionDelivery.updateSourcePanel(interaction, {
        content: 'updated panel',
        flags: Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
    }, { acknowledgement });
    await interactionDelivery.sendAcknowledgedNotice(interaction, acknowledgement, { content: 'validation error' });

    assert.equal(acknowledgement.mode, 'source-update');
    assert.deepEqual(calls.map(([method]) => method), ['deferUpdate', 'editReply', 'followUp']);
    assert.equal(calls[1][1].content, 'updated panel');
    assert.equal(calls[1][1].flags, Discord.MessageFlags.IsComponentsV2);
    assert.equal(calls[2][1].content, 'validation error');
    assert.ok(calls[2][1].flags & Discord.MessageFlags.Ephemeral);
});

test('non-message modal acknowledgement edits its deferred ephemeral reply', async () => {
    const calls = [];
    const interaction = {
        deferred: false,
        replied: false,
        isFromMessage: () => false,
        deferUpdate: async () => assert.fail('deferUpdate should not be used without a source message'),
        deferReply: async (payload) => {
            interaction.deferred = true;
            calls.push(['deferReply', payload]);
        },
        editReply: async (payload) => calls.push(['editReply', payload]),
        followUp: async (payload) => calls.push(['followUp', payload]),
    };

    const acknowledgement = await interactionDelivery.acknowledgePanelSubmit(interaction);
    await interactionDelivery.sendAcknowledgedNotice(interaction, acknowledgement, { content: 'validation error' });

    assert.equal(acknowledgement.mode, 'reply');
    assert.deepEqual(calls.map(([method]) => method), ['deferReply', 'editReply']);
    assert.equal(calls[1][1].content, 'validation error');
    assert.equal(calls[1][1].flags, undefined);
});

test('Admin responses use Components V2 while errors remain legacy embeds', () => {
    const actionRow = new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
            .setCustomId('test-admin-action')
            .setLabel('Edit')
            .setStyle(Discord.ButtonStyle.Primary),
    );
    const response = verificationResponses.buildVerificationAdminSummary(
        'Settings',
        'Current verification settings.',
        'Catalog authoritative.',
        'info',
        {
            fields: [{ name: 'Mode', value: 'challenge' }],
            components: [actionRow],
        },
    );
    const container = response.components[0].toJSON();

    assert.equal(response.flags, Discord.MessageFlags.IsComponentsV2);
    assert.deepEqual(response.embeds, []);
    assert.equal(response.content, null);
    assert.equal(container.type, Discord.ComponentType.Container);
    assert.ok(container.components.some((component) => component.type === Discord.ComponentType.TextDisplay));
    assert.ok(container.components.some((component) => component.type === Discord.ComponentType.ActionRow));

    const error = verificationResponses.buildVerificationErrorResponse('Invalid settings.');
    assert.equal(error.embeds.length, 1);
    assert.equal(error.components, undefined);
});

test('catalog-native preflight validates challenges absent from static templates', () => {
    const report = verificationValidation.evaluateVerificationConfig({
        mode: 'challenge',
        activeChallengeIds: ['catalog-only'],
        challenges: [{
            id: 'catalog-only',
            enabled: true,
            questions: [{
                id: 'answer',
                generatedImage: { enabled: false, type: 'none' },
                answer: { required: true, type: 'text', accepted: [], requiresConfiguredAnswers: true },
            }],
        }],
    });

    assert.equal(report.activeBlockingIssues.length, 1);
    assert.equal(report.activeBlockingIssues[0].challengeId, 'catalog-only');
    assert.equal(report.activeBlockingIssues[0].code, 'missing_accepted_answers');

    const missing = verificationValidation.evaluateVerificationConfig({
        mode: 'challenge',
        activeChallengeIds: ['missing-catalog-row'],
        challenges: [],
    });
    assert.equal(missing.activeBlockingIssues[0].code, 'missing_active_challenge');

    const empty = verificationValidation.evaluateVerificationConfig({
        mode: 'challenge',
        activeChallengeIds: ['empty'],
        challenges: [{ id: 'empty', enabled: true, questions: [] }],
    });
    assert.equal(empty.activeBlockingIssues[0].code, 'missing_questions');

    const unsupportedTask = verificationValidation.evaluateVerificationConfig({
        mode: 'challenge',
        activeChallengeIds: ['unsupported-task'],
        challenges: [{
            id: 'unsupported-task',
            enabled: true,
            questions: [{
                id: 'task',
                generatedImage: { enabled: true, type: 'not-registered' },
                answer: { required: false, type: 'none', accepted: [] },
            }],
        }],
    });
    assert.equal(unsupportedTask.activeBlockingIssues[0].code, 'unsupported_task_type');
    assert.deepEqual(unsupportedTask.unsafeActiveChallengeIds, ['unsupported-task']);

    const unsupportedAnswer = verificationValidation.evaluateVerificationConfig({
        mode: 'challenge',
        activeChallengeIds: ['unsupported-answer'],
        challenges: [{
            id: 'unsupported-answer',
            enabled: true,
            questions: [{
                id: 'answer',
                generatedImage: { enabled: false, type: 'none' },
                answer: { required: true, type: 'not-registered', accepted: [] },
            }],
        }],
    });
    assert.equal(unsupportedAnswer.activeBlockingIssues[0].code, 'unsupported_answer_type');
    assert.deepEqual(unsupportedAnswer.unsafeActiveChallengeIds, ['unsupported-answer']);
});

test('catalog preflight validates gallery pools and position-answer task capabilities', () => {
    const unknownPool = buildCatalogReport('unknown-pool', [{
        id: 'gallery',
        text: 'Choose the solution image.',
        generatedImage: {
            enabled: true,
            type: 'gallery-standard',
            imagePoolId: 'not-a-real-pool',
            imageIds: { solution: ['missing-solution'], control: ['missing-control'] },
            maxControlImageRepeats: 5,
        },
        answer: { required: true, type: 'positions' },
    }]);
    assert.ok(getIssueCodes(unknownPool).has('unknown_image_pool'));

    const unknownPoolImage = buildCatalogReport('unknown-pool-image', [{
        id: 'gallery',
        text: 'Choose the solution image.',
        generatedImage: {
            enabled: true,
            type: 'gallery-standard',
            imagePoolId: ' eliteVessels_c ',
            imageIds: { solution: ['not-in-pool'], control: ['ev1'] },
            maxControlImageRepeats: 5,
        },
        answer: { required: true, type: 'positions' },
    }]);
    assert.ok(getIssueCodes(unknownPoolImage).has('unknown_solution_image_ids'));

    for (const taskType of ['none', 'prompt-text', 'static-image']) {
        const incompatible = buildCatalogReport(`positions-${taskType}`, [{
            id: 'answer',
            generatedImage: { enabled: taskType !== 'none', type: taskType },
            answer: { required: true, type: 'positions' },
        }]);
        assert.ok(getIssueCodes(incompatible).has('positions_answer_requires_gallery'));
    }

    const validGallery = buildCatalogReport('valid-gallery', [{
        id: 'gallery',
        text: 'Choose the solution image.',
        generatedImage: {
            enabled: true,
            type: 'gallery-standard',
            imagePoolId: ' eliteVessels_c ',
            imageIds: { solution: ['ev8'], control: ['ev1'] },
            maxControlImageRepeats: 5,
        },
        answer: { required: true, type: 'positions' },
    }]);
    assert.equal(validGallery.activeBlockingIssues.length, 0);

    const duplicateControlIds = buildCatalogReport('duplicate-control-ids', [{
        id: 'gallery',
        generatedImage: {
            enabled: true,
            type: 'gallery-standard',
            imagePoolId: 'eliteVessels_c',
            imageIds: { solution: ['ev8'], control: ['ev1', 'ev1'] },
            maxControlImageRepeats: 3,
        },
        answer: { required: true, type: 'positions' },
    }]);
    assert.ok(getIssueCodes(duplicateControlIds).has('insufficient_control_image_capacity'));

    assert.equal(galleryShared.getPoolImagesByIds({ id: 'numeric', images: [{ id: '1' }] }, [1], 'solution', 'numeric-test')[0].id, '1');
});

test('rotation preflight uses runtime defaults and blocks insufficient generation capacity', () => {
    const buildRotationQuestion = (rotationAlignment = {}) => ({
        id: 'rotation',
        text: 'Choose the aligned images.',
        generatedImage: {
            enabled: true,
            type: 'gallery-rotation-alignment',
            imagePoolId: 'eliteRotationAlignmentAssets',
            imageIds: { center: ['station1'], outer: ['ship'] },
            imageDirections: { station1: [0], ship: [0] },
            gallerySize: 6,
            rotationAlignment,
        },
        answer: { required: true, type: 'positions' },
    });

    const insufficient = buildCatalogReport('rotation-capacity', [buildRotationQuestion({
        clockPositionDegrees: [0],
        maxImageOrientationRepeats: 2,
    })]);
    assert.ok(getIssueCodes(insufficient).has('insufficient_clock_position_capacity'));

    const defaults = buildCatalogReport('rotation-defaults', [buildRotationQuestion()]);
    assert.equal(defaults.activeBlockingIssues.length, 0);

    const invalidRepeatLimit = buildCatalogReport('rotation-repeat-limit', [buildRotationQuestion({
        clockPositionDegrees: [0],
        maxImageOrientationRepeats: 'invalid',
    })]);
    assert.ok(getIssueCodes(invalidRepeatLimit).has('invalid_rotation_generation_config'));
});

test('task configurations accepted by preflight construct gallery runtime state', () => {
    const standardQuestion = {
        id: 'standard',
        generatedImage: {
            enabled: true,
            type: 'gallery-standard',
            imagePoolId: ' eliteVessels_c ',
            gallerySize: 6,
            imageIds: { solution: ['ev8'], control: ['ev1'] },
            maxControlImageRepeats: 5,
        },
        answer: { required: true, type: 'positions' },
    };
    const rotationQuestion = {
        id: 'rotation',
        generatedImage: {
            enabled: true,
            type: 'gallery-rotation-alignment',
            imagePoolId: 'eliteRotationAlignmentAssets',
            gallerySize: 6,
            imageIds: { center: ['station1'], outer: ['ship'] },
            imageDirections: { station1: [0], ship: [0] },
        },
        answer: { required: true, type: 'positions' },
    };
    const context = {
        challengeId: 'runtime-parity',
        getVerificationImagePool: verificationImages.getVerificationImagePool,
    };

    assert.deepEqual(galleryStandard.validateConfig(standardQuestion, context), []);
    assert.equal(galleryStandard.createGalleryState(standardQuestion, context).selectedImages.length, 6);
    assert.deepEqual(rotationAlignment.validateConfig(rotationQuestion, context), []);
    assert.equal(rotationAlignment.createGalleryState(rotationQuestion, context).selectedImages.length, 6);
});

test('Components V2 validation and rendering enforce the current 40-component message budget', () => {
    const buildChallenge = (questionCount) => verificationChallenges.normalizeVerificationChallenge({
        id: `component-budget-${questionCount}`,
        enabled: true,
        title: 'Component budget',
        description: 'Boundary test.',
        questions: Array.from({ length: questionCount }, (_, index) => ({
            id: `question-${index}`,
            label: `Question ${index + 1}`,
            text: 'Read this question.',
            generatedImage: { enabled: false, type: 'none' },
            answer: { required: false, type: 'none' },
        })),
    }, {});

    const fourQuestionChallenge = buildChallenge(4);
    const fourQuestionScreens = verificationChallenges.buildQuestionScreens(fourQuestionChallenge);
    assert.deepEqual(verificationChallenges.validateQuestionScreens(fourQuestionScreens, fourQuestionChallenge), []);

    const boundaryChallenge = buildChallenge(17);
    const boundaryScreens = verificationChallenges.buildQuestionScreens(boundaryChallenge);
    assert.equal(verificationChallenges.countQuestionScreenComponents(boundaryChallenge, boundaryScreens, boundaryScreens[0]), 40);
    assert.deepEqual(verificationChallenges.validateQuestionScreens(boundaryScreens, boundaryChallenge), []);

    const session = {
        challengeId: boundaryChallenge.id,
        screenIndex: 0,
        screens: boundaryScreens,
        token: 'a'.repeat(32),
        expiresAt: Date.now() + 60_000,
    };
    const components = verificationResponses.buildQuestionScreenComponentsV2(
        boundaryChallenge,
        boundaryScreens[0],
        {},
        session,
        { includeIntro: true },
    );
    assert.equal(verificationResponses.countSerializedComponents(components.map((component) => component.toJSON())), 40);

    const oversizedChallenge = buildChallenge(18);
    const oversizedScreens = verificationChallenges.buildQuestionScreens(oversizedChallenge);
    assert.equal(verificationChallenges.validateQuestionScreens(oversizedScreens, oversizedChallenge)[0].code, 'components_v2_component_limit');
    assert.throws(() => verificationResponses.buildQuestionScreenComponentsV2(
        oversizedChallenge,
        oversizedScreens[0],
        {},
        { ...session, challengeId: oversizedChallenge.id, screens: oversizedScreens },
        { includeIntro: true },
    ), /42 Discord components/);

    const laterScreenChallenge = verificationChallenges.normalizeVerificationChallenge({
        id: 'later-screen-boundary',
        enabled: true,
        questions: [
            {
                id: 'intro-step',
                label: 'Intro step',
                text: 'Continue.',
                separateStep: true,
                generatedImage: { enabled: false, type: 'none' },
                answer: { required: false, type: 'none' },
            },
            ...Array.from({ length: 17 }, (_, index) => ({
                id: `grouped-${index}`,
                label: `Grouped ${index + 1}`,
                text: 'Read this question.',
                generatedImage: { enabled: false, type: 'none' },
                answer: { required: false, type: 'none' },
            })),
        ],
    }, {});
    const laterScreens = verificationChallenges.buildQuestionScreens(laterScreenChallenge);
    assert.equal(verificationChallenges.countQuestionScreenComponents(laterScreenChallenge, laterScreens, laterScreens[1]), 40);
    const laterComponents = verificationResponses.buildQuestionScreenComponentsV2(
        laterScreenChallenge,
        laterScreens[1],
        {},
        { ...session, challengeId: laterScreenChallenge.id, screenIndex: 1, screens: laterScreens },
    );
    assert.equal(verificationResponses.countSerializedComponents(laterComponents.map((component) => component.toJSON())), 40);
});

test('screen preflight and rendering enforce Discord attachment budgets', () => {
    const galleryQuestion = (id, compositeImageGallery = false) => ({
        id,
        label: id,
        generatedImage: {
            enabled: true,
            type: 'gallery-standard',
            gallerySize: 6,
            compositeImageGallery,
        },
        answer: { required: false, type: 'none' },
    });
    const challenge = verificationChallenges.normalizeVerificationChallenge({
        id: 'attachment-budget',
        enabled: true,
        questions: [galleryQuestion('gallery-1'), galleryQuestion('gallery-2')],
    }, {});
    const screens = verificationChallenges.buildQuestionScreens(challenge);
    assert.equal(verificationChallenges.countQuestionScreenAttachments(screens[0]), 12);
    assert.ok(verificationChallenges.validateQuestionScreens(screens, challenge)
        .some((issue) => issue.code === 'discord_attachment_limit'));

    const compositeChallenge = verificationChallenges.normalizeVerificationChallenge({
        id: 'attachment-budget-composite',
        enabled: true,
        questions: [galleryQuestion('gallery-1', true), galleryQuestion('gallery-2', true)],
    }, {});
    const compositeScreens = verificationChallenges.buildQuestionScreens(compositeChallenge);
    assert.equal(verificationChallenges.countQuestionScreenAttachments(compositeScreens[0]), 2);
    assert.ok(!verificationChallenges.validateQuestionScreens(compositeScreens, compositeChallenge)
        .some((issue) => issue.code === 'discord_attachment_limit'));
    assert.throws(() => verificationResponses.assertDiscordAttachmentBudget(Array(11).fill({})), /11 Discord attachments/);
});

test('runtime verification uses compact wire IDs and current Label components', () => {
    const longChallengeId = 'c'.repeat(128);
    const longQuestionId = 'q'.repeat(128);
    const challenge = verificationChallenges.normalizeVerificationChallenge({
        id: longChallengeId,
        enabled: true,
        questions: [{
            id: longQuestionId,
            label: 'Long identity question',
            text: 'Enter the answer.',
            generatedImage: { enabled: false, type: 'none' },
            answer: {
                required: true,
                type: 'text',
                accepted: ['axi'],
                inputLabel: 'L'.repeat(45),
                inputPlaceholder: 'P'.repeat(100),
            },
        }],
    }, {});
    const screens = verificationChallenges.buildQuestionScreens(challenge);
    const session = {
        challengeId: longChallengeId,
        challenge,
        screenIndex: 0,
        screens,
        token: 'a'.repeat(32),
    };

    const actionId = verificationResponses.buildScreenActionRows(session)[0].components[0].data.custom_id;
    assert.ok(actionId.length <= 100);
    assert.deepEqual(verificationResponses.parseAnswerCustomId(actionId), { screenIndex: 0, token: session.token });

    const modal = verificationResponses.buildAnswerModal(session).toJSON();
    assert.ok(modal.custom_id.length <= 100);
    assert.equal(modal.components[0].type, Discord.ComponentType.Label);
    assert.equal(modal.components[0].label.length, 45);
    assert.equal(modal.components[0].component.custom_id, 'q:0');
    assert.equal(modal.components[0].component.placeholder.length, 100);

    const submittedFields = new Discord.ModalSubmitFields([{
        type: Discord.ComponentType.Label,
        label: modal.components[0].label,
        component: {
            type: Discord.ComponentType.TextInput,
            customId: 'q:0',
            value: 'axi',
        },
    }]);
    assert.equal(submittedFields.getTextInputValue('q:0'), 'axi');

    const invalidStrings = buildCatalogReport('invalid-input-copy', [{
        id: 'answer',
        generatedImage: { enabled: false, type: 'none' },
        answer: {
            required: true,
            type: 'text',
            accepted: ['axi'],
            inputLabel: 'L'.repeat(46),
            inputPlaceholder: 'P'.repeat(101),
        },
    }]);
    const issueCodes = getIssueCodes(invalidStrings);
    assert.ok(issueCodes.has('answer_input_label_too_long'));
    assert.ok(issueCodes.has('answer_input_placeholder_too_long'));
});

test('safeguard reports a post-commit snapshot refresh failure without treating the write as failed', async () => {
    const handlerPath = require.resolve(path.join(verificationDirectory, 'verificationDbHandler'));
    const servicePath = require.resolve(path.join(verificationDirectory, 'verificationService'));
    const cachedHandler = require.cache[handlerPath];
    const cachedService = require.cache[servicePath];
    const originalConsoleError = console.error;
    const loggedErrors = [];
    let writes = 0;
    let invalidations = 0;

    require.cache[handlerPath] = {
        id: handlerPath,
        filename: handlerPath,
        loaded: true,
        exports: {
            VERIFICATION_MODES: { challenge: 'challenge', halt: 'halt', oneClick: 'one-click' },
            invalidateVerificationGuild: () => { invalidations += 1; },
            loadVerificationSnapshot: async () => { throw new Error('refresh unavailable'); },
            saveVerificationGuildSettingsOnly: async () => { writes += 1; },
        },
    };
    delete require.cache[servicePath];
    const service = require(servicePath);
    const safeQuestion = {
        id: 'answer',
        generatedImage: { enabled: false, type: 'none' },
        answer: { required: true, type: 'text', accepted: ['axi'] },
    };
    const snapshot = {
        guildSettings: { mode: 'challenge', activeChallengeIds: ['unsafe'] },
        settings: { mode: 'challenge', activeChallengeIds: ['unsafe'], challengeOverrides: {} },
        runtime: {
            mode: 'challenge',
            activeChallengeIds: ['unsafe'],
            challenges: [
                { id: 'unsafe', questions: [{ ...safeQuestion, answer: { ...safeQuestion.answer, accepted: [] } }] },
                { id: 'placeholder', questions: [safeQuestion] },
            ],
            activeChallenges: [],
        },
    };

    try {
        console.error = (...args) => loggedErrors.push(args);
        const result = await service.applyVerificationConfigSafeguard({ guildId: 'guild', snapshot });
        assert.equal(writes, 1);
        assert.equal(invalidations, 1);
        assert.match(result.refreshError.message, /refresh unavailable/);
        assert.deepEqual(result.finalSettings.activeChallengeIds, ['placeholder']);
        assert.match(String(loggedErrors[0]?.[0]), /committed.*snapshot could not be refreshed/);

        const committedSettings = { mode: 'challenge', activeChallengeIds: ['safe'], challengeOverrides: {} };
        const initialRefreshFailure = await service.applyVerificationConfigSafeguard({
            guildId: 'guild',
            committedSettings,
        });
        assert.equal(writes, 1);
        assert.equal(invalidations, 2);
        assert.strictEqual(initialRefreshFailure.finalSettings, committedSettings);
        assert.match(initialRefreshFailure.refreshError.message, /refresh unavailable/);
        assert.match(String(loggedErrors[1]?.[0]), /committed.*snapshot could not be loaded/);
    }
    finally {
        console.error = originalConsoleError;
        restoreModule(servicePath, cachedService);
        restoreModule(handlerPath, cachedHandler);
    }
});

test('verification feature owns Admin component dispatch and contains unexpected errors', async () => {
    const flowPath = require.resolve(path.join(verificationDirectory, 'verificationFlow'));
    const featurePath = require.resolve(path.join(verificationDirectory, 'verificationFeature'));
    const cachedFlow = require.cache[flowPath];
    const cachedFeature = require.cache[featurePath];
    let runtimeHandled = false;
    let adminCalls = 0;

    require.cache[flowPath] = {
        id: flowPath,
        filename: flowPath,
        loaded: true,
        exports: {
            handleVerificationInteraction: async () => runtimeHandled,
        },
    };
    delete require.cache[featurePath];
    const feature = require(featurePath);

    try {
        const command = {
            handleButtonInteraction: async () => {
                adminCalls += 1;
                return true;
            },
        };
        const interaction = {
            customId: 'wVA:settings:test',
            client: { commands: new Map([['verification', command]]) },
            isModalSubmit: () => false,
            isButton: () => true,
            isStringSelectMenu: () => false,
        };

        assert.equal(await feature.handleInteraction(interaction, {}), true);
        assert.equal(adminCalls, 1);

        runtimeHandled = true;
        assert.equal(await feature.handleInteraction(interaction, {}), true);
        assert.equal(adminCalls, 1);
    }
    finally {
        restoreModule(featurePath, cachedFeature);
        restoreModule(flowPath, cachedFlow);
    }
});

test('catalog template seeding is deduplicated per guild and process version', async () => {
    const databasePath = require.resolve(path.join(repositoryRoot, 'Warden', 'db', 'database'));
    const repositoryPath = require.resolve(path.join(verificationDirectory, 'verificationChallengeRepository'));
    const cachedDatabase = require.cache[databasePath];
    const cachedRepository = require.cache[repositoryPath];
    const queries = [];

    require.cache[databasePath] = {
        id: databasePath,
        filename: databasePath,
        loaded: true,
        exports: {
            query: async (sql) => {
                queries.push(String(sql));
                return [];
            },
        },
    };
    delete require.cache[repositoryPath];
    const repository = require(repositoryPath);

    try {
        await repository.ensureVerificationChallengeTemplatesSeeded('seed-guild');
        const insertsAfterFirstSeed = queries.filter((sql) => sql.includes('INSERT IGNORE')).length;
        await repository.ensureVerificationChallengeTemplatesSeeded('seed-guild');
        const insertsAfterSecondSeed = queries.filter((sql) => sql.includes('INSERT IGNORE')).length;

        assert.ok(insertsAfterFirstSeed > 0);
        assert.equal(insertsAfterSecondSeed, insertsAfterFirstSeed);
    }
    finally {
        restoreModule(repositoryPath, cachedRepository);
        restoreModule(databasePath, cachedDatabase);
    }
});

test('verification DB handler deduplicates snapshots and invalidates success and failure writes', async () => {
    const settingsPath = require.resolve(path.join(verificationDirectory, 'verificationSettings'));
    const catalogPath = require.resolve(path.join(verificationDirectory, 'verificationChallengeRepository'));
    const handlerPath = require.resolve(path.join(verificationDirectory, 'verificationDbHandler'));
    const cachedSettings = require.cache[settingsPath];
    const cachedCatalog = require.cache[catalogPath];
    const cachedHandler = require.cache[handlerPath];
    let settingsReads = 0;
    let catalogReads = 0;
    let failWrite = false;
    let blockNextSettingsRead = false;
    let releaseBlockedSettingsRead;
    let notifyBlockedSettingsRead;
    let mutatedQuestion;

    const settingsStub = {
        VERIFICATION_MODES: { challenge: 'challenge', halt: 'halt', oneClick: 'one-click' },
        clearVerificationSettingsCache: () => undefined,
        ensureVerificationSettingsTable: async () => undefined,
        getVerificationGuildSettings: async () => {
            settingsReads += 1;
            if (blockNextSettingsRead) {
                blockNextSettingsRead = false;
                notifyBlockedSettingsRead?.();
                await new Promise((resolve) => { releaseBlockedSettingsRead = resolve; });
            }
            await Promise.resolve();
            return { mode: 'challenge', activeChallengeIds: ['alpha'], challengeOverrides: {} };
        },
        getVerificationSettings: async () => assert.fail('snapshot reads must not reconstruct runtime settings through legacy-shaped catalog overrides'),
    };
    for (const methodName of [
        'updateChallengeMetaOverrides',
        'setQuestionCommonOverrides',
        'setQuestionImageTextOverride',
        'setQuestionAnswerOverrides',
        'setQuestionImageIdOverrides',
        'setQuestionImageDirectionOverrides',
        'updateQuestionOptionOverrides',
        'clearQuestionOverrideFields',
    ]) {
        settingsStub[methodName] = async () => assert.fail(`catalog-native writes must not call verificationSettings.${methodName}`);
    }
    const catalogStub = {
        clearVerificationChallengeCatalogCache: () => undefined,
        ensureVerificationChallengeTemplatesSeeded: async () => undefined,
        getVerificationChallengeCatalog: async () => {
            catalogReads += 1;
            return { alpha: { id: 'alpha', questions: [{ id: 'question-1' }] } };
        },
        catalogChallengesToSettingsOverrides: () => ({ alpha: { questions: {} } }),
        getVerificationChallengeTemplate: () => ({
            id: 'alpha',
            questions: [{
                id: 'question-1',
                order: 1,
                label: 'Template label',
                generatedImage: { imageIds: { solution: ['template-solution'] } },
            }],
        }),
        mutateVerificationChallengeCatalogEntry: async ({ challengeId, mutate }) => {
            if (failWrite) throw new Error('write failed');
            return mutate({ id: challengeId, enabled: true, questions: [] });
        },
        mutateVerificationQuestionCatalogEntries: async ({ questionIds, mutate }) => {
            const questions = new Map(questionIds.map((questionId, index) => [questionId, {
                id: questionId,
                order: index + 1,
                generatedImage: {
                    enabled: true,
                    type: 'gallery-standard',
                    imageIds: { solution: ['solution-1'], control: ['control-1'] },
                },
                answer: { required: true, type: 'positions' },
            }]));
            const updated = mutate(questions);
            mutatedQuestion = updated.get(questionIds[0]);
            return updated;
        },
    };

    require.cache[settingsPath] = { id: settingsPath, filename: settingsPath, loaded: true, exports: settingsStub };
    require.cache[catalogPath] = { id: catalogPath, filename: catalogPath, loaded: true, exports: catalogStub };
    delete require.cache[handlerPath];
    const db = require(handlerPath);

    try {
        const [first, concurrent] = await Promise.all([
            db.loadVerificationSnapshot('guild-1'),
            db.loadVerificationSnapshot('guild-1'),
        ]);
        const cached = await db.loadVerificationSnapshot('guild-1');

        assert.strictEqual(first, concurrent);
        assert.strictEqual(first, cached);
        assert.equal(settingsReads, 1);
        assert.equal(catalogReads, 1);
        assert.equal(first.challengesById.get('alpha').id, 'alpha');
        assert.equal(first.questionsByChallengeId.get('alpha').get('question-1').id, 'question-1');
        assert.equal(first.runtime.activeChallenges[0].id, 'alpha');
        assert.deepEqual(first.settings.challengeOverrides, { alpha: { questions: {} } });

        await db.updateChallengeMetaOverrides('guild-1', 'alpha', {}, 'tester');
        await db.loadVerificationSnapshot('guild-1');
        assert.equal(settingsReads, 2);
        assert.equal(catalogReads, 2);

        await db.updateQuestionOptionOverrides('guild-1', 'alpha', {
            'question-1': {
                order: 2,
                generatedImage: { enabled: true, type: 'prompt-text', imageIds: null },
                answer: { type: 'text' },
            },
        }, 'tester');
        assert.equal(mutatedQuestion.order, 2);
        assert.equal(mutatedQuestion.generatedImage.type, 'prompt-text');
        assert.equal(mutatedQuestion.generatedImage.imageIds, undefined);
        assert.equal(mutatedQuestion.answer.type, 'text');

        await db.clearQuestionOverrideFields(
            'guild-1',
            'alpha',
            'question-1',
            ['label', 'generatedImage.imageIds'],
            'tester',
        );
        assert.equal(mutatedQuestion.label, 'Template label');
        assert.deepEqual(mutatedQuestion.generatedImage.imageIds, { solution: ['template-solution'] });

        failWrite = true;
        await assert.rejects(
            db.updateChallengeMetaOverrides('guild-1', 'alpha', {}, 'tester'),
            /write failed/,
        );
        await db.loadVerificationSnapshot('guild-1');
        assert.equal(settingsReads, 5);
        assert.equal(catalogReads, 5);

        for (let index = 0; index <= 100; index += 1) {
            await db.loadVerificationSnapshot(`bounded-guild-${index}`);
        }
        const readsBeforeEvictedReload = settingsReads;
        await db.loadVerificationSnapshot('bounded-guild-0');
        assert.equal(settingsReads, readsBeforeEvictedReload + 1);

        blockNextSettingsRead = true;
        const blockedSettingsRead = new Promise((resolve) => { notifyBlockedSettingsRead = resolve; });
        const staleLoad = db.loadVerificationSnapshot('race-guild');
        await blockedSettingsRead;
        const freshLoad = await db.loadVerificationSnapshot('race-guild', { fresh: true });
        releaseBlockedSettingsRead();
        const staleSnapshot = await staleLoad;
        assert.notStrictEqual(staleSnapshot, freshLoad);
        assert.strictEqual(await db.loadVerificationSnapshot('race-guild'), freshLoad);
    }
    finally {
        restoreModule(handlerPath, cachedHandler);
        restoreModule(catalogPath, cachedCatalog);
        restoreModule(settingsPath, cachedSettings);
    }
});

test('catalog question mutations lock targeted rows and roll back atomically', async () => {
    const databasePath = require.resolve(path.join(repositoryRoot, 'Warden', 'db', 'database'));
    const repositoryPath = require.resolve(path.join(verificationDirectory, 'verificationChallengeRepository'));
    const cachedDatabase = require.cache[databasePath];
    const cachedRepository = require.cache[repositoryPath];
    const queries = [];
    const topLevelQueries = [];
    const updates = [];
    let acquiredConnections = 0;
    let releasedConnections = 0;
    const questionRows = ['first', 'second', 'unrelated'].map((questionId, index) => ({
        guild_id: 'guild-write',
        challenge_id: 'alpha',
        question_id: questionId,
        question_order: index + 1,
        question_label: questionId,
        question_text: `${questionId} text`,
        separate_step: 0,
        task_enabled: 0,
        task_type: 'none',
        task_prompt_text: null,
        task_image_pool_id: null,
        task_image_ids_json: null,
        task_image_directions_json: null,
        task_config_json: null,
        answer_required: 0,
        answer_type: 'none',
        answer_input_label: null,
        answer_input_placeholder: null,
        answers_json: null,
        updated_by: 'seed',
        updated_at: '2026-01-01T00:00:00.000Z',
    }));
    Object.assign(questionRows[0], {
        task_enabled: 1,
        task_type: 'gallery-standard',
        task_image_pool_id: 'pool-a',
        task_image_ids_json: JSON.stringify({ solution: ['s1'], control: ['c1'] }),
        task_config_json: JSON.stringify({ gallerySize: 9, config: { maxRetries: 2 } }),
        answer_required: 1,
        answer_type: 'positions',
    });

    const executeQuery = (sql, values = []) => {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
        queries.push(normalizedSql);
        if (normalizedSql.startsWith('SELECT * FROM verification_question_catalog')) {
            const requestedIds = new Set(values.slice(2).map(String));
            return questionRows.filter((row) => requestedIds.has(row.question_id));
        }
        if (normalizedSql.startsWith('SELECT * FROM verification_challenge_catalog')) {
            return [{
                guild_id: 'guild-write',
                challenge_id: 'alpha',
                title: 'Alpha',
                description: 'Challenge',
                color: '#ffffff',
                fields_json: null,
                enabled: 1,
            }];
        }
        if (normalizedSql.startsWith('UPDATE verification_question_catalog')) updates.push(values);
        return [];
    };

    require.cache[databasePath] = {
        id: databasePath,
        filename: databasePath,
        loaded: true,
        exports: {
            query: async (sql, values = []) => {
                const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
                topLevelQueries.push(normalizedSql);
                return executeQuery(sql, values);
            },
            pool: {
                getConnection: (callback) => {
                    acquiredConnections += 1;
                    callback(null, {
                        query: (sql, values, queryCallback) => {
                            try {
                                queryCallback(null, executeQuery(sql, values));
                            }
                            catch (err) {
                                queryCallback(err);
                            }
                        },
                        release: () => { releasedConnections += 1; },
                    });
                },
            },
        },
    };
    delete require.cache[repositoryPath];
    const repository = require(repositoryPath);

    try {
        await repository.mutateVerificationQuestionCatalogEntries({
            guildId: 'guild-write',
            challengeId: 'alpha',
            questionIds: ['first', 'second'],
            updatedBy: 'admin-user',
            mutate: (questions) => {
                questions.set('first', { ...questions.get('first'), order: 2 });
                questions.set('second', { ...questions.get('second'), order: 1 });
                return questions;
            },
        });

        assert.equal(updates.length, 2);
        assert.deepEqual(updates.map((values) => values[19]), ['first', 'second']);
        assert.deepEqual(updates.map((values) => values[0]), [2, 1]);
        assert.ok(updates.every((values) => values[16] === 'admin-user'));
        assert.equal(updates[0][5], 'gallery-standard');
        assert.equal(updates[0][7], 'pool-a');
        assert.deepEqual(JSON.parse(updates[0][8]), { solution: ['s1'], control: ['c1'] });
        assert.deepEqual(JSON.parse(updates[0][10]), { gallerySize: 9, config: { maxRetries: 2 } });
        assert.equal(updates[0][12], 'positions');
        assert.ok(queries.some((sql) => sql === 'START TRANSACTION'));
        assert.ok(queries.some((sql) => sql === 'COMMIT'));
        assert.ok(!topLevelQueries.includes('START TRANSACTION'));
        assert.ok(!updates.some((values) => values[19] === 'unrelated'));
        assert.ok(!queries.some((sql) => sql.includes('verification_challenge_config')));

        const rollbackCount = queries.filter((sql) => sql === 'ROLLBACK').length;
        await assert.rejects(
            repository.mutateVerificationChallengeCatalogEntry({
                guildId: 'guild-write',
                challengeId: 'alpha',
                updatedBy: 'admin-user',
                mutate: () => { throw new Error('invalid mutation'); },
            }),
            /invalid mutation/,
        );
        assert.equal(queries.filter((sql) => sql === 'ROLLBACK').length, rollbackCount + 1);
        assert.equal(acquiredConnections, 2);
        assert.equal(releasedConnections, 2);
    }
    finally {
        restoreModule(repositoryPath, cachedRepository);
        restoreModule(databasePath, cachedDatabase);
    }
});

test('verification persistence and global interaction routing keep their public boundaries', () => {
    const allowedPersistenceFiles = new Set([
        'verificationChallengeRepository.js',
        'verificationDbHandler.js',
        'verificationSettings.js',
    ]);
    const directPersistenceImports = fs.readdirSync(verificationDirectory)
        .filter((fileName) => fileName.endsWith('.js') && !allowedPersistenceFiles.has(fileName))
        .filter((fileName) => {
            const source = fs.readFileSync(path.join(verificationDirectory, fileName), 'utf8');
            return /require\(['"]\.\/verification(?:Settings|ChallengeRepository)['"]\)/.test(source);
        });

    assert.deepEqual(directPersistenceImports, []);

    const interactionCreateSource = fs.readFileSync(path.join(repositoryRoot, 'discordEvents', 'interactionCreate.js'), 'utf8');
    assert.match(interactionCreateSource, /verificationFeature/);
    assert.doesNotMatch(interactionCreateSource, /verificationFlow/);
    assert.doesNotMatch(interactionCreateSource, /handleVerificationAdmin|handleModalSubmit/);

    const flowSource = fs.readFileSync(path.join(verificationDirectory, 'verificationFlow.js'), 'utf8');
    assert.doesNotMatch(flowSource, /getEnabledVerificationChallenges|getActiveVerificationChallenge|getVerificationSettings/);

    const adminSource = fs.readFileSync(path.join(repositoryRoot, 'commands', 'Warden', 'admin', 'verification.js'), 'utf8');
    assert.doesNotMatch(adminSource, /build(?:SettingsStatus|ChallengePicker|ChallengeOverview|QuestionDetail)Embed/);

    const dbHandlerSource = fs.readFileSync(path.join(verificationDirectory, 'verificationDbHandler.js'), 'utf8');
    assert.doesNotMatch(dbHandlerSource, /verificationSettings\.(?:updateChallengeMetaOverrides|setQuestion|updateQuestionOptionOverrides|clearQuestionOverrideFields)/);

    const imageSource = fs.readFileSync(path.join(verificationDirectory, 'verificationImages.js'), 'utf8');
    assert.doesNotMatch(imageSource, /localGalleryImageBufferCache/);
});

test('catalog mappings expose immutable ownership metadata and CRUD stays behind the DB boundary', () => {
    const repositoryPath = path.join(verificationDirectory, 'verificationChallengeRepository.js');
    const repository = require(repositoryPath);
    const challenge = repository.catalogRowsToChallenge({
        challenge_id: 'custom-one', source_type: 'admin', source_template_id: null,
        template_version: 1, protected_template: 0, enabled: 0, title: 'Custom',
        created_by: 'creator', updated_by: 'editor',
        created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    }, [{
        question_id: 'first-question', question_order: 1, source_type: 'admin',
        source_template_id: null, template_version: 1, protected_template: 0,
        question_label: 'First', question_text: 'Text', created_by: 'creator', updated_by: 'editor',
        created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    }]);
    assert.equal(challenge.sourceType, 'admin');
    assert.equal(challenge.protectedTemplate, false);
    assert.equal(challenge.createdBy, 'creator');
    assert.equal(challenge.questions[0].sourceType, 'admin');
    assert.equal(challenge.questions[0].protectedTemplate, false);

    const adminSource = fs.readFileSync(path.join(repositoryRoot, 'commands', 'Warden', 'admin', 'verification.js'), 'utf8');
    assert.match(adminSource, /createCustomChallenge/);
    assert.match(adminSource, /deleteOrResetQuestion/);
    assert.doesNotMatch(adminSource, /verificationChallengeRepository/);
    const dbSource = fs.readFileSync(path.join(verificationDirectory, 'verificationDbHandler.js'), 'utf8');
    assert.match(dbSource, /createVerificationChallengeCatalogEntry/);
    assert.match(dbSource, /deleteOrResetVerificationChallengeCatalogEntry/);
});

function loadCatalogRepositoryWithDatabase(executeQuery) {
    const databasePath = require.resolve(path.join(repositoryRoot, 'Warden', 'db', 'database'));
    const repositoryPath = require.resolve(path.join(verificationDirectory, 'verificationChallengeRepository'));
    const cachedDatabase = require.cache[databasePath];
    const cachedRepository = require.cache[repositoryPath];
    const lifecycle = { acquired: 0, released: 0, queries: [] };

    const query = async (sql, values = []) => {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
        lifecycle.queries.push([normalizedSql, values]);
        return executeQuery(normalizedSql, values);
    };
    require.cache[databasePath] = {
        id: databasePath,
        filename: databasePath,
        loaded: true,
        exports: {
            query,
            pool: {
                getConnection: (callback) => {
                    lifecycle.acquired += 1;
                    callback(null, {
                        query: (sql, values, done) => query(sql, values).then(
                            (rows) => done(null, rows),
                            (error) => done(error),
                        ),
                        release: () => { lifecycle.released += 1; },
                    });
                },
            },
        },
    };
    delete require.cache[repositoryPath];
    return {
        repository: require(repositoryPath),
        lifecycle,
        restore() {
            restoreModule(repositoryPath, cachedRepository);
            restoreModule(databasePath, cachedDatabase);
        },
    };
}

test('custom catalog creation rejects tombstoned IDs and appends questions after contiguous resequencing', async () => {
    const challengeInserts = [];
    const questionInserts = [];
    const orderUpdates = [];
    let challengeCollision = false;
    let questionCollision = false;
    const harness = loadCatalogRepositoryWithDatabase(async (sql, values) => {
        if (sql.startsWith('CREATE TABLE')) return [];
        if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [];
        if (sql.startsWith('SELECT challenge_id FROM verification_challenge_catalog') && sql.includes('challenge_id = ? FOR UPDATE')) {
            if (values[1] === 'new-challenge') return challengeCollision ? [{ challenge_id: 'new-challenge' }] : [];
            return [{ challenge_id: values[1] }];
        }
        if (sql.startsWith('SELECT challenge_id FROM verification_challenge_catalog')) {
            return [{ challenge_id: values[1] }];
        }
        if (sql.startsWith('INSERT INTO verification_challenge_catalog')) {
            challengeInserts.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('SELECT question_id, question_order FROM verification_question_catalog')) {
            return [
                { question_id: 'later', question_order: 7 },
                { question_id: 'first', question_order: 1 },
            ];
        }
        if (sql.startsWith('SELECT question_id FROM verification_question_catalog')) {
            return questionCollision ? [{ question_id: 'new-question' }] : [];
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET question_order = ?, updated_by = ?')) {
            orderUpdates.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('INSERT INTO verification_question_catalog')) {
            questionInserts.push(values);
            return { affectedRows: 1 };
        }
        return [];
    });

    try {
        const challenge = await harness.repository.createVerificationChallengeCatalogEntry({
            guildId: 'guild-crud', challengeId: 'new-challenge', title: 'New', createdBy: 'admin-1',
        });
        assert.deepEqual(challenge, {
            id: 'new-challenge', sourceType: 'admin', protectedTemplate: false,
            enabled: false, title: 'New', description: undefined, color: undefined, questions: [],
        });
        assert.equal(challengeInserts.length, 1);
        assert.equal(challengeInserts[0][0], 'guild-crud');
        assert.equal(challengeInserts[0][1], 'new-challenge');

        challengeCollision = true;
        await assert.rejects(
            harness.repository.createVerificationChallengeCatalogEntry({
                guildId: 'guild-crud', challengeId: 'new-challenge', title: 'Replacement', createdBy: 'admin-1',
            }),
            /ID already exists/,
        );

        const question = await harness.repository.createVerificationQuestionCatalogEntry({
            guildId: 'guild-crud', challengeId: 'parent', createdBy: 'admin-1',
            question: { id: 'new-question', label: 'New question', text: 'Answer me', answer: { type: 'none' } },
        });
        assert.equal(question.order, 3);
        assert.equal(question.sourceType, 'admin');
        assert.deepEqual(orderUpdates.map((values) => [values[4], values[0]]), [['later', 2]]);
        assert.equal(questionInserts[0][2], 'new-question');
        assert.equal(questionInserts[0][3], 3);

        questionCollision = true;
        await assert.rejects(
            harness.repository.createVerificationQuestionCatalogEntry({
                guildId: 'guild-crud', challengeId: 'parent', createdBy: 'admin-1',
                question: { id: 'new-question', label: 'Duplicate', text: 'Duplicate' },
            }),
            /ID already exists/,
        );
        assert.equal(harness.lifecycle.queries.filter(([sql]) => sql === 'ROLLBACK').length, 2);
        assert.equal(harness.lifecycle.acquired, 4);
        assert.equal(harness.lifecycle.released, 4);
    }
    finally {
        harness.restore();
    }
});

test('custom challenge deletion cascades softly and active deletion rolls back and releases its lock', async () => {
    let activeIds = [];
    const updates = [];
    const harness = loadCatalogRepositoryWithDatabase(async (sql, values) => {
        if (sql.startsWith('CREATE TABLE')) return [];
        if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [];
        if (sql.startsWith('SELECT * FROM verification_challenge_catalog')) {
            return [{ guild_id: 'guild-delete', challenge_id: 'custom', source_type: 'admin', protected_template: 0 }];
        }
        if (sql.startsWith('SELECT question_id, question_order FROM verification_question_catalog')) {
            return [
                { question_id: 'one', question_order: 1, source_type: 'admin', protected_template: 0, deleted_at: null },
                { question_id: 'two', question_order: 2, source_type: 'admin', protected_template: 0, deleted_at: null },
            ];
        }
        if (sql.startsWith('SELECT active_challenge_ids_json')) {
            return [{ active_challenge_ids_json: JSON.stringify(activeIds) }];
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET deleted_at')
            || sql.startsWith('UPDATE verification_challenge_catalog SET deleted_at')) {
            updates.push([sql, values]);
            return { affectedRows: 1 };
        }
        return [];
    });

    try {
        const deleted = await harness.repository.deleteOrResetVerificationChallengeCatalogEntry({
            guildId: 'guild-delete', challengeId: 'custom', updatedBy: 'admin-2',
        });
        assert.deepEqual(deleted, { action: 'deleted', challengeId: 'custom' });
        assert.equal(updates.length, 2);
        assert.ok(updates[0][0].includes('verification_question_catalog'));
        assert.ok(updates[1][0].includes('verification_challenge_catalog'));
        assert.ok(updates.every(([, values]) => values[0] === 'admin-2'));

        activeIds = ['custom'];
        const updateCount = updates.length;
        await assert.rejects(
            harness.repository.deleteOrResetVerificationChallengeCatalogEntry({
                guildId: 'guild-delete', challengeId: 'custom', updatedBy: 'admin-2',
            }),
            (error) => error.code === 'VERIFICATION_CHALLENGE_ACTIVE',
        );
        assert.equal(updates.length, updateCount);
        assert.equal(harness.lifecycle.queries.filter(([sql]) => sql === 'ROLLBACK').length, 1);
        assert.equal(harness.lifecycle.acquired, 2);
        assert.equal(harness.lifecycle.released, 2);
    }
    finally {
        harness.restore();
    }
});

test('protected challenge reset remains allowed while active and preserves custom questions in deterministic order', async () => {
    const questionContentUpdates = [];
    const orderUpdates = [];
    let settingsRead = false;
    const harness = loadCatalogRepositoryWithDatabase(async (sql, values) => {
        if (sql.startsWith('CREATE TABLE')) return [];
        if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [];
        if (sql.startsWith('SELECT * FROM verification_challenge_catalog')) {
            return [{ guild_id: 'guild-reset', challenge_id: 'placeholder', source_type: 'template', protected_template: 1 }];
        }
        if (sql.startsWith('SELECT question_id, question_order, source_type, protected_template, deleted_at FROM verification_question_catalog')) {
            return [
                { question_id: 'custom-child', question_order: 1, source_type: 'admin', protected_template: 0, deleted_at: null },
                { question_id: 'axi-text', question_order: 8, source_type: 'template', protected_template: 1, deleted_at: null },
            ];
        }
        if (sql.startsWith('SELECT active_challenge_ids_json')) {
            settingsRead = true;
            return [{ active_challenge_ids_json: '["placeholder"]' }];
        }
        if (sql.startsWith('UPDATE verification_challenge_catalog SET')) return { affectedRows: 1 };
        if (sql.startsWith('UPDATE verification_question_catalog SET question_order = ?, updated_by = ?')) {
            orderUpdates.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET')) {
            questionContentUpdates.push(values);
            return { affectedRows: 1 };
        }
        return [];
    });

    try {
        const result = await harness.repository.deleteOrResetVerificationChallengeCatalogEntry({
            guildId: 'guild-reset', challengeId: 'placeholder', updatedBy: 'admin-3',
        });
        assert.deepEqual(result, { action: 'reset', challengeId: 'placeholder' });
        assert.equal(settingsRead, false, 'protected reset must not apply the active-custom deletion guard');
        assert.equal(questionContentUpdates.length, 1);
        assert.equal(questionContentUpdates[0][21], 'axi-text');
        assert.deepEqual(orderUpdates.map((values) => [values[4], values[0]]), [
            ['custom-child', 2],
        ]);
        assert.ok(!harness.lifecycle.queries.some(([sql, values]) =>
            sql.includes('SET deleted_at') && values.includes('custom-child')));
    }
    finally {
        harness.restore();
    }
});

test('custom question deletion and protected reset both restore contiguous template-first ordering', async () => {
    const rows = [
        { question_id: 'custom-first', question_order: 1, source_type: 'admin', protected_template: 0 },
        { question_id: 'axi-text', question_order: 4, source_type: 'template', protected_template: 1 },
        { question_id: 'custom-last', question_order: 9, source_type: 'admin', protected_template: 0 },
    ];
    const orderUpdates = [];
    const softDeletes = [];
    const harness = loadCatalogRepositoryWithDatabase(async (sql, values) => {
        if (sql.startsWith('CREATE TABLE')) return [];
        if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [];
        if (sql.startsWith('SELECT challenge_id FROM verification_challenge_catalog')) return [{ challenge_id: 'placeholder' }];
        if (sql.startsWith('SELECT * FROM verification_question_catalog')) {
            return rows.map((row) => ({ ...row }));
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET deleted_at')) {
            softDeletes.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET question_order = ?, updated_by = ?')) {
            orderUpdates.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET')) return { affectedRows: 1 };
        return [];
    });

    try {
        const deleted = await harness.repository.deleteOrResetVerificationQuestionCatalogEntry({
            guildId: 'guild-questions', challengeId: 'placeholder', questionId: 'custom-first', updatedBy: 'admin-4',
        });
        assert.equal(deleted.action, 'deleted');
        assert.equal(softDeletes.length, 1);
        assert.deepEqual(orderUpdates.map((values) => [values[4], values[0]]), [
            ['axi-text', 1],
            ['custom-last', 2],
        ]);

        orderUpdates.length = 0;
        const reset = await harness.repository.deleteOrResetVerificationQuestionCatalogEntry({
            guildId: 'guild-questions', challengeId: 'placeholder', questionId: 'axi-text', updatedBy: 'admin-4',
        });
        assert.equal(reset.action, 'reset');
        assert.deepEqual(orderUpdates.map((values) => [values[4], values[0]]), [
            ['axi-text', 1],
            ['custom-first', 2],
            ['custom-last', 3],
        ]);
    }
    finally {
        harness.restore();
    }
});

test('catalog CRUD returns the pre-write committed settings without compatibility projection or eager refresh', async () => {
    const settingsPath = require.resolve(path.join(verificationDirectory, 'verificationSettings'));
    const catalogPath = require.resolve(path.join(verificationDirectory, 'verificationChallengeRepository'));
    const handlerPath = require.resolve(path.join(verificationDirectory, 'verificationDbHandler'));
    const cachedSettings = require.cache[settingsPath];
    const cachedCatalog = require.cache[catalogPath];
    const cachedHandler = require.cache[handlerPath];
    let settingsReads = 0;
    let catalogReads = 0;
    let compatibilityProjections = 0;
    let writes = 0;
    const committedSettings = { mode: 'challenge', activeChallengeIds: [], challengeOverrides: {} };

    require.cache[settingsPath] = {
        id: settingsPath, filename: settingsPath, loaded: true,
        exports: {
            VERIFICATION_MODES: { challenge: 'challenge', halt: 'halt', oneClick: 'one-click' },
            clearVerificationSettingsCache: () => undefined,
            getVerificationGuildSettings: async () => { settingsReads += 1; return committedSettings; },
        },
    };
    require.cache[catalogPath] = {
        id: catalogPath, filename: catalogPath, loaded: true,
        exports: {
            clearVerificationChallengeCatalogCache: () => undefined,
            getVerificationChallengeCatalog: async () => { catalogReads += 1; return {}; },
            catalogChallengesToSettingsOverrides: () => { compatibilityProjections += 1; return {}; },
            createVerificationChallengeCatalogEntry: async ({ challengeId }) => {
                writes += 1;
                return { id: challengeId, sourceType: 'admin', protectedTemplate: false };
            },
        },
    };
    delete require.cache[handlerPath];
    const db = require(handlerPath);
    try {
        const result = await db.createCustomChallenge('guild-handler', { id: 'custom', title: 'Custom' }, 'admin-5');
        assert.equal(writes, 1);
        assert.equal(settingsReads, 1);
        assert.equal(catalogReads, 1);
        assert.equal(compatibilityProjections, 0);
        assert.strictEqual(result.committedSettings.mode, committedSettings.mode);
        assert.equal(result.result.id, 'custom');

        await db.loadVerificationSnapshot('guild-handler');
        assert.equal(settingsReads, 2, 'successful CRUD invalidates rather than eagerly refreshing its snapshot');
        assert.equal(catalogReads, 2);
    }
    finally {
        restoreModule(handlerPath, cachedHandler);
        restoreModule(catalogPath, cachedCatalog);
        restoreModule(settingsPath, cachedSettings);
    }
});

test('challenge creation serializes the guild catalog and rejects a twenty-sixth active row atomically', async () => {
    const inserts = [];
    const harness = loadCatalogRepositoryWithDatabase(async (sql, values) => {
        if (sql.startsWith('CREATE TABLE')) return [];
        if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [];
        if (sql.startsWith('SELECT guild_id FROM verification_guild_settings')) return [{ guild_id: values[0] }];
        if (sql === 'SELECT challenge_id FROM verification_challenge_catalog WHERE guild_id = ? FOR UPDATE') {
            return Array.from({ length: 25 }, (_, index) => ({ challenge_id: `challenge-${index}` }));
        }
        if (sql === 'SELECT challenge_id FROM verification_challenge_catalog WHERE guild_id = ? AND deleted_at IS NULL FOR UPDATE') {
            return Array.from({ length: 25 }, (_, index) => ({ challenge_id: `challenge-${index}` }));
        }
        if (sql.startsWith('INSERT INTO verification_challenge_catalog')) {
            inserts.push(values);
            return { affectedRows: 1 };
        }
        return [];
    });

    try {
        await assert.rejects(
            harness.repository.createVerificationChallengeCatalogEntry({
                guildId: 'guild-limit', challengeId: 'one-too-many', title: 'Too many', createdBy: 'admin-limit',
            }),
            (error) => error.code === 'VERIFICATION_CHALLENGE_LIMIT' && /at most 25/.test(error.message),
        );
        const statements = harness.lifecycle.queries.map(([sql]) => sql);
        assert.ok(statements.includes('SELECT guild_id FROM verification_guild_settings WHERE guild_id = ? FOR UPDATE'));
        assert.ok(statements.includes('SELECT challenge_id FROM verification_challenge_catalog WHERE guild_id = ? FOR UPDATE'));
        assert.ok(statements.includes('SELECT challenge_id FROM verification_challenge_catalog WHERE guild_id = ? AND deleted_at IS NULL FOR UPDATE'));
        assert.equal(inserts.length, 0);
        assert.equal(statements.filter((sql) => sql === 'ROLLBACK').length, 1);
        assert.equal(statements.filter((sql) => sql === 'COMMIT').length, 0);
        assert.equal(harness.lifecycle.acquired, 1);
        assert.equal(harness.lifecycle.released, 1);
    }
    finally {
        harness.restore();
    }
});

test('catalog IDs accept the Discord-safe 100-character boundary and reject longer values in service and repository', async () => {
    const handlerPath = require.resolve(path.join(verificationDirectory, 'verificationDbHandler'));
    const servicePath = require.resolve(path.join(verificationDirectory, 'verificationService'));
    const cachedHandler = require.cache[handlerPath];
    const cachedService = require.cache[servicePath];
    const forwarded = [];
    const boundaryId = 'a'.repeat(100);
    const oversizedId = 'a'.repeat(101);
    require.cache[handlerPath] = {
        id: handlerPath, filename: handlerPath, loaded: true,
        exports: {
            VERIFICATION_MODES: { challenge: 'challenge', halt: 'halt', oneClick: 'one-click' },
            createCustomChallenge: async (...args) => { forwarded.push(args); return { result: { id: args[1].id } }; },
            createCustomQuestion: async (...args) => { forwarded.push(args); return { result: { id: args[2].id } }; },
        },
    };
    delete require.cache[servicePath];
    const service = require(servicePath);

    try {
        const accepted = await service.createCustomChallenge('guild-id-limit', {
            id: boundaryId, title: 'Boundary ID',
        }, 'admin-id');
        assert.equal(accepted.result.id, boundaryId);
        assert.equal(forwarded[0][1].id, boundaryId);
        assert.throws(
            () => service.createCustomChallenge('guild-id-limit', { id: oversizedId, title: 'Too long' }, 'admin-id'),
            /1-100 characters/,
        );
        const templateParentQuestion = await service.createCustomQuestion('guild-id-limit', 'multiFieldExample', {
            id: 'custom-text', label: 'Custom text', text: 'Answer this', answerType: 'text',
        }, 'admin-id');
        assert.equal(templateParentQuestion.result.id, 'custom-text');
        assert.equal(forwarded[1][1], 'multiFieldExample');
        assert.deepEqual(forwarded[1][2].answer, { required: true, type: 'text' });
        assert.throws(
            () => service.createCustomQuestion('guild-id-limit', 'multiFieldExample', {
                id: 'custom-position', label: 'Custom position', text: 'Answer this', answerType: 'positions',
            }, 'admin-id'),
            /Set a gallery task/,
        );
    }
    finally {
        restoreModule(servicePath, cachedService);
        restoreModule(handlerPath, cachedHandler);
    }

    const harness = loadCatalogRepositoryWithDatabase(async (sql) => {
        if (sql.startsWith('CREATE TABLE')) return [];
        return [];
    });
    try {
        await assert.rejects(
            harness.repository.createVerificationChallengeCatalogEntry({
                guildId: 'guild-id-limit', challengeId: oversizedId, title: 'Too long', createdBy: 'admin-id',
            }),
            /at most 100 characters/,
        );
        await assert.rejects(
            harness.repository.createVerificationQuestionCatalogEntry({
                guildId: 'guild-id-limit', challengeId: boundaryId,
                question: { id: oversizedId, label: 'Too long', text: 'Too long' }, createdBy: 'admin-id',
            }),
            /at most 100 characters/,
        );
        assert.equal(harness.lifecycle.acquired, 0, 'length validation should happen before transaction acquisition');
    }
    finally {
        harness.restore();
    }
});

test('question Admin workspace keeps the list selector visible and scopes detail fields to active task configuration', () => {
    const adminSource = fs.readFileSync(path.join(repositoryRoot, 'commands', 'Warden', 'admin', 'verification.js'), 'utf8');
    assert.match(adminSource, /buildQuestionWorkspacePayload[\s\S]*buildQuestionListResponse/);
    assert.match(adminSource, /buildQuestionWorkspaceListComponents[\s\S]*buildQuestionSelectRow/);
    assert.doesNotMatch(adminSource, /setLabel\('Select Question'\)/);
    assert.match(adminSource, /buildQuestionAnswerTypeSelectModalLabel\('none', QUESTION_CREATE_ANSWER_TYPE_OPTIONS\)/);
    assert.match(adminSource, /Position answers require a gallery task/);
    assert.match(adminSource, /if \(taskType === 'prompt-text'\)/);
    assert.match(adminSource, /if \(taskUsesImageIds\(taskType\)\)/);
    assert.match(adminSource, /if \(taskUsesDirections\(taskType\)\)/);
    assert.match(adminSource, /compact: true/);
    assert.match(adminSource, /chunkQuestionListLines/);
});

test('merged Admin workspaces reject Components V2 payloads over Discord’s component budget', () => {
    const list = verificationResponses.buildVerificationAdminSummary(
        'Questions',
        'Question list',
        'Summary',
        'info',
        { fields: Array.from({ length: 25 }, (_, index) => ({ name: `Question ${index + 1}`, value: 'Configured' })) },
    );
    const detail = verificationResponses.buildVerificationAdminSummary(
        'Question',
        'Question detail',
        'Summary',
        'info',
        { fields: Array.from({ length: 12 }, (_, index) => ({ name: `Detail ${index + 1}`, value: 'Configured' })) },
    );
    assert.throws(
        () => verificationResponses.mergeVerificationAdminResponses(list, detail),
        /components/,
    );
});

test('full protected reset reconciles current template rows, tombstones obsolete templates, and preserves custom rows', async () => {
    let ownershipConflict = false;
    const obsoleteDeletes = [];
    const protectedResets = [];
    const protectedUpserts = [];
    const orderUpdates = [];
    const baseRows = [
        {
            question_id: 'starter-ship-name', question_order: 8, source_type: 'template',
            protected_template: 1, deleted_at: '2026-01-01T00:00:00.000Z',
        },
        {
            question_id: 'obsolete-template-question', question_order: 2, source_type: 'template',
            protected_template: 1, deleted_at: null,
        },
        {
            question_id: 'custom-child', question_order: 1, source_type: 'admin',
            protected_template: 0, deleted_at: null,
        },
    ];
    const harness = loadCatalogRepositoryWithDatabase(async (sql, values) => {
        if (sql.startsWith('CREATE TABLE')) return [];
        if (sql === 'START TRANSACTION' || sql === 'COMMIT' || sql === 'ROLLBACK') return [];
        if (sql.startsWith('SELECT * FROM verification_challenge_catalog')) {
            return [{ guild_id: 'guild-full-reset', challenge_id: 'eliteVesselGallery', source_type: 'template', protected_template: 1 }];
        }
        if (sql.startsWith('SELECT question_id, question_order, source_type')) {
            const rows = baseRows.map((row) => ({ ...row }));
            if (ownershipConflict) {
                rows.push({
                    question_id: 'starter-ship-gallery', question_order: 4,
                    source_type: 'admin', protected_template: 0, deleted_at: null,
                });
            }
            return rows;
        }
        if (sql.startsWith('UPDATE verification_challenge_catalog SET')) return { affectedRows: 1 };
        if (sql.includes("SET deleted_at = CURRENT_TIMESTAMP") && sql.includes("source_type = 'template'")) {
            obsoleteDeletes.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET question_order = ?, question_label')) {
            protectedResets.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('INSERT INTO verification_question_catalog')) {
            protectedUpserts.push(values);
            return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE verification_question_catalog SET question_order = ?, updated_by = ?')) {
            orderUpdates.push(values);
            return { affectedRows: 1 };
        }
        return [];
    });

    try {
        const result = await harness.repository.deleteOrResetVerificationChallengeCatalogEntry({
            guildId: 'guild-full-reset', challengeId: 'eliteVesselGallery', updatedBy: 'admin-reset',
        });
        assert.deepEqual(result, { action: 'reset', challengeId: 'eliteVesselGallery' });
        assert.equal(obsoleteDeletes.length, 1);
        assert.equal(obsoleteDeletes[0][3], 'obsolete-template-question');
        assert.equal(protectedResets.length, 1, 'an existing deleted protected row should be restored');
        assert.equal(protectedResets[0][21], 'starter-ship-name');
        assert.equal(protectedUpserts.length, 1, 'a missing current template row should be reinserted');
        assert.equal(protectedUpserts[0][2], 'starter-ship-gallery');
        assert.deepEqual(orderUpdates.map((values) => [values[4], values[0]]), [
            ['custom-child', 3],
        ]);
        assert.ok(!harness.lifecycle.queries.some(([sql, values]) =>
            sql.includes('deleted_at = CURRENT_TIMESTAMP') && values.includes('custom-child')));

        ownershipConflict = true;
        const writesBeforeConflict = obsoleteDeletes.length + protectedResets.length + protectedUpserts.length + orderUpdates.length;
        await assert.rejects(
            harness.repository.deleteOrResetVerificationChallengeCatalogEntry({
                guildId: 'guild-full-reset', challengeId: 'eliteVesselGallery', updatedBy: 'admin-reset',
            }),
            /owned by a custom row/,
        );
        assert.equal(harness.lifecycle.queries.filter(([sql]) => sql === 'ROLLBACK').length, 1);
        assert.equal(harness.lifecycle.released, 2);
        assert.equal(
            obsoleteDeletes.length + protectedResets.length + protectedUpserts.length + orderUpdates.length,
            writesBeforeConflict + 2,
            'the conflicting transaction may stage reset work before detecting the missing template ID collision, then rolls it back',
        );
    }
    finally {
        harness.restore();
    }
});
