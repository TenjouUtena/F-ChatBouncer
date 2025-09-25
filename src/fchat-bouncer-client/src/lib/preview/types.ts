/**
 * Types for the URL Preview System
 */

export interface PreviewResult {
  html: string;
  type: PreviewType;
  success: boolean;
  error?: string;
}

export type PreviewType = 'image' | 'discord' | 'flist' | 'generic' | 'none';

export interface PreviewOptions {
  maxWidth?: string;
  maxHeight?: string;
  showLink?: boolean;
  className?: string;
}

export interface URLPreviewer {
  /**
   * Check if this previewer can handle the given URL
   */
  canHandle(url: string): boolean;
  
  /**
   * Generate preview HTML for the given URL
   */
  generatePreview(url: string, displayText: string, options?: PreviewOptions): PreviewResult;
  
  /**
   * Get the preview type this previewer handles
   */
  getType(): PreviewType;
}
