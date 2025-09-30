/**
 * BBCode tag definitions and registry
 */

import { BBCodeTag } from './types';
import * as he from 'he';
import { previewManager } from '../preview/previewManager';
import { imagePreviewer, discordPreviewer, flistPreviewer } from '../preview/previewers';

/**
 * Validate and sanitize a URL
 */
function validateUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize HTML content to prevent XSS
 */
function sanitizeContent(content: string): string {
  return he.encode(content, {
    useNamedReferences: true,
    allowUnsafeSymbols: false
  });
}

/**
 * Basic formatting tags (existing functionality)
 */
export const basicTags: BBCodeTag[] = [
  {
    name: 'b',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<strong>${hasHtmlTags ? content : sanitizeContent(content)}</strong>`;
    },
  },
  {
    name: 'i',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<em>${hasHtmlTags ? content : sanitizeContent(content)}</em>`;
    },
  },
  {
    name: 'u',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<u>${hasHtmlTags ? content : sanitizeContent(content)}</u>`;
    },
  },
  {
    name: 'sub',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<sub>${hasHtmlTags ? content : sanitizeContent(content)}</sub>`;
    },
  },
  {
    name: 'sup',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<sup>${hasHtmlTags ? content : sanitizeContent(content)}</sup>`;
    },
  },
  {
    name: 's',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<del>${hasHtmlTags ? content : sanitizeContent(content)}</del>`;
    },
  },
  {
    name: 'big',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<span style="font-size: 1.2em;">${hasHtmlTags ? content : sanitizeContent(content)}</span>`;
    },
  },
  {
    name: 'small',
    hasAttributes: false,
    hasContent: true,
    selfClosing: false,
    parse: (content: string) => {
      // Check if content contains HTML tags (already processed)
      const hasHtmlTags = /<[^>]+>/.test(content);
      return `<span style="font-size: 0.8em;">${hasHtmlTags ? content : sanitizeContent(content)}</span>`;
    },
  },
];

/**
 * F-List color palette validation
 */
const validColors = [
  'red', 'blue', 'white', 'yellow', 'pink', 'gray', 'green', 
  'orange', 'purple', 'black', 'brown', 'cyan'
];

function isValidColor(color: string): boolean {
  if (!color || typeof color !== 'string') return false;
  
  const normalizedColor = color.toLowerCase().trim();
  
  // Check predefined colors
  if (validColors.includes(normalizedColor)) return true;
  
  // Check hex colors (#fff, #ffffff, #FFF, #FFFFFF)
  if (/^#[0-9a-f]{3,6}$/i.test(normalizedColor)) return true;
  
  // Check rgb/rgba colors (rgb(255,255,255), rgba(255,255,255,0.5))
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/i.test(normalizedColor)) return true;
  
  // Check hsl/hsla colors
  if (/^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+)?\s*\)$/i.test(normalizedColor)) return true;
  
  // Check named CSS colors (more comprehensive list)
  const cssColorNames = [
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'blanchedalmond',
    'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
    'crimson', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkkhaki',
    'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
    'darkseagreen', 'darkslateblue', 'darkslategray', 'darkturquoise', 'darkviolet', 'deeppink',
    'deepskyblue', 'dimgray', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia',
    'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'greenyellow', 'honeydew', 'hotpink',
    'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen',
    'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray',
    'lightgreen', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon',
    'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
    'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
    'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab',
    'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
    'papayawhip', 'peachpuff', 'peru', 'plum', 'powderblue', 'rosybrown', 'royalblue',
    'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver',
    'skyblue', 'slateblue', 'slategray', 'snow', 'springgreen', 'steelblue', 'tan', 'teal',
    'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'whitesmoke', 'yellowgreen'
  ];
  
  if (cssColorNames.includes(normalizedColor)) return true;
  
  // If none of the above patterns match, be permissive and allow it
  // This prevents breaking on valid but unrecognized color formats
  return true;
}

/**
 * Color tag implementation
 */
export const colorTag: BBCodeTag = {
  name: 'color',
  hasAttributes: true,
  hasContent: true,
  selfClosing: false,
  parse: (content: string, attributes?: Record<string, string>) => {
    const color = attributes?.color || '';
    
    if (!isValidColor(color)) {
      // Return original BBCode if color is invalid
      return sanitizeContent(`[color=${color}]${content}[/color]`);
    }
    
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    return `<span style="color: ${color.toLowerCase()};">${hasHtmlTags ? content : sanitizeContent(content)}</span>`;
  },
  validate: (content: string, attributes?: Record<string, string>) => {
    const color = attributes?.color || '';
    return isValidColor(color);
  },
};

/**
 * Spoiler tag implementation with click-to-reveal functionality
 */
export const spoilerTag: BBCodeTag = {
  name: 'spoiler',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Generate unique ID for this spoiler instance
    const spoilerId = `spoiler-${Math.random().toString(36).substr(2, 9)}`;
    
    // Parse the content to handle nested BBCode
    const { parseBBCodeToHtml } = require('./parser');
    const parsedContent = parseBBCodeToHtml(content);
    
    return `
      <div class="spoiler-container" data-spoiler-id="${spoilerId}" style="margin: 4px 0;">
        <button 
          class="spoiler-button" 
          data-spoiler-target="${spoilerId}"
          style="
            background: #444; 
            color: #fff; 
            border: 1px solid #666; 
            padding: 4px 8px; 
            cursor: pointer; 
            border-radius: 3px;
            font-size: 12px;
          "
        >
          Click here for spoiler
        </button>
        <div 
          class="spoiler-content" 
          data-spoiler-content="${spoilerId}"
          style="display: none; margin-top: 4px; padding: 8px; border: 1px solid #ddd; border-radius: 3px;"
        >
          ${parsedContent.html}
        </div>
      </div>
    `;
  },
};

/**
 * Quote tag implementation
 */
export const quoteTag: BBCodeTag = {
  name: 'quote',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    const sanitizedContent = hasHtmlTags ? content : sanitizeContent(content);
    
    return `
      <div style="
        background: #f9f9f9; 
        border-left: 4px solid #ccc; 
        margin: 8px 0; 
        padding: 8px 12px;
        font-style: italic;
      ">
        <div style="font-weight: bold; margin-bottom: 4px; color: #666;">Quote:</div>
        <div>${sanitizedContent}</div>
      </div>
    `;
  },
};

/**
 * User tag implementation for F-List user links
 */
export const userTag: BBCodeTag = {
  name: 'user',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    const username = content.trim();
    
    if (!username) {
      return sanitizeContent(`[user]${content}[/user]`);
    }
    
    // Clean username for security
    const cleanUsername = username.replace(/[^a-zA-Z0-9_\-\s]/g, '');
    
    if (!cleanUsername) {
      return sanitizeContent(`[user]${content}[/user]`);
    }
    
    const encodedUsername = encodeURIComponent(cleanUsername);
    const profileUrl = `https://www.f-list.net/c/${encodedUsername}`;
    
    return `<a href="${profileUrl}" target="_blank" style="color: #0066cc; text-decoration: none;">• ${sanitizeContent(cleanUsername)}</a>`;
  },
  validate: (content: string) => {
    const cleanContent = content.trim();
    return /^[a-zA-Z0-9_\-\s]+$/.test(cleanContent);
  },
};

