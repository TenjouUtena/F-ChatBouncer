/**
 * Comprehensive BBCode Toolbar Component
 * Provides WYSIWYG controls for all supported BBCode features
 */

import React from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  Link,
  Eye,
  Quote,
  List,
  Minus,
  Indent,
  Heading,
  Code,
  User,
  Image,
  Smile
} from 'lucide-react';

interface BBCodeToolbarProps {
  editor: Editor | null;
  onInsertUser?: () => void;
  onInsertEicon?: () => void;
  onInsertIcon?: () => void;
}

export function BBCodeToolbar({ 
  editor, 
  onInsertUser, 
  onInsertEicon, 
  onInsertIcon 
}: BBCodeToolbarProps) {
  if (!editor) return null;

  const ToolbarButton = ({ 
    onClick, 
    isActive = false, 
    disabled = false, 
    title, 
    children, 
    className = '' 
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-sm rounded hover:bg-gray-600 transition-colors text-white ${
        isActive ? 'bg-gray-500' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      title={title}
    >
      {children}
    </button>
  );

  const ToolbarGroup = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`flex items-center space-x-1 ${className}`}>
      {children}
    </div>
  );

  const ToolbarSeparator = () => (
    <div className="w-px h-6 bg-gray-600 mx-1" />
  );

  return (
    <div className="flex items-center flex-wrap gap-1 p-2 border-b border-gray-600 bg-gray-700">
      {/* Text Formatting */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          title="Bold [b]"
        >
          <Bold size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          title="Italic [i]"
        >
          <Italic size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          title="Underline [u]"
        >
          <Underline size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          title="Strikethrough [s]"
        >
          <Strikethrough size={16} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Text Style */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          isActive={editor.isActive('subscript')}
          disabled={!editor.can().chain().focus().toggleSubscript().run()}
          title="Subscript [sub]"
        >
          <Type size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          isActive={editor.isActive('superscript')}
          disabled={!editor.can().chain().focus().toggleSuperscript().run()}
          title="Superscript [sup]"
        >
          <Type size={16} className="transform rotate-180" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Text Alignment */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Left align [left]"
        >
          <AlignLeft size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Center align [center]"
        >
          <AlignCenter size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Right align [right]"
        >
          <AlignRight size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title="Justify [justify]"
        >
          <AlignJustify size={16} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Layout */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          disabled={!editor.can().chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading [heading]"
        >
          <Heading size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          disabled={!editor.can().chain().focus().setHorizontalRule().run()}
          title="Horizontal rule [hr]"
        >
          <Minus size={16} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Interactive Elements */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={() => editor.chain().focus().insertContent('[spoiler]Spoiler content[/spoiler]').run()}
          title="Spoiler [spoiler]"
        >
          <Eye size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().insertContent('[quote]Quote content[/quote]').run()}
          title="Quote [quote]"
        >
          <Quote size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().insertContent('[noparse]Raw content[/noparse]').run()}
          title="No parse [noparse]"
        >
          <Code size={16} />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* F-Chat Specific */}
      <ToolbarGroup>
        <ToolbarButton
          onClick={onInsertUser || (() => {})}
          title="Insert user mention [user]"
        >
          <User size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={onInsertIcon || (() => {})}
          title="Insert user icon [icon]"
        >
          <Image size={16} />
        </ToolbarButton>

        <ToolbarButton
          onClick={onInsertEicon || (() => {})}
          title="Insert eicon [eicon]"
        >
          <Smile size={16} />
        </ToolbarButton>
      </ToolbarGroup>

      <div className="flex-1" />

      {/* Info */}
      <div className="text-xs text-gray-300">
        F-Chat BBCode Editor
      </div>
    </div>
  );
}
