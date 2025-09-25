/**
 * JSON AST (Abstract Syntax Tree) system for BBCode
 * This provides a clean intermediate representation between BBCode and TipTap documents
 */

export interface BBCodeASTNode {
  type: string;
  content?: string;
  attributes?: Record<string, string>;
  children?: BBCodeASTNode[];
}

export interface BBCodeASTDocument {
  type: 'document';
  content: BBCodeASTNode[];
}

// Specific node types for different BBCode tags
export interface TextNode extends BBCodeASTNode {
  type: 'text';
  content: string;
}

export interface BoldNode extends BBCodeASTNode {
  type: 'bold';
  children: BBCodeASTNode[];
}

export interface ItalicNode extends BBCodeASTNode {
  type: 'italic';
  children: BBCodeASTNode[];
}

export interface UnderlineNode extends BBCodeASTNode {
  type: 'underline';
  children: BBCodeASTNode[];
}

export interface StrikeNode extends BBCodeASTNode {
  type: 'strike';
  children: BBCodeASTNode[];
}

export interface SubscriptNode extends BBCodeASTNode {
  type: 'subscript';
  children: BBCodeASTNode[];
}

export interface SuperscriptNode extends BBCodeASTNode {
  type: 'superscript';
  children: BBCodeASTNode[];
}

export interface ColorNode extends BBCodeASTNode {
  type: 'color';
  attributes: { color: string };
  children: BBCodeASTNode[];
}

export interface SizeNode extends BBCodeASTNode {
  type: 'size';
  attributes: { size: 'big' | 'small' };
  children: BBCodeASTNode[];
}

export interface AlignNode extends BBCodeASTNode {
  type: 'align';
  attributes: { align: 'left' | 'center' | 'right' | 'justify' };
  children: BBCodeASTNode[];
}

export interface IndentNode extends BBCodeASTNode {
  type: 'indent';
  children: BBCodeASTNode[];
}

export interface HeadingNode extends BBCodeASTNode {
  type: 'heading';
  children: BBCodeASTNode[];
}

export interface HorizontalRuleNode extends BBCodeASTNode {
  type: 'horizontalRule';
}

export interface LinkNode extends BBCodeASTNode {
  type: 'link';
  attributes: { href: string };
  children: BBCodeASTNode[];
}

export interface SpoilerNode extends BBCodeASTNode {
  type: 'spoiler';
  children: BBCodeASTNode[];
}

export interface CollapseNode extends BBCodeASTNode {
  type: 'collapse';
  attributes: { header: string };
  children: BBCodeASTNode[];
}

export interface QuoteNode extends BBCodeASTNode {
  type: 'quote';
  children: BBCodeASTNode[];
}

export interface UserNode extends BBCodeASTNode {
  type: 'user';
  attributes: { username: string };
}

export interface IconNode extends BBCodeASTNode {
  type: 'icon';
  attributes: { username: string };
}

export interface EiconNode extends BBCodeASTNode {
  type: 'eicon';
  attributes: { name: string };
}

export interface NoparseNode extends BBCodeASTNode {
  type: 'noparse';
  content: string;
}

export interface HardBreakNode extends BBCodeASTNode {
  type: 'hardBreak';
}

// Union type for all possible nodes
export type AnyBBCodeNode = 
  | TextNode
  | BoldNode
  | ItalicNode
  | UnderlineNode
  | StrikeNode
  | SubscriptNode
  | SuperscriptNode
  | ColorNode
  | SizeNode
  | AlignNode
  | IndentNode
  | HeadingNode
  | HorizontalRuleNode
  | LinkNode
  | SpoilerNode
  | CollapseNode
  | QuoteNode
  | UserNode
  | IconNode
  | EiconNode
  | NoparseNode
  | HardBreakNode;

/**
 * Convert BBCode string to AST
 */
export function bbcodeToAST(bbcode: string): BBCodeASTDocument {
  const { parseBBCodeToHtml } = require('./parser');
  const result = parseBBCodeToHtml(bbcode);
  
  if (!result.success) {
    // Return a simple text node if parsing fails
    return {
      type: 'document',
      content: [{
        type: 'text',
        content: bbcode
      }]
    };
  }
  
  // For now, we'll parse the HTML result into AST
  // This is a simplified approach - in a full implementation,
  // we'd parse BBCode directly to AST
  return htmlToAST(result.html);
}

/**
 * Convert AST to BBCode string
 */
export function astToBBCode(ast: BBCodeASTDocument): string {
  return ast.content.map(nodeToBBCode).join('');
}

/**
 * Convert a single AST node to BBCode
 */
