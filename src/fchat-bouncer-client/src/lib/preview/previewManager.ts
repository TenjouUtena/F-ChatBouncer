/**
 * URL Preview Manager
 * Manages different types of URL previews and coordinates between previewers
 */

import { URLPreviewer, PreviewResult, PreviewOptions, PreviewType } from './types';

export class PreviewManager {
  private previewers: URLPreviewer[] = [];

  /**
   * Register a new previewer
   */
  registerPreviewer(previewer: URLPreviewer): void {
    this.previewers.push(previewer);
  }

  /**
   * Get preview for a URL
   */
  getPreview(url: string, displayText: string, options?: PreviewOptions): PreviewResult {
    // Find the first previewer that can handle this URL
    const previewer = this.previewers.find(p => p.canHandle(url));
    
    if (!previewer) {
      return {
        html: this.generateGenericLink(url, displayText),
        type: 'generic',
        success: true
      };
    }

    try {
      return previewer.generatePreview(url, displayText, options);
    } catch (error) {
      return {
        html: this.generateGenericLink(url, displayText),
        type: 'generic',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate a generic link when no specific previewer is available
   */
  private generateGenericLink(url: string, displayText: string): string {
    // Don't escape HTML here since it will be rendered via dangerouslySetInnerHTML
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">${displayText}</a>`;
  }

  /**
   * Get all registered previewer types
   */
  getAvailableTypes(): PreviewType[] {
    return this.previewers.map(p => p.getType());
  }
}

// Export singleton instance
export const previewManager = new PreviewManager();
