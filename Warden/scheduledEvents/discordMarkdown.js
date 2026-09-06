'use strict';

// This module deliberately renders the AST supplied by discord-markdown-parser
// rather than accepting HTML. WordPress remains the final HTML sanitization
// boundary, but event descriptions must be safe before they leave Warden too.
const { SimpleMarkdown, rulesExtended } = require('discord-markdown-parser');

const DEFAULT_MAX_INPUT_LENGTH = 65_535;
const DEFAULT_MAX_OUTPUT_LENGTH = 262_144;
const DISCORD_ID = /^\d{17,21}$/u;
const LIST_ITEM = /^(\s*)([-+*]|\d+[.)])\s+(.*)$/u;
const HEADING = /^(#{1,3})\s+(.+)$/u;
const SUBTEXT = /^-#\s+(.+)$/u;
const QUOTE = /^\s*>\s?(.*)$/u;
const FENCE = /^```([a-z0-9_+.#-]+)?\s*$/iu;
const CURRENT_TIMESTAMP = /^<t:(-?\d+)(?::(R|t|T|d|D|f|F|s|S))?>/u;
const parseDiscordMarkdown = SimpleMarkdown.parserFor({
    ...rulesExtended,
    timestamp: {
        ...rulesExtended.timestamp,
        match: (source) => CURRENT_TIMESTAMP.exec(source),
    },
});

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function safeHttpUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    }
    catch {
        return null;
    }
}

function safeDiscordId(value) {
    const id = String(value ?? '');
    return DISCORD_ID.test(id) ? id : null;
}

function trimToLimit(value, maximum) {
    const text = String(value ?? '').replace(/\r\n?/gu, '\n');
    if (text.length <= maximum) return { text, truncated: false };
    return { text: text.slice(0, Math.max(0, maximum - 1)) + '…', truncated: true };
}

function escapeHtmlToLimit(value, maximum) {
    const chunks = [];
    let used = 0;
    let truncated = false;
    for (const character of String(value ?? '')) {
        const escaped = escapeHtml(character);
        if (used + escaped.length > maximum - 1) {
            truncated = true;
            break;
        }
        chunks.push(escaped);
        used += escaped.length;
    }
    return chunks.join('') + (truncated ? '…' : '');
}

function contentOf(node, context) {
    if (Array.isArray(node)) return node.map((child) => renderNode(child, context)).join('');
    return renderNode(node, context);
}

function resolutionFor(context, type, id) {
    const resolver = context[`resolve${type}`];
    if (typeof resolver !== 'function') return null;
    try {
        const value = resolver(id);
        if (typeof value === 'string') return { name: value };
        if (value && typeof value === 'object') return value;
    }
    catch {
        // A stale cache or resolver must not make website publishing fail.
    }
    return null;
}

function resolvedName(value, fallback, prefix = '') {
    const name = value?.name ?? value?.displayName ?? value?.globalName ?? value?.username;
    return prefix + String(name || fallback).replace(/^[@#]/u, '');
}

function resolvedUrl(value) {
    return safeHttpUrl(value?.url);
}

function linkedText(url, text, className) {
    if (!url) return `<span class="${className}">${text}</span>`;
    return `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
}

function renderLink(node, content) {
    const target = safeHttpUrl(node.target);
    const fallback = content || escapeHtml(node.target);
    return target
        ? `<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer nofollow">${fallback}</a>`
        : fallback;
}

function renderMention(node, context, kind) {
    const id = safeDiscordId(node.id);
    if (!id) return escapeHtml(`<${kind}:${node.id ?? ''}>`);
    const resolution = resolutionFor(context, kind[0].toUpperCase() + kind.slice(1), id);
    const prefix = kind === 'channel' ? '#' : '@';
    const fallback = `${kind}:${id}`;
    const name = escapeHtml(resolvedName(resolution, fallback, prefix));
    const automaticChannelUrl = kind === 'channel' && safeDiscordId(context.guildId)
        ? `https://discord.com/channels/${context.guildId}/${id}`
        : null;
    return linkedText(resolvedUrl(resolution) ?? automaticChannelUrl, name, `discord-mention discord-${kind}`);
}