function nodeToBBCode(node: BBCodeASTNode): string {
  switch (node.type) {
    case 'text':
      return (node as TextNode).content || '';
    
    case 'bold':
      return `[b]${(node as BoldNode).children?.map(nodeToBBCode).join('') || ''}[/b]`;
    
    case 'italic':
      return `[i]${(node as ItalicNode).children?.map(nodeToBBCode).join('') || ''}[/i]`;
    
    case 'underline':
      return `[u]${(node as UnderlineNode).children?.map(nodeToBBCode).join('') || ''}[/u]`;
    
    case 'strike':
      return `[s]${(node as StrikeNode).children?.map(nodeToBBCode).join('') || ''}[/s]`;
    
    case 'subscript':
      return `[sub]${(node as SubscriptNode).children?.map(nodeToBBCode).join('') || ''}[/sub]`;
    
    case 'superscript':
      return `[sup]${(node as SuperscriptNode).children?.map(nodeToBBCode).join('') || ''}[/sup]`;
    
    case 'color':
      const colorNode = node as ColorNode;
      return `[color=${colorNode.attributes?.color || ''}]${colorNode.children?.map(nodeToBBCode).join('') || ''}[/color]`;
    
    case 'size':
      const sizeNode = node as SizeNode;
      const sizeTag = sizeNode.attributes?.size === 'big' ? 'big' : 'small';
      return `[${sizeTag}]${sizeNode.children?.map(nodeToBBCode).join('') || ''}[/${sizeTag}]`;
    
    case 'align':
      const alignNode = node as AlignNode;
      return `[${alignNode.attributes?.align || 'left'}]${alignNode.children?.map(nodeToBBCode).join('') || ''}[/${alignNode.attributes?.align || 'left'}]`;
    
    case 'indent':
      return `[indent]${(node as IndentNode).children?.map(nodeToBBCode).join('') || ''}[/indent]`;
    
    case 'heading':
      return `[heading]${(node as HeadingNode).children?.map(nodeToBBCode).join('') || ''}[/heading]`;
    
    case 'horizontalRule':
      return '[hr]';
    
    case 'link':
      const linkNode = node as LinkNode;
      const href = linkNode.attributes?.href || '';
      const linkContent = linkNode.children?.map(nodeToBBCode).join('') || '';
      return href === linkContent ? `[url]${href}[/url]` : `[url=${href}]${linkContent}[/url]`;
    
    case 'spoiler':
      return `[spoiler]${(node as SpoilerNode).children?.map(nodeToBBCode).join('') || ''}[/spoiler]`;
    
    case 'collapse':
      const collapseNode = node as CollapseNode;
      return `[collapse header="${collapseNode.attributes?.header || 'Click to expand'}"]${collapseNode.children?.map(nodeToBBCode).join('') || ''}[/collapse]`;
    
    case 'quote':
      return `[quote]${(node as QuoteNode).children?.map(nodeToBBCode).join('') || ''}[/quote]`;
    
    case 'user':
      const userNode = node as UserNode;
      return `[user]${userNode.attributes?.username || ''}[/user]`;
    
    case 'icon':
      const iconNode = node as IconNode;
      return `[icon]${iconNode.attributes?.username || ''}[/icon]`;
    
    case 'eicon':
      const eiconNode = node as EiconNode;
      return `[eicon]${eiconNode.attributes?.name || ''}[/eicon]`;
    
    case 'noparse':
      return `[noparse]${(node as NoparseNode).content || ''}[/noparse]`;
    
    case 'hardBreak':
      return '\n';
    
    default:
      return '';
  }
}

/**
 * Convert HTML to AST (improved implementation)
 * This handles mixed text and HTML tags properly
 */
function htmlToAST(html: string): BBCodeASTDocument {
  const content: BBCodeASTNode[] = [];
  
  // Use a more robust approach to parse HTML with mixed content
  let i = 0;
  
  while (i < html.length) {
    // Look for the next HTML tag
    const tagStart = html.indexOf('<', i);
    
    if (tagStart === -1) {
      // No more tags, add remaining text
      const remainingText = html.substring(i);
      if (remainingText) {
        content.push({ type: 'text', content: remainingText });
      }
      break;
    }
    
    // Add text before the tag
    if (tagStart > i) {
      const textContent = html.substring(i, tagStart);
      if (textContent) {
        content.push({ type: 'text', content: textContent });
      }
    }
    
    // Find the end of the tag
    const tagEnd = html.indexOf('>', tagStart);
    if (tagEnd === -1) {
      // Malformed HTML, treat as text
      const remainingText = html.substring(tagStart);
      if (remainingText) {
        content.push({ type: 'text', content: remainingText });
      }
      break;
    }
    
    const fullTag = html.substring(tagStart, tagEnd + 1);
    
    // Check if it's a self-closing tag
    if (fullTag.endsWith('/>')) {
      const tagName = fullTag.match(/<(\w+)/)?.[1];
      if (tagName) {
        const astNode = htmlTagToASTNode(tagName, '');
        if (astNode) {
          content.push(astNode);
        }
      }
      i = tagEnd + 1;
      continue;
    }
    
    // Extract tag name
    const tagNameMatch = fullTag.match(/<(\w+)/);
    if (!tagNameMatch) {
      i = tagEnd + 1;
      continue;
    }
    
    const tagName = tagNameMatch[1];
    
    // Find the closing tag
    const closingTag = `</${tagName}>`;
    const closingIndex = html.indexOf(closingTag, tagEnd);
    
    if (closingIndex === -1) {
      // No closing tag found, treat as text
      const remainingText = html.substring(tagStart);
      if (remainingText) {
        content.push({ type: 'text', content: remainingText });
      }
      break;
    }
    
    // Extract content between tags
    const tagContent = html.substring(tagEnd + 1, closingIndex);
    
    // Convert HTML tag to AST node
    const astNode = htmlTagToASTNode(tagName, tagContent);
    if (astNode) {
      content.push(astNode);
    }
    
    i = closingIndex + closingTag.length;
  }
  
  return {
    type: 'document',
    content
  };
}