/**
 * Heading tag implementation
 */
export const headingTag: BBCodeTag = {
  name: 'heading',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    const sanitizedContent = hasHtmlTags ? content : sanitizeContent(content);
    
    return `
      <div style="
        font-size: 1.3em; 
        font-weight: bold; 
        margin: 12px 0 8px 0; 
        line-height: 1.4;
        color: #0066cc;
      ">
        ${sanitizedContent}
      </div>
    `;
  },
};

/**
 * Indent tag implementation
 */
export const indentTag: BBCodeTag = {
  name: 'indent',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    const sanitizedContent = hasHtmlTags ? content : sanitizeContent(content);
    
    return `
      <div style="margin-left: 40px; margin: 8px 0 8px 40px;">
        ${sanitizedContent}
      </div>
    `;
  },
};

/**
 * Justify tag implementation
 */
export const justifyTag: BBCodeTag = {
  name: 'justify',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    const sanitizedContent = hasHtmlTags ? content : sanitizeContent(content);
    
    return `<div style="text-align: justify; margin: 4px 0;">${sanitizedContent}</div>`;
  },
};

/**
 * Horizontal rule tag implementation
 */
export const hrTag: BBCodeTag = {
  name: 'hr',
  hasAttributes: false,
  hasContent: false,
  selfClosing: true,
  parse: () => {
    return '<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;" />';
  },
};

