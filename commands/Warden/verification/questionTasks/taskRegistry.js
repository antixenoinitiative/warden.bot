const none = require('./none');
const promptText = require('./promptText');
const staticImage = require('./staticImage');
const galleryStandard = require('./galleryStandard');
const rotationAlignment = require('./rotationAlignment');

const questionTaskModules = new Map([
    [none.type, none],
    [promptText.type, promptText],
    [staticImage.type, staticImage],
    [galleryStandard.type, galleryStandard],
    [rotationAlignment.type, rotationAlignment],
]);

function getQuestionTaskType(question) {
    const generatedImage = question?.generatedImage ?? {};

    if (generatedImage.enabled !== true || generatedImage.type === 'none') {
        return 'none';
    }

    return question?.task?.type ?? generatedImage.type ?? 'none';
}

function getQuestionTaskModule(question) {
    const taskType = getQuestionTaskType(question);
    return questionTaskModules.get(taskType);
}

function requireQuestionTaskModule(question, challengeId) {
    const taskType = getQuestionTaskType(question);
    const taskModule = questionTaskModules.get(taskType);

    if (!taskModule) {
        throw new Error(`Unsupported question task type "${taskType}" for challenge "${challengeId}" question "${question?.id}".`);
    }

    return taskModule;
}

module.exports = {
    questionTaskModules,
    getQuestionTaskType,
    getQuestionTaskModule,
    requireQuestionTaskModule,
};