/**
 * Convert HTML tag to AST node
 */
function htmlTagToASTNode(tagName: string, content: string): BBCodeASTNode | null {
  // If content contains HTML tags, recursively parse it
  const children = content.includes('<') ? htmlToAST(content).content : [{ type: 'text', content }];
  
  switch (tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return { type: 'bold', children };
    
    case 'em':
    case 'i':
      return { type: 'italic', children };
    
    case 'u':
      return { type: 'underline', children };
    
    case 'del':
    case 's':
      return { type: 'strike', children };
    
    case 'sub':
      return { type: 'subscript', children };
    
    case 'sup':
      return { type: 'superscript', children };
    
    case 'span':
      // Check for color or size styling in the tag attributes
      // Note: content here is the inner content, not the tag attributes
      // We need to extract attributes from the full tag, but for now use content as fallback
      if (content.includes('color:')) {
        const colorMatch = content.match(/color:\s*([^;]+)/);
        if (colorMatch) {
          return { 
            type: 'color', 
            attributes: { color: colorMatch[1].trim() },
            children
          };
        }
      }
      if (content.includes('font-size: 1.2em')) {
        return { type: 'size', attributes: { size: 'big' }, children };
      }
      if (content.includes('font-size: 0.8em')) {
        return { type: 'size', attributes: { size: 'small' }, children };
      }
      return children.length === 1 ? children[0] : { type: 'text', content };
    
    case 'div':
      // Check for alignment
      if (content.includes('text-align: center')) {
        return { type: 'align', attributes: { align: 'center' }, children };
      }
      if (content.includes('text-align: right')) {
        return { type: 'align', attributes: { align: 'right' }, children };
      }
      if (content.includes('text-align: justify')) {
        return { type: 'align', attributes: { align: 'justify' }, children };
      }
      if (content.includes('margin-left: 40px')) {
        return { type: 'indent', children };
      }
      return children.length === 1 ? children[0] : { type: 'text', content };
    
    case 'a':
      // Extract href from content or use content as URL
      return { 
        type: 'link', 
        attributes: { href: content },
        children
      };
    
    case 'hr':
      return { type: 'horizontalRule' };
    
    case 'br':
      return { type: 'hardBreak' };
    
    default:
      return children.length === 1 ? children[0] : { type: 'text', content };
  }
}

/**
 * Convert AST to TipTap JSON document
 */
export function astToTipTapJSON(ast: BBCodeASTDocument): any {
  return {
    type: 'doc',
    content: ast.content.map(nodeToTipTapJSON)
  };
}

/**
 * Convert AST node to TipTap JSON node
 */