function formatTimestamp(timestamp, format) {
    let milliseconds;
    try {
        const seconds = BigInt(String(timestamp));
        milliseconds = Number(seconds * 1000n);
    }
    catch {
        return null;
    }
    if (!Number.isSafeInteger(milliseconds)) return null;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return null;
    const options = { timeZone: 'UTC' };
    const shortDate = new Intl.DateTimeFormat('en-CA', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const longDate = new Intl.DateTimeFormat('en-GB', { ...options, day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    const weekdayDate = new Intl.DateTimeFormat('en-GB', { ...options, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    const shortTime = new Intl.DateTimeFormat('en-GB', { ...options, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    const fullTime = new Intl.DateTimeFormat('en-GB', { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
    const style = format || 'f';
    const text = ({
        t: `${shortTime} UTC`,
        T: `${fullTime} UTC`,
        d: shortDate,
        D: longDate,
        f: `${longDate} ${shortTime} UTC`,
        F: `${weekdayDate} ${shortTime} UTC`,
        s: `${shortDate} ${shortTime} UTC`,
        S: `${shortDate} ${fullTime} UTC`,
        R: `${longDate} ${shortTime} UTC`,
    })[style] ?? `${longDate} ${shortTime} UTC`;
    return { datetime: date.toISOString(), style, text };
}

function renderTimestamp(node) {
    const formatted = formatTimestamp(node.timestamp, node.format);
    if (!formatted) return escapeHtml(`<t:${node.timestamp ?? ''}${node.format ? `:${node.format}` : ''}>`);
    return `<time class="discord-timestamp" datetime="${formatted.datetime}" data-discord-timestamp-format="${formatted.style}">${escapeHtml(formatted.text)}</time>`;
}

function renderEmoji(node) {
    const id = safeDiscordId(node.id);
    const name = String(node.name ?? 'emoji').slice(0, 64);
    if (!id) return escapeHtml(`:${name}:`);
    const extension = node.animated ? 'gif' : 'webp';
    const source = `https://cdn.discordapp.com/emojis/${id}.${extension}?size=64&amp;quality=lossless`;
    return `<img class="discord-emoji" src="${source}" alt=":${escapeHtml(name)}:" title=":${escapeHtml(name)}:" width="20" height="20" loading="lazy">`;
}

function renderCodeBlock(node) {
    const language = String(node.lang ?? '').replace(/[^a-z0-9_+.#-]/giu, '').slice(0, 64);
    const className = language ? ` class="language-${escapeHtml(language)}"` : '';
    return `<pre><code${className}>${escapeHtml(node.content)}</code></pre>`;
}

function renderNode(node, context) {
    if (!node || typeof node !== 'object') return escapeHtml(node);
    switch (node.type) {
    case 'text': return escapeHtml(node.content);
    case 'br': return '<br>\n';
    case 'strong': return `<strong>${contentOf(node.content, context)}</strong>`;
    case 'em': return `<em>${contentOf(node.content, context)}</em>`;
    case 'underline': return `<u>${contentOf(node.content, context)}</u>`;
    case 'strikethrough': return `<del>${contentOf(node.content, context)}</del>`;
    case 'inlineCode': return `<code>${escapeHtml(node.content)}</code>`;
    case 'codeBlock': return renderCodeBlock(node);
    case 'heading': {
        const level = Math.min(3, Math.max(1, Number(node.level) || 1));
        return `<h${level}>${contentOf(node.content, context)}</h${level}>`;
    }
    case 'subtext': return `<p class="discord-subtext"><small>${contentOf(node.content, context)}</small></p>`;
    case 'blockQuote': return `<blockquote>${contentOf(node.content, context)}</blockquote>`;
    case 'spoiler': return `<span class="discord-spoiler" role="note" aria-label="Spoiler">${contentOf(node.content, context)}</span>`;
    case 'link':
    case 'autolink':
    case 'url': {
        const content = contentOf(node.content, context) || escapeHtml(node.target);
        return renderLink(node, content);
    }
    case 'user': return renderMention(node, context, 'user');
    case 'role': return renderMention(node, context, 'role');
    case 'channel': return renderMention(node, context, 'channel');
    case 'everyone': return '<span class="discord-mention discord-everyone">@everyone</span>';
    case 'here': return '<span class="discord-mention discord-here">@here</span>';
    case 'emoji': return renderEmoji(node);
    case 'twemoji': return escapeHtml(node.name);
    case 'timestamp': return renderTimestamp(node);
    case 'slashCommand': {
        const label = escapeHtml(`/${node.fullName || node.name || 'command'}`);
        const resolution = resolutionFor(context, 'SlashCommand', safeDiscordId(node.id) ?? '');
        return linkedText(resolvedUrl(resolution), `<code>${label}</code>`, 'discord-slash-command');
    }
    case 'guildNavigation': {
        const resolution = resolutionFor(context, 'GuildNavigation', safeDiscordId(node.id) ?? '');
        const navigation = escapeHtml(String(resolution?.name ?? node.navigation ?? 'settings'));
        return linkedText(resolvedUrl(resolution), `Guild settings: ${navigation}`, 'discord-guild-navigation');
    }
    default:
        if (Array.isArray(node.content)) return contentOf(node.content, context);
        if (node.content != null) return escapeHtml(node.content);
        return escapeHtml(node.raw ?? node.name ?? (node.type ? `[${node.type}]` : ''));
    }
}

function renderInline(text, context) {
    let ast;
    try {
        // Extended mode includes standard [label](https://example.com) links.
        ast = parseDiscordMarkdown(text, { inline: true });
    }
    catch {
        return escapeHtml(text);
    }
    return contentOf(ast, context);
}

function wrapInlineSegment(node, html) {
    switch (node.type) {
    case 'strong': return `<strong>${html}</strong>`;
    case 'em': return `<em>${html}</em>`;
    case 'underline': return `<u>${html}</u>`;
    case 'strikethrough': return `<del>${html}</del>`;
    case 'spoiler': return `<span class="discord-spoiler" role="note" aria-label="Spoiler">${html}</span>`;
    case 'link':
    case 'autolink':
    case 'url': return renderLink(node, html);
    default: return html;
    }
}

function splitCodeBlocks(node, context) {
    if (Array.isArray(node)) return node.flatMap((child) => splitCodeBlocks(child, context));
    if (node?.type === 'codeBlock') return [{ block: true, html: renderCodeBlock(node) }];
    if (!node || !Array.isArray(node.content)) return [{ block: false, html: renderNode(node, context) }];
    const children = splitCodeBlocks(node.content, context);
    if (!children.some((segment) => segment.block)) return [{ block: false, html: renderNode(node, context) }];
    return children.map((segment) => segment.block
        ? segment
        : { block: false, html: wrapInlineSegment(node, segment.html) });
}

function parsedCodeBlockSegments(text, context) {
    if (!text.includes('```')) return null;
    try {
        const segments = splitCodeBlocks(parseDiscordMarkdown(text, { inline: true }), context);
        if (!segments.some((segment) => segment.block)) return null;
        const merged = [];
        for (const segment of segments) {
            const previous = merged.at(-1);
            if (previous && !previous.block && !segment.block) previous.html += segment.html;
            else merged.push({ ...segment });
        }
        return merged;
    }
    catch {
        return null;
    }
}

function codeBlockSegments(text, context) {
    const segments = parsedCodeBlockSegments(text, context);
    return segments?.map((segment) => segment.block ? segment.html : `<p>${segment.html}</p>`) ?? null;
}

function hasCodeBlock(text) {
    return parsedCodeBlockSegments(text, {}) !== null;
}

function isStructuralLine(line) {
    return FENCE.test(line) || HEADING.test(line) || SUBTEXT.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) || line.startsWith('>>>') || hasCodeBlock(line);
}

function renderList(lines, start, baseIndent, ordered, context) {
    const items = [];
    let index = start;
    while (index < lines.length) {
        const match = LIST_ITEM.exec(lines[index]);
        if (!match || match[1].length !== baseIndent || (/^\d/u.test(match[2]) !== ordered)) break;
        const itemSegments = parsedCodeBlockSegments(match[3], context);
        let item = itemSegments?.map((segment) => segment.html).join('') ?? renderInline(match[3], context);
        index += 1;
        while (index < lines.length) {
            const nested = LIST_ITEM.exec(lines[index]);
            if (nested && nested[1].length > baseIndent) {
                const rendered = renderList(lines, index, nested[1].length, /^\d/u.test(nested[2]), context);
                item += rendered.html;
                index = rendered.index;
                continue;
            }
            if (lines[index].trim() === '') {
                if (index + 1 < lines.length && /^\s+/u.test(lines[index + 1])) {
                    item += '<br>\n';
                    index += 1;
                    continue;
                }
                break;
            }
            if (/^\s+/u.test(lines[index]) && !LIST_ITEM.test(lines[index])) {
                item += `<br>\n${renderInline(lines[index].trim(), context)}`;
                index += 1;
                continue;
            }
            break;
        }
        items.push(`<li>${item}</li>`);
    }
    const tag = ordered ? 'ol' : 'ul';
    return { html: `<${tag}>${items.join('')}</${tag}>`, index };
}

function renderBlocks(lines, context) {
    const output = [];
    for (let index = 0; index < lines.length;) {
        const line = lines[index];
        if (line.trim() === '') {
            index += 1;
            continue;
        }
        const fence = FENCE.exec(line);
        if (fence) {
            const closing = lines.slice(index + 1).findIndex((candidate) => /^```\s*$/u.test(candidate));
            if (closing !== -1) {
                const content = lines.slice(index + 1, index + closing + 1).join('\n');
                const language = String(fence[1] ?? '').replace(/[^a-z0-9_+.#-]/giu, '').slice(0, 64);
                const className = language ? ` class="language-${escapeHtml(language)}"` : '';
                output.push(`<pre><code${className}>${escapeHtml(content)}</code></pre>`);
                index += closing + 2;
                continue;
            }
        }
        const heading = HEADING.exec(line);
        if (heading) {
            const level = heading[1].length;
            const segments = parsedCodeBlockSegments(heading[2], context);
            output.push(...(segments?.map((segment) => segment.block ? segment.html : `<h${level}>${segment.html}</h${level}>`)
                ?? [`<h${level}>${renderInline(heading[2], context)}</h${level}>`]));
            index += 1;
            continue;
        }
        const subtext = SUBTEXT.exec(line);
        if (subtext) {
            const segments = parsedCodeBlockSegments(subtext[1], context);
            output.push(...(segments?.map((segment) => segment.block
                ? segment.html
                : `<p class="discord-subtext"><small>${segment.html}</small></p>`)
                ?? [`<p class="discord-subtext"><small>${renderInline(subtext[1], context)}</small></p>`]));
            index += 1;
            continue;
        }
        if (line.startsWith('>>>')) {
            const first = line.replace(/^\s*>>>\s?/u, '');
            output.push(`<blockquote>${renderBlocks([first, ...lines.slice(index + 1)], context)}</blockquote>`);
            break;
        }
        if (QUOTE.test(line)) {
            const quoted = [];
            while (index < lines.length) {
                const quote = QUOTE.exec(lines[index]);
                if (!quote) break;
                quoted.push(quote[1]);
                index += 1;
            }
            output.push(`<blockquote>${renderBlocks(quoted, context)}</blockquote>`);
            continue;
        }
        const list = LIST_ITEM.exec(line);
        if (list) {
            const rendered = renderList(lines, index, list[1].length, /^\d/u.test(list[2]), context);
            output.push(rendered.html);
            index = rendered.index;
            continue;
        }
        const inlineFence = codeBlockSegments(line, context);
        if (inlineFence !== null) {
            output.push(...inlineFence);
            index += 1;
            continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim() !== '' && !isStructuralLine(lines[index])) {
            paragraph.push(renderInline(lines[index], context));
            index += 1;
        }
        // The current line can only be structural when a malformed fence was
        // encountered. Render it as text so the loop always makes progress.
        if (!paragraph.length) {
            paragraph.push(renderInline(lines[index], context));
            index += 1;
        }
        output.push(`<p>${paragraph.join('<br>\n')}</p>`);
    }
    return output.join('\n');
}

/**
 * Render a Discord event description into semantic, inert HTML.
 * Resolver callbacks are synchronous and optional: resolveUser, resolveRole,
 * resolveChannel, resolveSlashCommand, and resolveGuildNavigation.
 */
function renderDiscordMarkdown(input, options = {}) {
    const inputLimit = Number.isSafeInteger(options.maxInputLength) ? Math.max(1, options.maxInputLength) : DEFAULT_MAX_INPUT_LENGTH;
    const outputLimit = Number.isSafeInteger(options.maxOutputLength) ? Math.max(256, options.maxOutputLength) : DEFAULT_MAX_OUTPUT_LENGTH;
    const bounded = trimToLimit(input, inputLimit);
    const html = renderBlocks(bounded.text.split('\n'), options);
    if (html.length <= outputLimit) return html;
    // Returning escaped source remains valid HTML and avoids cutting a tag in half.
    return `<p>${escapeHtmlToLimit(bounded.text, outputLimit - 7)}</p>`;
}

module.exports = {
    DEFAULT_MAX_INPUT_LENGTH,
    DEFAULT_MAX_OUTPUT_LENGTH,
    escapeHtml,
    renderDiscordMarkdown,
    safeHttpUrl,
};
