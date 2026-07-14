function shuffleArray(items) {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
}

function pickRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function pickRandomItems(items, count, itemRole) {
    if (items.length < count) {
        throw new Error(`Verification image pool does not contain enough ${itemRole} images. Required ${count}, found ${items.length}.`);
    }

    return shuffleArray(items).slice(0, count);
}

function pickRandomItemsWithRepeats(items, count, itemRole) {
    if (count <= 0) {
        return [];
    }

    if (items.length < 1) {
        throw new Error(`Verification image pool does not contain any ${itemRole} images. Required ${count}.`);
    }

    if (items.length >= count) {
        return pickRandomItems(items, count, itemRole);
    }

    const selectedItems = [];

    while (selectedItems.length < count) {
        selectedItems.push(items[Math.floor(Math.random() * items.length)]);
    }

    return selectedItems;
}

function pickRandomItemsWithRepeatLimit(items, count, maxRepeats, itemRole) {
    const normalizedMaxRepeats = Math.floor(Number(maxRepeats ?? 1));

    if (!Number.isInteger(normalizedMaxRepeats) || normalizedMaxRepeats < 1) {
        throw new Error(`Invalid ${itemRole} image repeat limit: ${maxRepeats}`);
    }

    if (items.length * normalizedMaxRepeats < count) {
        throw new Error(`Verification image pool does not contain enough ${itemRole} image capacity. Required ${count}, capacity ${items.length * normalizedMaxRepeats}.`);
    }

    const selectedItems = [];
    const selectedCounts = new Map();

    while (selectedItems.length < count) {
        const availableItems = items.filter((item) => (selectedCounts.get(item.id) ?? 0) < normalizedMaxRepeats);
        const selectedItem = availableItems[Math.floor(Math.random() * availableItems.length)];
        selectedCounts.set(selectedItem.id, (selectedCounts.get(selectedItem.id) ?? 0) + 1);
        selectedItems.push(selectedItem);
    }

    return selectedItems;
}

module.exports = {
    shuffleArray,
    pickRandomItem,
    pickRandomItems,
    pickRandomItemsWithRepeats,
    pickRandomItemsWithRepeatLimit,
};
