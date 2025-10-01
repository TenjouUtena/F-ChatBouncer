/**
 * URL Previewers
 * Individual previewers for different types of URLs
 */

import { URLPreviewer, PreviewResult, PreviewOptions, PreviewType } from './types';

/**
 * Image URL Previewer
 * Handles image URLs and creates image previews
 */
export class ImagePreviewer implements URLPreviewer {
  private imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return this.imageExtensions.some(ext => urlLower.endsWith(ext));
  }

  generatePreview(url: string, displayText: string, options?: PreviewOptions): PreviewResult {
    // Don't escape HTML here since it will be rendered via dangerouslySetInnerHTML
    const safeUrl = url;
    const safeDisplayText = displayText;
    
    const maxWidth = options?.maxWidth || 'max-w-md';
    const maxHeight = options?.maxHeight || 'max-h-64';
    const className = options?.className || '';
    const showLink = options?.showLink !== false;

    const html = `
      <span class="url-image-container relative inline">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" 
      class="text-blue-400 hover:text-blue-300 underline cursor-pointer" 
      onmouseenter="this.nextElementSibling.style.opacity='1'" onmouseleave="this.nextElementSibling.style.opacity='0'" > 
      ${safeDisplayText} </a> <div class="image-preview-tooltip absolute z-50 bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-2 min-w-4 ${maxWidth}" style="top: 100%; left: 0; margin-top: 4px; opacity: 0; transition: opacity 0.2s; pointer-events: none;" > 
      <img src="${safeUrl}" alt="${safeDisplayText}" class="max-w-full ${maxHeight} rounded-lg ${className}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" /> <div class="hidden text-red-400 text-sm italic">Failed to load image</div> 
      </div> </span> `.replace(/\r\n|\r|\n/g, "");

    return {
      html: html.trim(),
      type: 'image',
      success: true
    };
  }

  getType(): PreviewType {
    return 'image';
  }
}

/**
 * Discord URL Previewer
 * Handles Discord message/channel URLs
 */
export class DiscordPreviewer implements URLPreviewer {
  private discordPatterns = [
    /^https?:\/\/(?:www\.)?discord\.com\/channels\/\d+\/\d+/,
    /^https?:\/\/(?:www\.)?discord\.gg\/[a-zA-Z0-9]+/,
    /^https?:\/\/(?:www\.)?discordapp\.com\/channels\/\d+\/\d+/
  ];

  canHandle(url: string): boolean {
    return this.discordPatterns.some(pattern => pattern.test(url));
  }

  generatePreview(url: string, displayText: string, options?: PreviewOptions): PreviewResult {
    // Don't escape HTML here since it will be rendered via dangerouslySetInnerHTML
    const safeUrl = url;
    const safeDisplayText = displayText;

    const html = `
      <div class="discord-preview-container my-2 p-3 bg-gray-800 rounded-lg border border-gray-600">
        <div class="flex items-center mb-2">
          <div class="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center mr-2">
            <span class="text-white text-xs font-bold">D</span>
          </div>
          <span class="text-sm font-medium text-gray-300">Discord</span>
        </div>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">
          ${safeDisplayText}
        </a>
      </div>
    `.replace(/\r\n|\r|\n/g, "");



    return {
      html: html.trim(),
      type: 'discord',
      success: true
    };
  }

  getType(): PreviewType {
    return 'discord';
  }
}

/**
 * F-List URL Previewer
 * Handles F-List character/profile URLs
 */
export class FListPreviewer implements URLPreviewer {
  private flistPatterns = [
    /^https?:\/\/(?:www\.)?f-list\.net\/c\/[a-zA-Z0-9_-]+/,
    /^https?:\/\/(?:www\.)?f-list\.net\/view\/[a-zA-Z0-9_-]+/
  ];

  canHandle(url: string): boolean {
    return this.flistPatterns.some(pattern => pattern.test(url));
  }

  generatePreview(url: string, displayText: string, options?: PreviewOptions): PreviewResult {
    // Don't escape HTML here since it will be rendered via dangerouslySetInnerHTML
    const safeUrl = url;
    const safeDisplayText = displayText;

    const html = `
      <div class="flist-preview-container my-2 p-3 bg-purple-900/20 rounded-lg border border-purple-600/30">
        <div class="flex items-center mb-2">
          <div class="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center mr-2">
            <span class="text-white text-xs font-bold">F</span>
          </div>
          <span class="text-sm font-medium text-purple-300">F-List</span>
        </div>
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-purple-400 hover:text-purple-300 underline">
          ${safeDisplayText}
        </a>
      </div>
    `.replace(/\r\n|\r|\n/g, "");

    return {
      html: html.trim(),
      type: 'flist',
      success: true
    };
  }

  getType(): PreviewType {
    return 'flist';
  }
}

// Export all previewers
export const imagePreviewer = new ImagePreviewer();
export const discordPreviewer = new DiscordPreviewer();
export const flistPreviewer = new FListPreviewer();
