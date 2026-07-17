function normalizeEditableText(value) {
    return String(value ?? '').trim();
}

function sameStringSet(leftValues = [], rightValues = []) {
    const left = [...new Set(leftValues.map(String))].sort();
    const right = [...new Set(rightValues.map(String))].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseAnswerOverrideList(input) {
    return String(input ?? '')
        .split(/[\n,]+/)
        .map((answer) => answer.trim())
        .filter(Boolean);
}

function resolveBaselineEdit(field, baseline, current, submitted) {
    const openingValue = normalizeEditableText(baseline?.[field]);
    const currentValue = normalizeEditableText(current);
    const submittedValue = normalizeEditableText(submitted);

    if (submittedValue === openingValue || submittedValue === currentValue) {
        return { changed: false, value: currentValue };
    }
    if (currentValue !== openingValue) {
        throw new Error(`The ${field} was changed by another administrator. Reopen the editor and apply your change again.`);
    }
    return { changed: true, value: submittedValue };
}

function resolveBaselineAnswersEdit(baseline, currentAnswers, submittedAnswers) {
    const openingAnswers = parseAnswerOverrideList(baseline?.answers ?? '');
    const current = currentAnswers ?? [];
    const submitted = submittedAnswers ?? [];

    if (sameStringSet(submitted, openingAnswers) || sameStringSet(submitted, current)) {
        return { changed: false, value: current };
    }
    if (!sameStringSet(current, openingAnswers)) {
        throw new Error('Accepted answers were changed by another administrator. Reopen the editor and apply your change again.');
    }
    return { changed: true, value: submitted };
}

function resolveBaselineStringSetEdit(field, openingValues, currentValues, submittedValues) {
    const opening = openingValues ?? [];
    const current = currentValues ?? [];
    const submitted = submittedValues ?? [];

    if (sameStringSet(submitted, opening) || sameStringSet(submitted, current)) {
        return { changed: false, value: current };
    }
    if (!sameStringSet(current, opening)) {
        throw new Error(`The ${field} were changed by another administrator. Reopen the editor and apply your change again.`);
    }
    return { changed: true, value: submitted };
}

module.exports = {
    parseAnswerOverrideList,
    resolveBaselineAnswersEdit,
    resolveBaselineEdit,
    resolveBaselineStringSetEdit,
    sameStringSet,
};
