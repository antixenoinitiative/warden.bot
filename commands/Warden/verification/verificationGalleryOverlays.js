const fetch = require('node-fetch');

// Best-effort Components V2 gallery image numbering.
// This module is intentionally isolated so it can be removed or replaced with a
// stronger renderer (for example sharp/canvas/CDN storage) without touching the
// rest of the verification challenge flow.
const ENABLE_GALLERY_IMAGE_OVERLAYS = true;
const OVERLAY_CANVAS_SIZE = 1024;
const OVERLAY_BADGE_RADIUS = 118;
const OVERLAY_BADGE_CENTER = 154;
const OVERLAY_FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

function escapeXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function extensionForContentType(contentType) {
    if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpg';
    if (contentType === 'image/webp') return 'webp';
    if (contentType === 'image/gif') return 'gif';
    return 'png';
}

function buildNumberedGallerySvg(imageDataUri, position) {
    const escapedPosition = escapeXml(position);

    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OVERLAY_CANVAS_SIZE}" height="${OVERLAY_CANVAS_SIZE}" viewBox="0 0 ${OVERLAY_CANVAS_SIZE} ${OVERLAY_CANVAS_SIZE}">
  <rect width="100%" height="100%" fill="#050505"/>
  <image href="${imageDataUri}" x="0" y="0" width="${OVERLAY_CANVAS_SIZE}" height="${OVERLAY_CANVAS_SIZE}" preserveAspectRatio="xMidYMid meet"/>
  <circle cx="${OVERLAY_BADGE_CENTER}" cy="${OVERLAY_BADGE_CENTER}" r="${OVERLAY_BADGE_RADIUS}" fill="#050505" fill-opacity="0.86" stroke="#ffffff" stroke-width="16"/>
  <text x="${OVERLAY_BADGE_CENTER}" y="${OVERLAY_BADGE_CENTER + 41}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="136" font-weight="800" fill="#ffffff" stroke="#050505" stroke-width="5" paint-order="stroke">${escapedPosition}</text>
</svg>`);
}

async function fetchImageAsDataUri(imageUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OVERLAY_FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(imageUrl, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Image fetch failed with status ${response.status}`);
        }

        const contentType = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!SUPPORTED_CONTENT_TYPES.has(contentType)) {
            throw new Error(`Unsupported image content type: ${contentType || 'unknown'}`);
        }

        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_IMAGE_BYTES) {
            throw new Error(`Image is too large: ${contentLength} bytes`);
        }

        const imageBuffer = await response.buffer();
        if (imageBuffer.byteLength > MAX_SOURCE_IMAGE_BYTES) {
            throw new Error(`Image is too large: ${imageBuffer.byteLength} bytes`);
        }

        return {
            dataUri: `data:${contentType};base64,${imageBuffer.toString('base64')}`,
            extension: extensionForContentType(contentType),
        };
    }
    finally {
        clearTimeout(timeout);
    }
}

function buildOverlayFileName(galleryToken, image) {
    const safeToken = String(galleryToken ?? 'gallery').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'gallery';
    return `warden-verification-${safeToken}-${image.position}.svg`;
}

async function createNumberedGalleryOverlayAttachment(galleryToken, image) {
    const { dataUri } = await fetchImageAsDataUri(image.url);
    const name = buildOverlayFileName(galleryToken, image);

    return {
        file: {
            attachment: buildNumberedGallerySvg(dataUri, image.position),
            name,
        },
        image: {
            ...image,
            renderedUrl: `attachment://${name}`,
            originalUrl: image.url,
        },
    };
}

async function prepareGalleryImageOverlays(galleryState) {
    if (!ENABLE_GALLERY_IMAGE_OVERLAYS) {
        return galleryState;
    }

    if (!galleryState?.token || !Array.isArray(galleryState.selectedImages) || galleryState.selectedImages.length < 1) {
        return galleryState;
    }

    try {
        const renderedImages = await Promise.all(
            galleryState.selectedImages.map((image) => createNumberedGalleryOverlayAttachment(galleryState.token, image)),
        );

        return {
            ...galleryState,
            selectedImages: renderedImages.map(({ image }) => image),
            overlayFiles: renderedImages.map(({ file }) => file),
        };
    }
    catch (err) {
        console.error('Failed to prepare numbered verification gallery overlays. Falling back to original images:', err);
        return galleryState;
    }
}

function getGalleryOverlayFiles(galleryState) {
    return Array.isArray(galleryState?.overlayFiles) ? galleryState.overlayFiles : undefined;
}

module.exports = {
    prepareGalleryImageOverlays,
    getGalleryOverlayFiles,
};
