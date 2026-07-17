const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Discord = require('discord.js');

const verificationDirectory = path.resolve(__dirname, '..', 'commands', 'Warden', 'verification');
const flowPath = path.join(verificationDirectory, 'verificationFlow.js');

function replaceModule(modulePath, exports) {
    const cached = require.cache[modulePath];
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
    return () => {
        delete require.cache[modulePath];
        if (cached) require.cache[modulePath] = cached;
    };
}

function loadFlowWithRuntimeStubs(observed) {
    const restores = [];
    const remember = (relativePath, exports) => restores.push(replaceModule(require.resolve(path.join(verificationDirectory, relativePath)), exports));
    const v2 = Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2;

    restores.push(replaceModule(
        require.resolve(path.resolve(verificationDirectory, '../../../functions.js')),
        { botLog: async () => undefined },
    ));

    remember('verificationService.js', {
        VERIFICATION_MODES: { challenge: 'challenge', halt: 'halt', oneClick: 'oneClick' },
        getVerificationSnapshot: async () => ({
            generation: 1,
            runtime: { mode: 'challenge', activeChallenges: [{ id: 'challenge', title: 'Challenge', questions: [{}] }] },
        }),
        evaluateVerificationConfig: () => ({ blockingIssues: [], activeBlockingIssues: [] }),
        applyVerificationConfigSafeguard: async () => {},
    });
    remember('verificationChallenges/verificationChallenges.js', {
        buildQuestionScreens: () => [
            { index: 0, questions: [], answerRequired: false },
            { index: 1, questions: [], answerRequired: false },
        ],
        validateQuestionScreens: () => [],
        screenRequiresAnswer: () => false,
        getScreenRequiredAnswerQuestions: () => [],
        screenAllowsBack: () => true,
        validateScreenAnswers: () => ({ ok: true }),
    });
    remember('verificationImages.js', {
        GALLERY_IMAGE_FETCH_TIMEOUT_CODE: 'timeout',
        prepareQuestionAssets: async (screen) => {
            observed.preparedScreens ??= [];
            observed.preparedScreens.push(screen.index);
            return { [`screen-${screen.index}`]: { preparedFor: screen.index } };
        },
    });
    remember('verificationInteraction.js', {
        deferEphemeralReply: async (interaction) => { interaction.deferred = true; },
        deferSourceUpdate: async (interaction) => { interaction.deferred = true; },
        sanitizeMessageEditOptions: (payload) => ({ ...payload, flags: Number(payload.flags ?? 0) & ~Discord.MessageFlags.Ephemeral }),
        sendEphemeralNotice: async () => {},
        sendInitialInteractionResponse: async (interaction, payload) => interaction.reply(payload),
    });
    remember('verificationResponses.js', {
        COMPONENTS_V2_RENDERER: 'components-v2',
        LEGACY_RENDERER: 'legacy',
        isComponentsV2Available: () => true,
        buildVerificationPublicResponse: () => ({}),
        buildVerificationInProgressResponse: () => ({}),
        buildVerificationExpiredResponse: (content) => ({ content }),
        buildVerificationFailureResponse: () => ({}),
        buildVerificationErrorEmbed: () => ({}),
        buildChallengeIntroOptions: () => ({ flags: v2, components: ['intro'] }),
        buildQuestionScreenOptions: (_challenge, screen, assets, session) => {
            observed.v2Tokens.push(session.token);
            observed.renderedScreenAssets ??= [];
            observed.renderedScreenAssets.push(assets);
            return { flags: v2, components: [`screen-${screen.index}`] };
        },
        buildQuestionScreenLegacyPages: () => [{ flags: Discord.MessageFlags.Ephemeral, embeds: ['legacy'], components: ['legacy-controls'] }],
        buildOldVersionFallbackOptions: (_challenge, session) => {
            observed.fallbackTokens.push(session.fallbackToken ?? session.token);
            return { flags: Discord.MessageFlags.Ephemeral, embeds: ['fallback'], components: ['old-version'] };
        },
        buildAnswerModal: () => ({}),
        buildAnswerInputCustomId: (index) => `q:${index}`,
        buildCompletedQuestionOptions: (_message, { renderer }) => ({
            flags: renderer === 'components-v2' ? v2 : Discord.MessageFlags.Ephemeral,
            components: [],
            embeds: renderer === 'legacy' ? ['completed'] : undefined,
        }),
        parseAnswerCustomId: () => undefined,
        parseNextCustomId: (id) => {
            const [, screenIndex, token] = id.match(/wardenVerify-next-(\d+):(.+)/) ?? [];
            return { screenIndex: Number(screenIndex), token };
        },
        parseBackCustomId: (id) => {
            const [, screenIndex, token] = id.match(/wardenVerify-back-(\d+):(.+)/) ?? [];
            return { screenIndex: Number(screenIndex), token };
        },
        parseOldVersionCustomId: (id) => ({ fallbackToken: id.slice('wardenVerify-oldVersion-'.length) }),
        parseSubmitCustomId: () => undefined,
    });

    delete require.cache[flowPath];
    const flow = require(flowPath);
    return { flow, restore: () => { delete require.cache[flowPath]; restores.reverse().forEach((restore) => restore()); } };
}

