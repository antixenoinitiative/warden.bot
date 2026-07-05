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
        id: 'eliteStarterShips',
        description: 'Example Elite Dangerous starter ship pool. Replace neutral placeholder URLs with production ship images before enabling.',
        images: [
            {
                id: 'sidewinder-1',
                role: 'solution',
                url: 'https://placehold.co/1024x576/1f2937/ffffff.png?text=Verification+Image+01',
            },
            {
                id: 'sidewinder-2',
                role: 'solution',
                url: 'https://placehold.co/1024x576/111827/ffffff.png?text=Verification+Image+02',
            },
            {
                id: 'cobra-mk3-1',
                role: 'control',
                url: 'https://placehold.co/1024x576/374151/ffffff.png?text=Verification+Image+03',
            },
            {
                id: 'viper-mk3-1',
                role: 'control',
                url: 'https://placehold.co/1024x576/4b5563/ffffff.png?text=Verification+Image+04',
            },
            {
                id: 'eagle-1',
                role: 'control',
                url: 'https://placehold.co/1024x576/6b7280/ffffff.png?text=Verification+Image+05',
            },
            {
                id: 'adder-1',
                role: 'control',
                url: 'https://placehold.co/1024x576/475569/ffffff.png?text=Verification+Image+06',
            },
            {
                id: 'hauler-1',
                role: 'control',
                url: 'https://placehold.co/1024x576/334155/ffffff.png?text=Verification+Image+07',
            },
            {
                id: 'diamondback-explorer-1',
                role: 'control',
                url: 'https://placehold.co/1024x576/1e293b/ffffff.png?text=Verification+Image+08',
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
