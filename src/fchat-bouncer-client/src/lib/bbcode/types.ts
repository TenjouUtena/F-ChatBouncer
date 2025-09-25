/**
 * Types and interfaces for the BBCode parsing system
 */

export interface BBCodeTag {
  /** Tag name (e.g., 'url', 'b', 'i') */
  name: string;
  /** Whether this tag can have attributes (e.g., [url=...]) */
  hasAttributes: boolean;
  /** Whether this tag can have content between opening and closing tags */
  hasContent: boolean;
  /** Whether this tag is self-closing (e.g., [img] without [/img]) */
  selfClosing: boolean;
  /** Parse function to convert BBCode to HTML */
  parse: (content: string, attributes?: Record<string, string>) => string;
  /** Validation function for attributes and content */
  validate?: (content: string, attributes?: Record<string, string>) => boolean;
}

export interface BBCodeParseResult {
  /** The resulting HTML */
  html: string;
  /** Whether the parsing was successful */
  success: boolean;
  /** Any errors encountered during parsing */
  errors?: string[];
}

export interface BBCodeAttributes {
  [key: string]: string;
}

export interface BBCodeMatch {
  /** The full match including brackets */
  fullMatch: string;
  /** The tag name */
  tagName: string;
  /** The content between opening and closing tags */
  content: string;
  /** Parsed attributes */
  attributes: BBCodeAttributes;
  /** Start position in the original string */
  startIndex: number;
  /** End position in the original string */
  endIndex: number;
  /** Whether this match is invalid due to overlapping with processed matches */
  invalid?: boolean;
  /** Length of the opening tag (for content extraction) */
  openingTagLength?: number;
}