/**
 * Text alignment tags
 */
export const leftAlignTag: BBCodeTag = {
  name: 'left',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    const sanitizedContent = hasHtmlTags ? content : sanitizeContent(content);
    
    return `<div style="text-align: left; margin: 4px 0;">${sanitizedContent}</div>`;
  },
};

export const centerAlignTag: BBCodeTag = {
  name: 'center',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    const sanitizedContent = hasHtmlTags ? content : sanitizeContent(content);
    
    return `<div style="text-align: center; margin: 4px 0;">${sanitizedContent}</div>`;
  },
};

export const rightAlignTag: BBCodeTag = {
  name: 'right',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(content);
    const sanitizedContent = hasHtmlTags ? content : sanitizeContent(content);
    
    return `<div style="text-align: right; margin: 4px 0;">${sanitizedContent}</div>`;
  },
};

/**
 * Icon tag implementation for F-List user avatars
 */
export const iconTag: BBCodeTag = {
  name: 'icon',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    const username = content.trim();
    
    if (!username) {
      return sanitizeContent(`[icon]${content}[/icon]`);
    }
    
    // Clean username for security
    const cleanUsername = username.replace(/[^a-zA-Z0-9_\-\s]/g, '');
    
    if (!cleanUsername) {
      return sanitizeContent(`[icon]${content}[/icon]`);
    }
    
    const encodedUsername = encodeURIComponent(cleanUsername);
    const iconUrl = `https://static.f-list.net/images/avatar/${encodedUsername}.png`;
    const profileUrl = `https://www.f-list.net/c/${encodedUsername}`;
    
    return `
      <a href="${profileUrl}" target="_blank" style="text-decoration: none;">
        <img 
          src="${iconUrl}" 
          alt="${sanitizeContent(cleanUsername)}" 
          style="
            display: inline-block; 
            vertical-align: middle; 
            width: 20px; 
            height: 20px; 
            border-radius: 3px;
            margin: 0 2px;
          " 
          loading="lazy" 
          title="${sanitizeContent(cleanUsername)}"
          onerror="this.src='https://static.f-list.net/images/avatar/default.png'"
        />
      </a>
    `;
  },
  validate: (content: string) => {
    const cleanContent = content.trim();
    return /^[a-zA-Z0-9_\-\s]+$/.test(cleanContent);
  },
};

/**
 * Noparse tag implementation - prevents BBCode parsing
 */
export const noparseTag: BBCodeTag = {
  name: 'noparse',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    // Return the content as-is, HTML-encoded for safety
    return sanitizeContent(content);
  },
};

/**
 * Collapse tag implementation for collapsible content using HTML details/summary
 */
export const collapseTag: BBCodeTag = {
  name: 'collapse',
  hasAttributes: true,
  hasContent: true,
  selfClosing: false,
  parse: (content: string, attributes?: Record<string, string>) => {
    const header = attributes?.value || attributes?.header || 'Click to expand';
    
    // Parse the content to handle nested BBCode
    const { parseBBCodeToHtml } = require('./parser');
    const parsedContent = parseBBCodeToHtml(content);
    
    return `
      <details style="margin: 8px 0; border: 1px solid #4b5563; border-radius: 4px; background: #1f2937;">
        <summary style="
          padding: 8px 12px; 
          cursor: pointer; 
          font-weight: bold; 
          background: #374151; 
          border-radius: 4px 4px 0 0;
          list-style: none;
          display: flex;
          align-items: center;
          color: #f9fafb;
        ">
          <span style="margin-right: 8px; transition: transform 0.2s ease;">▶</span>
          ${sanitizeContent(header)}
        </summary>
        <div style="padding: 12px; border-top: 1px solid #4b5563; color: #f9fafb;">
          ${parsedContent.html}
        </div>
      </details>
    `;
  },
};

// Initialize preview manager with default previewers
previewManager.registerPreviewer(imagePreviewer);
previewManager.registerPreviewer(discordPreviewer);
previewManager.registerPreviewer(flistPreviewer);

/**
 * F-Chat eicon tag implementation
 */
