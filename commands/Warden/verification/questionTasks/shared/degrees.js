const FULL_TURN_DEGREES = 360;
const DEFAULT_ROTATION_ALIGNMENT_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

function normalizeDegrees(degrees) {
    const normalized = Number(degrees) % FULL_TURN_DEGREES;
    return normalized < 0 ? normalized + FULL_TURN_DEGREES : normalized;
}

function isAllowedRotationDegree(degrees) {
    return Number.isInteger(Number(degrees))
        && Number(degrees) >= 0
        && Number(degrees) < FULL_TURN_DEGREES
        && Number(degrees) % 45 === 0;
}

function getDegreeList(value, fallback = DEFAULT_ROTATION_ALIGNMENT_DEGREES) {
    if (!Array.isArray(value)) return fallback;

    const degrees = [...new Set(value
        .map((entry) => Number(entry))
        .filter(isAllowedRotationDegree)
        .map(normalizeDegrees))]
        .sort((left, right) => left - right);

    return degrees.length > 0 ? degrees : fallback;
}

function hasDirection(directionList, targetDegrees) {
    const normalizedTarget = normalizeDegrees(targetDegrees);
    return directionList.some((degrees) => normalizeDegrees(degrees) === normalizedTarget);
}

function getWorldDirections(localDirections, rotationDegrees) {
    return localDirections.map((degrees) => normalizeDegrees(degrees + rotationDegrees));
}

module.exports = {
    FULL_TURN_DEGREES,
    DEFAULT_ROTATION_ALIGNMENT_DEGREES,
    normalizeDegrees,
    isAllowedRotationDegree,
    getDegreeList,
    hasDirection,
    getWorldDirections,
};
