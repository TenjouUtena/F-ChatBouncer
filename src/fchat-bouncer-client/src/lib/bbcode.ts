/**
 * Utility functions for converting between HTML and BBCode for F-Chat
 * Enhanced with support for advanced BBCode tags and AST system
 */

import * as he from 'he';
import { parseBBCodeToHtml, parseHtmlToBBCode } from './bbcode/parser';
import { bbcodeToAST, astToBBCode, astToTipTapJSON, tipTapJSONToAST } from './bbcode/ast';

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
export function bbcodeToHtml(bbcode: string, context?: { inlines?: Record<string, { hash: string; extension: string; nsfw: boolean }> }): string {
  const result = parseBBCodeToHtml(bbcode, context);

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
