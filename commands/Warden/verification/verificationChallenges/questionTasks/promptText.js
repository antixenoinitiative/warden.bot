module.exports = {
    type: 'prompt-text',
    label: 'Prompt Text',

    async prepareAsset(question, context) {
        const generatedImage = question.generatedImage ?? {};
        const promptText = generatedImage.text;
        const label = context.label ?? question.label ?? question.id;
        const { challengeId, helpers } = context;

        if (!promptText && generatedImage.requiresConfiguredText === true) {
            throw new Error(`Verification challenge "${challengeId}" question "${question.id}" requires configured generated image text.`);
        }

        if (!promptText) return undefined;

        const promptImage = await helpers.createPromptImageAttachment(promptText);

        return {
            type: 'prompt-text',
            promptImage,
            files: [promptImage.attachment],
            displayItems: [{
                type: 'image',
                displayUrl: promptImage.displayUrl,
                description: `${label} prompt`,
            }],
        };
    },
};
