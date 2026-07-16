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
        updateChallengeMetaOverrides: async () => {
            if (failWrite) throw new Error('write failed');
            return { mode: 'challenge', activeChallengeIds: ['alpha'], challengeOverrides: {} };
        },
    };
    for (const methodName of [
        'setQuestionCommonOverrides',
        'setQuestionImageTextOverride',
        'setQuestionAnswerOverrides',
        'setQuestionImageIdOverrides',
        'setQuestionImageDirectionOverrides',
        'updateQuestionOptionOverrides',
        'clearQuestionOverrideFields',
    ]) {
        settingsStub[methodName] = async () => ({ mode: 'challenge', activeChallengeIds: ['alpha'], challengeOverrides: {} });
    }
    const catalogStub = {
        clearVerificationChallengeCatalogCache: () => undefined,
        ensureVerificationChallengeTemplatesSeeded: async () => undefined,
        getVerificationChallengeCatalog: async () => {
            catalogReads += 1;
            return { alpha: { id: 'alpha', questions: [{ id: 'question-1' }] } };
        },
        catalogChallengesToSettingsOverrides: () => ({ alpha: { questions: {} } }),
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

        failWrite = true;
        await assert.rejects(
            db.updateChallengeMetaOverrides('guild-1', 'alpha', {}, 'tester'),
            /write failed/,
        );
        await db.loadVerificationSnapshot('guild-1');
        assert.equal(settingsReads, 3);
        assert.equal(catalogReads, 3);

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

    const imageSource = fs.readFileSync(path.join(verificationDirectory, 'verificationImages.js'), 'utf8');
    assert.doesNotMatch(imageSource, /localGalleryImageBufferCache/);
});