export const eiconTag: BBCodeTag = {
  name: 'eicon',
  hasAttributes: false,
  hasContent: true,
  selfClosing: false,
  parse: (content: string) => {
    const trimmedContent = content.trim();

    // Remove any potential path traversal or dangerous characters for security
    const cleanIconName = trimmedContent.replace(/[^a-zA-Z0-9_\-\s]/g, '');

    if (!cleanIconName) {
      return sanitizeContent(`[eicon]${content}[/eicon]`);
    }

    // URL encode the icon name to handle spaces and special characters
    const encodedIconName = encodeURIComponent(cleanIconName);
    const iconUrl = `https://static.f-list.net/images/eicon/${encodedIconName}.gif`;

    // Use the original clean name for alt and title (not URL encoded)
    const safeDisplayName = sanitizeContent(cleanIconName);

    return `<img src="${iconUrl}" alt="${safeDisplayName}" style="display: inline !important; vertical-align: middle; margin: 0 0px; max-width: none; max-height: none;" loading="lazy" title="${safeDisplayName}" onerror="this.style.display='none'" />`;
  },
  validate: (content: string) => {
    const cleanContent = content.trim();
    // Allow alphanumeric characters, underscores, hyphens, and spaces
    return /^[a-zA-Z0-9_\-\s]+$/.test(cleanContent);
  },
};

/**
 * URL tag implementation with extensible preview support
 */
export const urlTag: BBCodeTag = {
  name: 'url',
  hasAttributes: true,
  hasContent: true,
  selfClosing: false,
  parse: (content: string, attributes?: Record<string, string>) => {
    let url: string;
    let displayText: string;

    if (attributes && attributes.url) {
      // [url=https://example.com]Click here[/url]
      url = attributes.url;
      displayText = content || url;
    } else {
      // [url]https://example.com[/url]
      url = content;
      displayText = content;
    }

    // Check if content contains HTML tags (already processed)
    const hasHtmlTags = /<[^>]+>/.test(displayText);
    if (hasHtmlTags) {
      // Content is already processed HTML, use it as-is
      //console.log('URL tag detected HTML content:', displayText);
    } else {
      // Content is plain text, HTML-encode it for safety
      displayText = sanitizeContent(displayText);
    }

    // Validate the URL
    if (!validateUrl(url)) {
      // Return the original content if URL is invalid
      return sanitizeContent(`[url${attributes?.url ? `=${attributes.url}` : ''}]${content}[/url]`);
    }

    // Use the preview manager to generate appropriate preview
    const previewResult = previewManager.getPreview(url, displayText);
    return previewResult.html;
  },
  validate: (content: string, attributes?: Record<string, string>) => {
    const url = attributes?.url || content;
    return validateUrl(url);
  },
};

/**
 * Registry of all available BBCode tags
 */
export class BBCodeTagRegistry {
  private tags: Map<string, BBCodeTag> = new Map();

  constructor() {
    // Register basic tags
    basicTags.forEach(tag => this.register(tag));

    // Register URL tag
    this.register(urlTag);

    // Register eicon tag
    this.register(eiconTag);

    // Register color tag
    this.register(colorTag);

    // Register spoiler tag
    this.register(spoilerTag);

    // Register quote tag
    this.register(quoteTag);

    // Register user tag
    this.register(userTag);

    // Register layout control tags
    this.register(headingTag);
    this.register(indentTag);
    this.register(justifyTag);
    this.register(hrTag);
    this.register(leftAlignTag);
    this.register(centerAlignTag);
    this.register(rightAlignTag);

    // Register other tags
    this.register(iconTag);
    this.register(noparseTag);
    this.register(collapseTag);
  }

  /**
   * Register a new BBCode tag
   */
  register(tag: BBCodeTag): void {
    this.tags.set(tag.name.toLowerCase(), tag);
  }

  /**
   * Get a tag by name
   */
  getTag(name: string): BBCodeTag | undefined {
    return this.tags.get(name.toLowerCase());
  }

  /**
   * Get all registered tag names
   */
  getTagNames(): string[] {
    return Array.from(this.tags.keys());
  }

  /**
   * Check if a tag is registered
   */
  hasTag(name: string): boolean {
    return this.tags.has(name.toLowerCase());
  }
}

// Export singleton instance
export const tagRegistry = new BBCodeTagRegistry();