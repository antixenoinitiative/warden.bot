const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeVerificationChallenge } = require('../commands/Warden/verification/verificationChallenges/verificationChallenges');

function normalizeQuestion(answer) {
    return normalizeVerificationChallenge({
        id: 'answer-normalization',
        questions: [{ id: 'question', answer }],
    }).questions[0];
}

test('catalog answer types without a legacy required flag remain required', () => {
    const question = normalizeQuestion({ type: 'text', accepted: ['warden'] });

    assert.deepEqual(question.answer, {
        required: true,
        type: 'text',
        accepted: ['warden'],
    });
});

test('an explicit No Answer flag overrides a retained answer type', () => {
    const question = normalizeQuestion({ required: false, type: 'text' });

    assert.equal(question.answer.required, false);
    assert.equal(question.answer.type, 'text');
});