function buttonInteraction(customId, operations, { followUpIds = [], throwOnEditReply = false } = {}) {
    return {
        customId,
        user: { id: 'user-1' },
        guild: {},
        guildId: 'guild-1',
        deferred: false,
        replied: false,
        isButton: () => true,
        isModalSubmit: () => false,
        editReply: async (payload) => {
            if (throwOnEditReply) throw new Error('Discord delivery failed');
            operations.push(['editReply', payload]);
            return { id: 'intro' };
        },
        followUp: async (payload) => {
            operations.push(['followUp', payload]);
            return { id: followUpIds.shift() };
        },
        reply: async (payload) => operations.push(['reply', payload]),
        webhook: {
            editMessage: async (id, payload) => {
                operations.push(['editMessage', id, payload]);
                return { id };
            },
        },
    };
}

test('the original Old Version control remains valid after V2 screen advancement and uses renderer-safe handoff edits', { concurrency: false }, async () => {
    const observed = { v2Tokens: [], fallbackTokens: [] };
    const { flow, restore } = loadFlowWithRuntimeStubs(observed);

    try {
        const startOperations = [];
        await flow.handleVerificationInteraction(buttonInteraction('wardenVerify-start', startOperations, {
            followUpIds: ['v2-question', 'legacy-prompt'],
        }));
        const firstScreenToken = observed.v2Tokens.at(-1);
        const stableFallbackToken = observed.fallbackTokens.at(-1);

        const advanceOperations = [];
        await flow.handleVerificationInteraction(buttonInteraction(`wardenVerify-next-0:${firstScreenToken}`, advanceOperations));
        assert.equal(observed.fallbackTokens.at(-1), stableFallbackToken, 'advancing does not rotate the fallback identity');

        const fallbackOperations = [];
        await flow.handleVerificationInteraction(buttonInteraction(`wardenVerify-oldVersion-${stableFallbackToken}`, fallbackOperations, {
            followUpIds: ['legacy-question'],
        }));

        assert.equal(fallbackOperations[0][0], 'followUp', 'a usable legacy page is sent before V2 is deactivated');
        const edits = fallbackOperations.filter(([method]) => method === 'editMessage');
        const v2Edit = edits.find(([, id]) => id === 'v2-question');
        const promptEdit = edits.find(([, id]) => id === 'legacy-prompt');
        assert.ok(v2Edit);
        assert.ok(promptEdit);
        assert.ok(v2Edit[2].flags & Discord.MessageFlags.IsComponentsV2, 'V2 challenge is edited only with a V2 payload');
        assert.equal(promptEdit[2].flags & Discord.MessageFlags.IsComponentsV2, 0, 'legacy prompt is edited only with a legacy payload');
    }
    finally {
        flow.__testing.clearChallenge('user-1');
        restore();
    }
});

