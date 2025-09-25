/**
 * Enhanced BBCode parser with support for complex tags
 */

import { BBCodeMatch, BBCodeParseResult, BBCodeAttributes } from './types';
import { tagRegistry } from './tags';
import * as he from 'he';

/**
 * Parse attributes from a BBCode tag
 * Examples:
 * - [url=https://example.com] -> { url: 'https://example.com' }
 * - [color=#ff0000] -> { color: '#ff0000' }
 * - [size=12px] -> { size: '12px' }
 */
function parseAttributes(attributeString: string): BBCodeAttributes {
  const attributes: BBCodeAttributes = {};

  if (!attributeString) return attributes;

  // Handle simple attribute format: [tag=value]
  const simpleMatch = attributeString.match(/^=(.+)$/);
  if (simpleMatch) {
    // For simple attributes, we need to determine the correct attribute name
    // This will be handled by the caller based on the tag name
    attributes.value = simpleMatch[1].trim();
    return attributes;
  }

  // Handle complex attribute format: [tag key1=value1 key2=value2]
  const complexRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match;

  while ((match = complexRegex.exec(attributeString)) !== null) {
    const key = match[1];
    const value = match[2] || match[3] || match[4];
    attributes[key] = value;
  }

  return attributes;
}

/**
 * Find all BBCode tags in the content with proper nested tag support
 */
function findBBCodeMatches(content: string): BBCodeMatch[] {
  const matches: BBCodeMatch[] = [];
  const tagNames = tagRegistry.getTagNames().join('|');

  // Simple approach: find all tags and match them properly
  const allTags: Array<{index: number, type: 'open' | 'close', tagName: string, attributeString?: string, fullMatch: string}> = [];
  
  // Sort tag names by length (longest first) to avoid partial matches
  const sortedTagNames = tagRegistry.getTagNames().sort((a, b) => b.length - a.length).join('|');
  
  // Find all opening tags (including self-closing)
  const openingRegex = new RegExp(`\\[(${sortedTagNames})([^\\]]*)?\\]`, 'gi');
  let match;
  while ((match = openingRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const tag = tagRegistry.getTag(tagName);
    
    if (tag && tag.selfClosing) {
      // Handle self-closing tags like [hr]
      const attributes = parseAttributes(match[2] || '');
      matches.push({
        fullMatch: match[0],
        tagName: tagName,
        content: '',
        attributes,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        openingTagLength: match[0].length,
      });
    } else {
      // Regular opening tag
      allTags.push({
        index: match.index,
        type: 'open',
        tagName: tagName,
        attributeString: match[2] || '',
        fullMatch: match[0]
      });
    }
  }
  
  // Find all closing tags
  const closingRegex = new RegExp(`\\[\\/(${sortedTagNames})\\]`, 'gi');
  while ((match = closingRegex.exec(content)) !== null) {
    allTags.push({
      index: match.index,
      type: 'close',
      tagName: match[1].toLowerCase(),
      fullMatch: match[0]
    });
  }
  
  // Sort by index
  allTags.sort((a, b) => a.index - b.index);
  
  // Match opening and closing tags using a stack
  const stack: Array<typeof allTags[0]> = [];
  
  for (const tag of allTags) {
    if (tag.type === 'open') {
      stack.push(tag);
    } else if (tag.type === 'close') {
      // Find the matching opening tag
      let matchingOpenIndex = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName === tag.tagName) {
          matchingOpenIndex = i;
          break;
        }
      }
      
      if (matchingOpenIndex !== -1) {
        const openingTag = stack[matchingOpenIndex];
        
        // Extract content between tags
        const tagContent = content.substring(
          openingTag.index + openingTag.fullMatch.length,
          tag.index
        );
        
        // Parse attributes
        const attributes = parseAttributes(openingTag.attributeString || '');
        
        // For simple attributes like [tag=value], set the primary attribute
        if (openingTag.attributeString && openingTag.attributeString.startsWith('=')) {
          const tagObj = tagRegistry.getTag(openingTag.tagName);
          if (tagObj && tagObj.hasAttributes) {
            // Set the attribute using the tag name as the key
            const attributeValue = openingTag.attributeString.substring(1);
            attributes[tagObj.name] = attributeValue;
          }
        }
        
        // Add the match
        matches.push({
          fullMatch: content.substring(openingTag.index, tag.index + tag.fullMatch.length),
          tagName: openingTag.tagName,
          content: tagContent,
          attributes,
          startIndex: openingTag.index,
          endIndex: tag.index + tag.fullMatch.length,
          openingTagLength: openingTag.fullMatch.length,
        });
        
        // Remove the matched opening tag from stack
        stack.splice(matchingOpenIndex, 1);
      }
    }
  }
  
  return matches;
}

/**
 * Parse BBCode content to HTML
 */
