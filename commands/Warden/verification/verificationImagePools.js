/**
 * Reusable image pools for verification gallery challenges.
 *
 * Each pool can be referenced by one or more verification challenges. Images with role
 * `solution` are correct gallery choices; images with role `control` are distractors.
 *
 * Keep URLs and any displayed metadata neutral. Discord clients receive them.
 * - Changed code so images are turned into discordapp attachments before transmitting,
 * this will obscure image URLs atlest.
 */
const verificationImagePools = {
    eliteStarterShips: {
        id: 'eliteStarterShips',
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
                id: 'hauler-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel10.png',
            },
            {
                id: 'fas-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel7.png',
            },
        ],
    },
    eliteStarterShips_c: {
        id: 'eliteStarterShips_c',
        description: 'Elite Dangerous vessel img pool for starter ship question.',
        images: [
            {
                id: 'sidewinder-1',
                role: 'solution',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel8_c.png',
            },
            {
                id: 'chieftain-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel1_c.png',
            },
            {
                id: 'clops-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel2_c.png',
            },
            {
                id: 'type-7-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel3_c.png',
            },
            {
                id: 'eagle-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel9_c.png',
            },
            {
                id: 'imp-eagle-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel4_c.png',
            },
            {
                id: 'krait-mk2-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel5_c.png',
            },
            {
                id: 'type-10-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel6_c.png',
            },
            {
                id: 'hauler-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel10_c.png',
            },
            {
                id: 'fas-1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel7_c.png',
            },
        ],
    },
    eliteStarterShips_c_local: {
        id: 'eliteStarterShips_c_local',
        description: 'Local Elite Dangerous vessel img pool for starter ship question.',
        directory: '/home/container/verificationPool/',
        images: [
            {
                id: 'sidewinder-1',
                role: 'solution',
                url: 'elitevessel8_c.png',
            },
            {
                id: 'chieftain-1',
                role: 'control',
                url: 'elitevessel1_c.png',
            },
            {
                id: 'clops-1',
                role: 'control',
                url: 'elitevessel2_c.png',
            },
            {
                id: 'type-7-1',
                role: 'control',
                url: 'elitevessel3_c.png',
            },
            {
                id: 'eagle-1',
                role: 'control',
                url: 'elitevessel9_c.png',
            },
            {
                id: 'imp-eagle-1',
                role: 'control',
                url: 'elitevessel4_c.png',
            },
            {
                id: 'krait-mk2-1',
                role: 'control',
                url: 'elitevessel5_c.png',
            },
            {
                id: 'type-10-1',
                role: 'control',
                url: 'elitevessel6_c.png',
            },
            {
                id: 'hauler-1',
                role: 'control',
                url: 'elitevessel10_c.png',
            },
            {
                id: 'fas-1',
                role: 'control',
                url: 'elitevessel7_c.png',
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