test('screen assets are prepared once per cached screen and reused after Back navigation', { concurrency: false }, async () => {
    const observed = { v2Tokens: [], fallbackTokens: [], preparedScreens: [], renderedScreenAssets: [] };
    const { flow, restore } = loadFlowWithRuntimeStubs(observed);

    try {
        await flow.handleVerificationInteraction(buttonInteraction('wardenVerify-start', [], {
            followUpIds: ['v2-question', 'legacy-prompt'],
        }));
        const firstScreenToken = observed.v2Tokens.at(-1);

        await flow.handleVerificationInteraction(buttonInteraction(`wardenVerify-next-0:${firstScreenToken}`, []));
        const secondScreenToken = observed.v2Tokens.at(-1);

        await flow.handleVerificationInteraction(buttonInteraction(`wardenVerify-back-1:${secondScreenToken}`, []));

        assert.deepEqual(observed.preparedScreens, [0, 1]);
        assert.strictEqual(
            observed.renderedScreenAssets.at(-1),
            observed.renderedScreenAssets[0],
            'returning to a screen uses the original asset object, preserving generated gallery state',
        );
    }
    finally {
        flow.__testing.clearChallenge('user-1');
        restore();
    }
});

test('the direct expiry handler releases runtime sessions without the periodic sweep', { concurrency: false }, () => {
    const observed = { v2Tokens: [], fallbackTokens: [] };
    const { flow, restore } = loadFlowWithRuntimeStubs(observed);
    const userId = 'expiry-test-user';

    try {
        const expiresAt = Date.now() - 1;
        assert.equal(flow.__testing.setChallenge(userId, { expiresAt }), true);
        assert.ok(flow.__testing.getActiveChallenge(userId));

        flow.__testing.expireChallengeIfDue(userId, expiresAt);
        assert.equal(flow.__testing.getActiveChallenge(userId), undefined);
        assert.equal(flow.__testing.getActiveChallengeCount(), 0);
    }
    finally {
        flow.__testing.clearChallenge(userId);
        restore();
    }
});

test('runtime verification rejects new sessions at its bounded capacity without evicting active users', { concurrency: false }, () => {
    const observed = { v2Tokens: [], fallbackTokens: [] };
    const { flow, restore } = loadFlowWithRuntimeStubs(observed);
    const userIds = [];

    try {
        const expiresAt = Date.now() + 60_000;
        for (let index = 0; index < flow.__testing.MAX_ACTIVE_VERIFICATION_SESSIONS; index += 1) {
            const userId = `capacity-test-${index}`;
            userIds.push(userId);
            assert.equal(flow.__testing.setChallenge(userId, { expiresAt }), true);
        }

        assert.equal(flow.__testing.getActiveChallengeCount(), flow.__testing.MAX_ACTIVE_VERIFICATION_SESSIONS);
        assert.equal(flow.__testing.setChallenge('capacity-test-overflow', { expiresAt }), false);
        assert.ok(flow.__testing.getActiveChallenge(userIds[0]), 'an existing active session is not evicted to admit another user');
    }
    finally {
        userIds.forEach((userId) => flow.__testing.clearChallenge(userId));
        flow.__testing.clearChallenge('capacity-test-overflow');
        restore();
    }
});

test('failed initial Discord delivery releases the reserved verification session', { concurrency: false }, async () => {
    const observed = { v2Tokens: [], fallbackTokens: [] };
    const { flow, restore } = loadFlowWithRuntimeStubs(observed);

    try {
        const originalConsoleError = console.error;
        console.error = () => undefined;
        try {
            await flow.handleVerificationInteraction(buttonInteraction('wardenVerify-start', [], { throwOnEditReply: true }));
        }
        finally {
            console.error = originalConsoleError;
        }
        assert.equal(flow.__testing.getActiveChallenge('user-1'), undefined);
        assert.equal(flow.__testing.getActiveChallengeCount(), 0);
    }
    finally {
        flow.__testing.clearChallenge('user-1');
        restore();
    }
});
