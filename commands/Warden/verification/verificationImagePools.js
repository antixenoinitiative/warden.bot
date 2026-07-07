const fs = require('fs/promises');
const path = require('path');

/**
 * Reusable image pools for verification gallery challenges.
 *
 * Each pool can be referenced by one or more verification challenges. Images with role
 * `solution` are correct gallery choices; images with role `control` are distractors.
 * Pools with `directory` read local image `fileName` entries from that directory.
 * `fallbackUrl` can keep verification available if a local file is missing.
 *
 * Keep URLs and any displayed metadata neutral. Discord clients receive them.
 * - Changed code so images are turned into discordapp attachments before transmitting,
 * this will obscure image URLs atlest.
 */
const verificationImagePools = {
    
    eliteVessels_c: {
        id: 'eliteVessels_c',
        description: 'Elite Dangerous vessel img pool for verification challenges.',
        images: [
            {
                id: 'ev8',
                role: 'solution',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel8_c.png',
            },
            {
                id: 'ev1',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel1_c.png',
            },
            {
                id: 'ev2',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel2_c.png',
            },
            {
                id: 'ev3',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel3_c.png',
            },
            {
                id: 'ev9',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel9_c.png',
            },
            {
                id: 'ev4',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel4_c.png',
            },
            {
                id: 'ev5',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel5_c.png',
            },
            {
                id: 'ev6',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel6_c.png',
            },
            {
                id: 'ev10',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel10_c.png',
            },
            {
                id: 'ev7',
                role: 'control',
                url: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel7_c.png',
            },
        ],
    },
    eliteVessels_c_local: {
        id: 'eliteVessels_c_local',
        description: 'Local Elite Dangerous vessel img pool for verification challenges.',
        directory: '/home/container/verificationPool/',
        images: [
            {
                id: 'elitevessel8',
                role: 'solution',
                fileName: 'elitevessel8_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel8_c.png',
            },
            {
                id: 'elitevessel1',
                role: 'control',
                fileName: 'elitevessel1_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel1_c.png',
            },
            {
                id: 'elitevessel2',
                role: 'control',
                fileName: 'elitevessel2_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel2_c.png',
            },
            {
                id: 'elitevessel3',
                role: 'control',
                fileName: 'elitevessel3_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel3_c.png',
            },
            {
                id: 'elitevessel9',
                role: 'control',
                fileName: 'elitevessel9_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel9_c.png',
            },
            {
                id: 'elitevessel4',
                role: 'control',
                fileName: 'elitevessel4_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel4_c.png',
            },
            {
                id: 'elitevessel5',
                role: 'control',
                fileName: 'elitevessel5_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel5_c.png',
            },
            {
                id: 'elitevessel6',
                role: 'control',
                fileName: 'elitevessel6_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel6_c.png',
            },
            {
                id: 'elitevessel10',
                role: 'control',
                fileName: 'elitevessel10_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel10_c.png',
            },
            {
                id: 'elitevessel7',
                role: 'control',
                fileName: 'elitevessel7_c.png',
                fallbackUrl: 'https://antixenoinitiative.com/wp-content/uploads/elitevessel7_c.png',
            },
        ],
    },
};

function getVerificationImagePool(poolId) {
    if (!poolId) return undefined;

    return verificationImagePools[poolId];
}

async function getLocalVerificationImagePoolIssues() {
    const issues = [];

    for (const pool of Object.values(verificationImagePools)) {
        if (!pool.directory) continue;

        const resolvedDirectory = path.resolve(pool.directory);

        for (const image of pool.images ?? []) {
            if (!image.fileName) continue;

            const filePath = path.resolve(resolvedDirectory, image.fileName);

            if (!filePath.startsWith(`${resolvedDirectory}${path.sep}`)) {
                issues.push(`${pool.id}/${image.id}: invalid local path ${image.fileName}`);
                continue;
            }

            try {
                await fs.access(filePath);
            }
            catch (err) {
                issues.push(`${pool.id}/${image.id}: missing local file ${filePath}`);
            }
        }
    }

    return issues;
}

module.exports = {
    verificationImagePools,
    getLocalVerificationImagePoolIssues,
    getVerificationImagePool,
};