export function parseBBCodeToHtml(content: string): BBCodeParseResult {
  const errors: string[] = [];
  let result = content;

  try {
    // Find all BBCode matches
    const matches = findBBCodeMatches(result);

  // Sort matches to process inner tags first (by start index descending)
  // This ensures nested tags are processed before their containing tags
  matches.sort((a, b) => b.startIndex - a.startIndex);

  // Process each match from innermost to outermost
  for (const match of matches) {
      // Skip invalid matches (those that overlap with already processed matches)
      if ((match as any).invalid) {
        continue;
      }
      const tag = tagRegistry.getTag(match.tagName);

      if (!tag) {
        errors.push(`Unknown BBCode tag: ${match.tagName}`);
        continue;
      }

      // Validate the tag if validation is available
      if (tag.validate && !tag.validate(match.content, match.attributes)) {
        errors.push(`Invalid content or attributes for tag: ${match.tagName}`);
        // Leave the original BBCode in place for invalid tags
        continue;
      }

      try {
        // Parse the tag to HTML
        const html = tag.parse(match.content, match.attributes);

        // Replace the BBCode with HTML
        const before = result.substring(0, match.startIndex);
        const after = result.substring(match.endIndex);
        result = before + html + after;
        
        // Update the indices of remaining matches
        const offset = html.length - (match.endIndex - match.startIndex);
        
        for (let i = 0; i < matches.length; i++) {
          const otherMatch = matches[i];
          
          // Skip the current match
          if (otherMatch === match) continue;
          
          // If the other match starts after the processed match ends, shift both indices
          if (otherMatch.startIndex >= match.endIndex) {
            otherMatch.startIndex += offset;
            otherMatch.endIndex += offset;
          }
          // If the other match contains the processed match, only shift the end index
          else if (otherMatch.startIndex < match.startIndex && otherMatch.endIndex > match.endIndex) {
            otherMatch.endIndex += offset;
            // Update the content to reflect the processed inner tags
            const openingTagLength = otherMatch.openingTagLength || (otherMatch.tagName.length + 2); // Use stored length or fallback
            const closingTagLength = otherMatch.tagName.length + 3; // [/tag]
            otherMatch.content = result.substring(
              otherMatch.startIndex + openingTagLength,
              otherMatch.endIndex - closingTagLength
            );
          }
          // If the other match is contained within the processed match, it's invalid - skip it
          else if (otherMatch.startIndex >= match.startIndex && otherMatch.endIndex <= match.endIndex) {
            // Mark the match as invalid by setting a flag
            (otherMatch as any).invalid = true;
          }
        }
      } catch (error) {
        errors.push(`Error parsing tag ${match.tagName}: ${error}`);
      }
    }

    // Convert line breaks to <br> tags, but preserve HTML structure
    // Only convert newlines that are in plain text content, not between HTML tags
    let inHtmlTag = false;
    let htmlResult = '';
    let lastChar = '';
    
    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      
      if (char === '<') {
        inHtmlTag = true;
        htmlResult += char;
      } else if (char === '>') {
        inHtmlTag = false;
        htmlResult += char;
      } else if (char === '\n' && !inHtmlTag) {
        // Only convert newlines to <br> if they're not immediately after HTML tags
        // This prevents breaking HTML structure while still converting plain text newlines
        if (lastChar !== '>' && lastChar !== '\n') {
          htmlResult += '<br>';
        }
      } else {
        htmlResult += char;
      }
      
      lastChar = char;
    }
    
    result = htmlResult;


    return {
      html: result,
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      html: he.encode(content), // Fallback to escaped content
      success: false,
      errors: [`Parse error: ${error}`],
    };
  }
}

/**
 * Convert HTML back to BBCode (for editor compatibility)
 * This is a simplified version for basic tags
 */
export function parseHtmlToBBCode(html: string): string {
  let bbcode = html;

  // Convert basic HTML tags back to BBCode
  bbcode = bbcode.replace(/<strong>(.*?)<\/strong>/gi, '[b]$1[/b]');
  bbcode = bbcode.replace(/<b>(.*?)<\/b>/gi, '[b]$1[/b]');
  bbcode = bbcode.replace(/<em>(.*?)<\/em>/gi, '[i]$1[/i]');
  bbcode = bbcode.replace(/<i>(.*?)<\/i>/gi, '[i]$1[/i]');
  bbcode = bbcode.replace(/<u>(.*?)<\/u>/gi, '[u]$1[/u]');
  bbcode = bbcode.replace(/<del>(.*?)<\/del>/gi, '[s]$1[/s]');
  bbcode = bbcode.replace(/<sub>(.*?)<\/sub>/gi, '[sub]$1[/sub]');
  bbcode = bbcode.replace(/<sup>(.*?)<\/sup>/gi, '[sup]$1[/sup]');
  
  // Convert color spans
  bbcode = bbcode.replace(/<span[^>]*style="[^"]*color:\s*([^;"]+)[^"]*"[^>]*>(.*?)<\/span>/gi, '[color=$1]$2[/color]');
  
  // Convert size spans
  bbcode = bbcode.replace(/<span[^>]*style="[^"]*font-size:\s*1\.2em[^"]*"[^>]*>(.*?)<\/span>/gi, '[big]$1[/big]');
  bbcode = bbcode.replace(/<span[^>]*style="[^"]*font-size:\s*0\.8em[^"]*"[^>]*>(.*?)<\/span>/gi, '[small]$1[/small]');

  // Convert links back to BBCode
  bbcode = bbcode.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (match, href, text) => {
    if (href === text) {
      return `[url]${href}[/url]`;
    } else {
      return `[url=${href}]${text}[/url]`;
    }
  });

  // Convert line breaks
  bbcode = bbcode.replace(/<br\s*\/?>/gi, '\n');

  // Remove paragraph tags
  bbcode = bbcode.replace(/<\/?p[^>]*>/gi, '');

  // Decode HTML entities
  bbcode = he.decode(bbcode);

  return bbcode.trim();
}