function nodeToTipTapJSON(node: BBCodeASTNode): any {
  switch (node.type) {
    case 'text':
      return {
        type: 'text',
        text: (node as TextNode).content || ''
      };
    
    case 'bold':
      return {
        type: 'text',
        marks: [{ type: 'bold' }],
        text: (node as BoldNode).children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'italic':
      return {
        type: 'text',
        marks: [{ type: 'italic' }],
        text: (node as ItalicNode).children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'underline':
      return {
        type: 'text',
        marks: [{ type: 'underline' }],
        text: (node as UnderlineNode).children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'strike':
      return {
        type: 'text',
        marks: [{ type: 'strike' }],
        text: (node as StrikeNode).children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'subscript':
      return {
        type: 'text',
        marks: [{ type: 'subscript' }],
        text: (node as SubscriptNode).children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'superscript':
      return {
        type: 'text',
        marks: [{ type: 'superscript' }],
        text: (node as SuperscriptNode).children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'color':
      const colorNode = node as ColorNode;
      return {
        type: 'text',
        marks: [{ type: 'textStyle', attrs: { color: colorNode.attributes?.color } }],
        text: colorNode.children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'size':
      const sizeNode = node as SizeNode;
      const fontSize = sizeNode.attributes?.size === 'big' ? '1.2em' : '0.8em';
      return {
        type: 'text',
        marks: [{ type: 'textStyle', attrs: { fontSize } }],
        text: sizeNode.children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'align':
      const alignNode = node as AlignNode;
      return {
        type: 'paragraph',
        attrs: { textAlign: alignNode.attributes?.align || 'left' },
        content: alignNode.children?.map(nodeToTipTapJSON) || []
      };
    
    case 'indent':
      return {
        type: 'paragraph',
        attrs: { class: 'indent' },
        content: (node as IndentNode).children?.map(nodeToTipTapJSON) || []
      };
    
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: 2 },
        content: (node as HeadingNode).children?.map(nodeToTipTapJSON) || []
      };
    
    case 'horizontalRule':
      return {
        type: 'horizontalRule'
      };
    
    case 'link':
      const linkNode = node as LinkNode;
      return {
        type: 'text',
        marks: [{ type: 'link', attrs: { href: linkNode.attributes?.href } }],
        text: linkNode.children?.map(nodeToTipTapJSON).map(n => n.text).join('') || ''
      };
    
    case 'hardBreak':
      return {
        type: 'hardBreak'
      };
    
    default:
      return {
        type: 'text',
        text: ''
      };
  }
}

/**
 * Convert TipTap JSON document to AST
 */
export function tipTapJSONToAST(tiptapDoc: any): BBCodeASTDocument {
  const content: BBCodeASTNode[] = [];
  
  if (tiptapDoc.content) {
    for (const node of tiptapDoc.content) {
      const astNode = tipTapNodeToAST(node);
      if (astNode) {
        // If the node is a paragraph with multiple children, flatten them
        if (astNode.type === 'text' && astNode.content === '' && node.type === 'paragraph' && node.content) {
          // This is a paragraph that was collapsed, so we need to process its children directly
          const paragraphChildren = node.content.map(tipTapNodeToAST);
          content.push(...paragraphChildren);
        } else {
          content.push(astNode);
        }
      }
    }
  }
  
  return {
    type: 'document',
    content
  };
}

/**
 * Convert TipTap JSON node to AST node
 */
function tipTapNodeToAST(node: any): BBCodeASTNode {
  switch (node.type) {
    case 'text':
      let textNode: BBCodeASTNode = { type: 'text', content: node.text || '' };
      
      // Apply marks
      if (node.marks) {
        for (const mark of node.marks) {
          textNode = applyMarkToNode(textNode, mark);
        }
      }
      
      return textNode;
    
    case 'paragraph':
      const paragraphContent = node.content?.map(tipTapNodeToAST) || [];
      if (node.attrs?.textAlign) {
        return {
          type: 'align',
          attributes: { align: node.attrs.textAlign },
          children: paragraphContent
        };
      }
      if (node.attrs?.class === 'indent') {
        return {
          type: 'indent',
          children: paragraphContent
        };
      }
      // Return the paragraph content as-is, don't collapse it
      return paragraphContent.length === 1 ? paragraphContent[0] : { type: 'text', content: '' };
    
    case 'heading':
      return {
        type: 'heading',
        children: node.content?.map(tipTapNodeToAST) || []
      };
    
    case 'horizontalRule':
      return { type: 'horizontalRule' };
    
    case 'hardBreak':
      return { type: 'hardBreak' };
    
    default:
      return { type: 'text', content: '' };
  }
}

/**
 * Apply a TipTap mark to an AST node
 */
function applyMarkToNode(node: BBCodeASTNode, mark: any): BBCodeASTNode {
  switch (mark.type) {
    case 'bold':
      return { type: 'bold', children: [node] };
    
    case 'italic':
      return { type: 'italic', children: [node] };
    
    case 'underline':
      return { type: 'underline', children: [node] };
    
    case 'strike':
      return { type: 'strike', children: [node] };
    
    case 'subscript':
      return { type: 'subscript', children: [node] };
    
    case 'superscript':
      return { type: 'superscript', children: [node] };
    
    case 'textStyle':
      if (mark.attrs?.color) {
        return { type: 'color', attributes: { color: mark.attrs.color }, children: [node] };
      }
      if (mark.attrs?.fontSize) {
        const size = mark.attrs.fontSize === '1.2em' ? 'big' : 'small';
        return { type: 'size', attributes: { size }, children: [node] };
      }
      return node;
    
    case 'link':
      return { type: 'link', attributes: { href: mark.attrs?.href || '' }, children: [node] };
    
    default:
      return node;
  }
}
