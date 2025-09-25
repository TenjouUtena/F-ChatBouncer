/**
 * Utility functions for converting between HTML and BBCode for F-Chat
 * Enhanced with support for advanced BBCode tags and AST system
 */

import * as he from 'he';
import { parseBBCodeToHtml, parseHtmlToBBCode } from './bbcode/parser';
import { bbcodeToAST, astToBBCode, astToTipTapJSON, tipTapJSONToAST } from './bbcode/ast';

export interface BBCodeMapping {
  htmlTag: string;
  bbcodeTag: string;
  attributes?: Record<string, string>;
}

// Legacy F-Chat BBCode mappings (for fallback/simple editor)
export const BBCODE_MAPPINGS: BBCodeMapping[] = [
  { htmlTag: 'strong', bbcodeTag: 'b' },
  { htmlTag: 'b', bbcodeTag: 'b' },
  { htmlTag: 'em', bbcodeTag: 'i' },
  { htmlTag: 'i', bbcodeTag: 'i' },
  { htmlTag: 'u', bbcodeTag: 'u' },
];

/**
 * Convert HTML content from Tiptap editor to F-Chat BBCode format
 * Enhanced to support advanced BBCode tags using AST system
 */
export function htmlToBBCode(html: string): string {
  // Use the enhanced parser for HTML to BBCode conversion
  return parseHtmlToBBCode(html);
}

/**
 * Convert F-Chat BBCode to HTML for display
 * Enhanced to support advanced BBCode tags like URLs
 */
export function bbcodeToHtml(bbcode: string): string {
  const result = parseBBCodeToHtml(bbcode);

  if (!result.success && result.errors) {
    //console.log('BBCode parsing errors:', result.errors);
    // THis is just spammy, dont need to log it
  }

  return result.html;
}

/**
 * Convert BBCode to TipTap JSON document using AST
 */
export function bbcodeToTipTapJSON(bbcode: string): any {
  const ast = bbcodeToAST(bbcode);
  return astToTipTapJSON(ast);
}

/**
 * Convert TipTap JSON document to BBCode using AST
 */
export function tipTapJSONToBBCode(tiptapDoc: any): string {
  const ast = tipTapJSONToAST(tiptapDoc);
  return astToBBCode(ast);
}

/**
 * Legacy function for simple BBCode conversion (fallback)
 */
export function simpleBBCodeToHtml(bbcode: string): string {
  let html = bbcode;

  // Convert each BBCode tag to HTML
  BBCODE_MAPPINGS.forEach(({ htmlTag, bbcodeTag }) => {
    // Replace opening tags
    const openRegex = new RegExp(`\\[${bbcodeTag}\\]`, 'gi');
    html = html.replace(openRegex, `<${htmlTag}>`);

    // Replace closing tags
    const closeRegex = new RegExp(`\\[/${bbcodeTag}\\]`, 'gi');
    html = html.replace(closeRegex, `</${htmlTag}>`);
  });

  // Convert line breaks to br tags
  html = html.replace(/\n/g, '<br>');

  // Encode HTML entities for safety using proper library
  html = he.encode(html, {
    useNamedReferences: true,
    allowUnsafeSymbols: false
  });

  return html;
}

/**
 * Get plain text content without any formatting
 */
export function getPlainText(html: string): string {
  // Remove all HTML tags first
  const textWithoutTags = html.replace(/<[^>]*>/g, '');

  // Decode HTML entities using proper library
  return he.decode(textWithoutTags).trim();
}

/**
 * Validate if content contains valid F-Chat BBCode
 * Enhanced to support all registered BBCode tags
 */
export function isValidBBCode(content: string): boolean {
  try {
    const result = parseBBCodeToHtml(content);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Legacy validation function for basic tags only
 */
export function isValidBasicBBCode(content: string): boolean {
  const supportedTags = ['b', 'i', 'u'];
  const tagRegex = /\[(\/?)(b|i|u)\]/gi;
  const matches = content.match(tagRegex);

  if (!matches) return true; // No BBCode tags is valid

  const tagStack: string[] = [];

  for (const match of matches) {
    const [, isClosing, tag] = match.match(/\[(\/?)(b|i|u)\]/i) || [];

    if (isClosing) {
      // Closing tag
      if (tagStack.length === 0 || tagStack.pop() !== tag.toLowerCase()) {
        return false; // Mismatched closing tag
      }
    } else {
      // Opening tag
      if (supportedTags.includes(tag.toLowerCase())) {
        tagStack.push(tag.toLowerCase());
      } else {
        return false; // Unsupported tag
      }
    }
  }

  return tagStack.length === 0; // All tags should be closed
}