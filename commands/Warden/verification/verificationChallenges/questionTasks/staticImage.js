module.exports = {
    type: 'static-image',
    label: 'Static Image',

    async prepareAsset(question, context) {
        const generatedImage = question.generatedImage ?? {};
        const label = context.label ?? question.label ?? question.id;

        if (!generatedImage.url) return undefined;

        return {
            type: 'static-image',
            displayItems: [{
                type: 'image',
                displayUrl: generatedImage.url,
                description: label,
            }],
            files: [],
        };
    },
};
