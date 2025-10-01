/**
 * Test page for the enhanced BBCode editor
 * This page allows testing all BBCode features in the WYSIWYG editor
 */

'use client';

import { useState } from 'react';
import BBCodeEditor from '@/components/BBCodeEditor';
import { bbcodeToHtml } from '@/lib/bbcode';

export default function TestBBCodePage() {
  const [bbcodeValue, setBBCodeValue] = useState('');
  const [outputBBCode, setOutputBBCode] = useState('');

  const handleChange = (bbcode: string) => {
    setBBCodeValue(bbcode);
  };

  const handleSubmit = (bbcode: string) => {
    setOutputBBCode(bbcode);
    console.log('Submitted BBCode:', bbcode);
  };

  const testCases = [
    {
      name: 'Basic Formatting',
      bbcode: '[b]Bold[/b] [i]Italic[/i] [u]Underline[/u] [s]Strikethrough[/s]'
    },
    {
      name: 'Text Size',
      bbcode: '[big]Big text[/big] [small]Small text[/small]'
    },
    {
      name: 'Colors',
      bbcode: '[color=red]Red text[/color] [color=#00ff00]Green text[/color]'
    },
    {
      name: 'Alignment',
      bbcode: '[center]Centered text[/center]\n[right]Right aligned[/right]'
    },
    {
      name: 'Links',
      bbcode: '[url]https://example.com[/url]\n[url=https://example.com]Click here[/url]'
    },
    {
      name: 'Spoiler',
      bbcode: '[spoiler]This is hidden content[/spoiler]'
    },
    {
      name: 'Quote',
      bbcode: '[quote]This is a quote[/quote]'
    },
    {
      name: 'User & Icon',
      bbcode: '[user]TestUser[/user] [icon]TestUser[/icon]'
    },
    {
      name: 'Eicon',
      bbcode: '[eicon]smile[/eicon] [eicon]heart[/eicon]'
    },
    {
      name: 'Complex Example',
      bbcode: '[b]Welcome to F-Chat![/b]\n\n[color=blue]This is a [i]complex[/i] message[/color] with:\n- [spoiler]Hidden content[/spoiler]\n- [url=https://f-list.net]F-List[/url]\n- [user]TestUser[/user]\n\n[center][big]Have fun![/big][/center]'
    },
    {
      name: 'Character Profile Example',
      bbcode: '[right][color=yellow]Horizon Color[/color]- [url=https://iili.io/KEuauBs.png]Horizon Portrait[/url][/right]\r\n[hr]\r\n[heading][color=orange][u]_____________________[color=white]STOP ! I\'m not a KITTY ![/color]____________________________________[/u]\r\n\\[u][color=white][b]Egyptian[/b][/color][/u]/[/color][/heading]\r\n \r\n \r\n[right][heading][color=orange][u]___________________________________[color=white]I\'m a Very MASCULIN JACKAL ![/color]_____________________\r\n[/u]\\[u][color=white][b]Jackal[/b][/color][/u]/[/color][/heading][/right]\r\n[hr]\r\n\r\n[center][indent][indent][indent][indent][indent][indent][big][color=white]" Shota Jackal "[/color]\r\n[color=orange]▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀[/color][/big]\r\n[/indent][/indent][/indent][/indent][/indent][/indent][/center]\r\n\r\n[center][img=4217587]Tarfire[/img][/center]\r\n[collapse=Who am I?]\r\n[center]\r\nAge: 10\r\n\r\nHeight: approximately 1.35 m (rather slender for his age, with thin legs, he already has a figure that promises to grow straight as a reed).\r\n\r\nWeight: around 30 kg, light but agile, his body does not yet have the muscular build of his older brother.\r\n\r\nGeneral appearance:\r\n\r\nStill a child, he has a fragile appearance, but his quick movements show that he is lively and resilient.\r\n\r\nHis body is that of a growing boy: not yet sculpted by training, but already accustomed to running, climbing, and sneaking around.\r\n[/center]\r\n[/collapse]\r\n[center][img=4217588]Tarfire[/img][/center]\r\n\r\n[hr]\r\n[hr]\r\n[right][color=green]L[sub]ooking[/sub][/color] [sub]I\'m looking for role play.[/sub]\r\n[color=blue]O[sub]nline[/sub][/color] [sub]I\'m online, your welcome.[/sub]\r\n[color=orange]B[sub]usy[/sub][/color] [sub]I\'m busy, I may take some time to respond.[/sub]\r\n[color=yellow]A[sub]way[/sub][/color] [sub]I\'m away.[/sub]\r\n[color=red]D[sub]nd[/sub][/color] [sub]Don\'t disturb me, maybe at work.[/sub][hr][/right]\r\n\r\n[color=orange]Horizon Color[/color] - [url=https://iili.io/KKCvHSS.png]Horizon Portrait[/url]'
    },
    {
      name: 'ImageTest',
      bbcode: '[url=https://i.ibb.co/kbQLrm8/688cda12-27da-45af-8d87-d5d52f611101.png]Lingerie or bikini?  Does it matter? >:3[/url]'
    }
  ];

  const loadTestCase = (bbcode: string) => {
    setBBCodeValue(bbcode);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">BBCode Editor Test Page</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Editor */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">WYSIWYG Editor</h2>
            <BBCodeEditor
              value={bbcodeValue}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder="Type your message with BBCode formatting..."
              className="min-h-[300px]"
            />
          </div>

          {/* BBCode Output */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">BBCode Output</h2>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 min-h-[300px]">
              <pre className="whitespace-pre-wrap text-sm text-gray-300">
                {outputBBCode || 'Submit a message to see the BBCode output here...'}
              </pre>
            </div>
          </div>

          {/* Rendered Output */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Rendered Output</h2>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 min-h-[300px]">
              {outputBBCode ? (
                <div 
                  className="text-sm prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: bbcodeToHtml(outputBBCode) }}
                />
              ) : (
                <p className="text-gray-400 text-sm">Submit a message to see the rendered output here...</p>
              )}
            </div>
          </div>
        </div>

        {/* Test Cases */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Test Cases</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {testCases.map((testCase, index) => (
              <button
                key={index}
                onClick={() => loadTestCase(testCase.bbcode)}
                className="p-4 bg-gray-800 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors text-left"
              >
                <h3 className="font-semibold text-blue-400 mb-2">{testCase.name}</h3>
                <p className="text-sm text-gray-300 truncate">{testCase.bbcode}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Features List */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Supported Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-green-400 mb-2">Text Formatting</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Bold [b]</li>
                <li>• Italic [i]</li>
                <li>• Underline [u]</li>
                <li>• Strikethrough [s]</li>
                <li>• Subscript [sub]</li>
                <li>• Superscript [sup]</li>
              </ul>
            </div>

            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-blue-400 mb-2">Text Style</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Colors [color=...]</li>
                <li>• Big text [big]</li>
                <li>• Small text [small]</li>
                <li>• Font families</li>
              </ul>
            </div>

            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-purple-400 mb-2">Alignment</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Left [left]</li>
                <li>• Center [center]</li>
                <li>• Right [right]</li>
                <li>• Justify [justify]</li>
                <li>• Indent [indent]</li>
              </ul>
            </div>

            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-400 mb-2">Layout</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Headings [heading]</li>
                <li>• Horizontal rules [hr]</li>
                <li>• Line breaks</li>
              </ul>
            </div>

            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-red-400 mb-2">Interactive</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Spoilers [spoiler]</li>
                <li>• Collapse [collapse]</li>
                <li>• Quotes [quote]</li>
                <li>• No parse [noparse]</li>
              </ul>
            </div>

            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <h3 className="font-semibold text-cyan-400 mb-2">F-Chat Specific</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• URLs [url]</li>
                <li>• User mentions [user]</li>
                <li>• User icons [icon]</li>
                <li>• Eicons [eicon]</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-gray-800 border border-gray-600 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">How to Use</h2>
          <div className="space-y-2 text-gray-300">
            <p>• <strong>WYSIWYG Editing:</strong> Use the toolbar buttons to format text visually</p>
            <p>• <strong>Keyboard Shortcuts:</strong> Ctrl+B (bold), Ctrl+I (italic), Ctrl+U (underline)</p>
            <p>• <strong>Enter:</strong> Submit message</p>
            <p>• <strong>Shift+Enter:</strong> Insert line break</p>
            <p>• <strong>Test Cases:</strong> Click any test case button to load sample BBCode</p>
            <p>• <strong>Real-time Preview:</strong> See BBCode output as you type</p>
          </div>
        </div>
      </div>
    </div>
  );
}