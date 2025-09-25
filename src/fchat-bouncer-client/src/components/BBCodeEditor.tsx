'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Strike from '@tiptap/extension-strike';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';

import { 
  bbcodeToTipTapJSON, 
  tipTapJSONToBBCode, 
  getPlainText 
} from '@/lib/bbcode';
import { BBCodeToolbar } from './BBCodeToolbar';
import { useCallback, useEffect, useState } from 'react';

interface BBCodeEditorProps {
  value?: string;
  onChange?: (bbcode: string) => void;
  onSubmit?: (bbcode: string) => void;
  onBlur?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  onInputChange?: (hasContent: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function BBCodeEditor({
  value = '',
  onChange,
  onSubmit,
  onBlur,
  onTypingStart,
  onTypingStop,
  onInputChange,
  placeholder = 'Type your message...',
  disabled = false,
  className = '',
}: BBCodeEditorProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable extensions that conflict with our custom ones
        heading: false, // We'll use our custom heading
        strike: false, // We'll use our custom strike
        hardBreak: false, // We'll use our custom hardBreak
        horizontalRule: false, // We'll use our custom horizontalRule
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        dropcursor: false,
        gapcursor: false,
        history: {
          depth: 100,
        },
        // Keep basic formatting - only specify what we want to keep
        bold: {},
        italic: {},
        paragraph: {},
      }),
      Underline,
      Strike,
      Superscript,
      Subscript,
      Heading.configure({
        levels: [1, 2, 3],
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      TextStyle,
      Color.configure({
        types: ['textStyle'],
      }),
      FontFamily.configure({
        types: ['textStyle'],
      }),
      HardBreak,
      HorizontalRule,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: '',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (!isInitialized) return;
      
      try {
        const json = editor.getJSON();
        const bbcode = tipTapJSONToBBCode(json);
        
        // Get plain text from TipTap JSON directly
        const plainText = editor.getText();
        const hasContent = plainText.trim().length > 0;
        
        onChange?.(bbcode);
        onInputChange?.(hasContent);
        
        // Trigger typing start if there's content
        if (hasContent) {
          onTypingStart?.();
        }
      } catch (error) {
        console.error('Error converting TipTap JSON to BBCode:', error);
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none text-gray-100 prose-invert min-h-[80px] max-w-none',
      },
      handleKeyDown: (_view, event) => {
        // Handle Enter key for submission
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          
          if (editor) {
            try {
              const json = editor.getJSON();
              const bbcode = tipTapJSONToBBCode(json);

              if (bbcode.trim()) {
                // Stop typing before submitting
                onTypingStop?.();
                onSubmit?.(bbcode);
                editor.commands.clearContent();
              }
            } catch (error) {
              console.error('Error converting TipTap JSON to BBCode:', error);
            }
          }
          return true;
        }

        // Handle Shift+Enter for line breaks
        if (event.key === 'Enter' && event.shiftKey) {
          editor?.commands.setHardBreak();
          return true;
        }

        return false;
      },
    },
  });

  // Initialize editor content when value prop changes
  useEffect(() => {
    if (editor && value !== undefined && !isInitialized) {
      try {
        const json = bbcodeToTipTapJSON(value);
        editor.commands.setContent(json);
        setIsInitialized(true);
      } catch (error) {
        console.error('Error converting BBCode to TipTap JSON:', error);
        // Fallback to plain text
        editor.commands.setContent(value);
        setIsInitialized(true);
      }
    }
  }, [editor, value, isInitialized]);

  // Update editor content when value prop changes (after initialization)
  useEffect(() => {
    if (editor && value !== undefined && isInitialized) {
      try {
        const currentJSON = editor.getJSON();
        const currentBBCode = tipTapJSONToBBCode(currentJSON);
        
        if (currentBBCode !== value) {
          const json = bbcodeToTipTapJSON(value);
          editor.commands.setContent(json);
        }
      } catch (error) {
        console.error('Error updating editor content:', error);
      }
    }
  }, [editor, value, isInitialized]);

  // Set up blur event listener
  useEffect(() => {
    if (!editor) return;

    const handleBlur = () => {
      onBlur?.();
    };

    // Add blur event listener to the editor's DOM element
    const editorElement = editor.view.dom;
    editorElement.addEventListener('blur', handleBlur);

    return () => {
      editorElement.removeEventListener('blur', handleBlur);
    };
  }, [editor, onBlur]);

  // Enable/disable editor based on disabled prop
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  const handleSubmit = useCallback(() => {
    if (editor) {
      try {
        const json = editor.getJSON();
        const bbcode = tipTapJSONToBBCode(json);

        if (bbcode.trim()) {
          onSubmit?.(bbcode);
          editor.commands.clearContent();
        }
      } catch (error) {
        console.error('Error converting TipTap JSON to BBCode:', error);
      }
    }
  }, [editor, onSubmit]);

  const getCharacterCount = useCallback(() => {
    if (!editor) return 0;
    try {
      const json = editor.getJSON();
      const bbcode = tipTapJSONToBBCode(json);
      return getPlainText(bbcode).length;
    } catch (error) {
      console.error('Error getting character count:', error);
      return 0;
    }
  }, [editor]);

  const handleInsertUser = useCallback(() => {
    const username = prompt('Enter username:');
    if (username && editor) {
      editor.chain().focus().insertContent(`[user]${username}[/user]`).run();
    }
  }, [editor]);

  const handleInsertEicon = useCallback(() => {
    const eiconName = prompt('Enter eicon name:');
    if (eiconName && editor) {
      editor.chain().focus().insertContent(`[eicon]${eiconName}[/eicon]`).run();
    }
  }, [editor]);

  const handleInsertIcon = useCallback(() => {
    const username = prompt('Enter username for icon:');
    if (username && editor) {
      editor.chain().focus().insertContent(`[icon]${username}[/icon]`).run();
    }
  }, [editor]);

  const handleInsertLink = useCallback(() => {
    const url = prompt('Enter URL:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const handleInsertColor = useCallback(() => {
    const color = prompt('Enter color (e.g., red, #ff0000, rgb(255,0,0)):');
    if (color && editor) {
      editor.chain().focus().setColor(color).run();
    }
  }, [editor]);

  return (
    <div className={`border border-gray-600 rounded-lg bg-gray-800 ${className}`}>
      <BBCodeToolbar 
        editor={editor}
        onInsertUser={handleInsertUser}
        onInsertEicon={handleInsertEicon}
        onInsertIcon={handleInsertIcon}
      />

      <div className="min-h-[100px] max-h-[200px] overflow-y-auto p-3 bg-gray-800">
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-between p-2 border-t border-gray-600 bg-gray-700">
        <div className="text-xs text-gray-300">
          {getCharacterCount()} characters • Enter to send, Shift+Enter for new line
        </div>

        <div className="flex items-center space-x-2">
          {/* Quick action buttons */}
          <button
            onClick={handleInsertLink}
            disabled={disabled || !editor}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Insert link"
          >
            Link
          </button>

          <button
            onClick={handleInsertColor}
            disabled={disabled || !editor}
            className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Set text color"
          >
            Color
          </button>

          <button
            onClick={handleSubmit}
            disabled={disabled || !editor || getCharacterCount() === 0}
            className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}