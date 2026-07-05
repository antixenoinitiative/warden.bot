/**
 * Reusable image pools for verification gallery challenges.
 *
 * Each pool can be referenced by one or more verification challenges. Images with role
 * `solution` are correct gallery choices; images with role `control` are distractors.
 *
 * Keep URLs and any displayed metadata neutral. Discord clients receive media URLs, so
 * filenames, query strings, CDN paths, and rendered image text must not reveal whether an
 * image is a solution or what answer it represents.
 */
const verificationImagePools = {
    eliteStarterShips: {
        id: 'eliteStarterShip',
        description: 'Elite Dangerous vessel img pool for starter ship question.',
        images: [
            {
                id: 'sidewinder-1',
                role: 'solution',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel8.png',
            },
            {
                id: 'chieftain-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel1.png',
            },
            {
                id: 'clops-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel2.png',
            },
            {
                id: 'type-7-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel3.png',
            },
            {
                id: 'eagle-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel9.png',
            },
            {
                id: 'imp-eagle-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel4.png',
            },
            {
                id: 'krait-mk2-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel5.png',
            },
            {
                id: 'type-10-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel6.png',
            },
            {
                id: 'fas-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel7.png',
            },
        ],
    },
};

function getVerificationImagePool(poolId) {
    if (!poolId) return undefined;

    return verificationImagePools[poolId];
}

module.exports = {
    verificationImagePools,
    getVerificationImagePool,
};
