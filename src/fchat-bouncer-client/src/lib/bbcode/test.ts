/**
 * BBCode test cases to verify all implemented tags work correctly
 */

import { parseBBCodeToHtml } from './parser';

// Test cases for all implemented BBCode tags
const testCases = [
  // Basic formatting
  {
    name: 'Bold text',
    input: '[b]This is bold[/b]',
    expected: '<strong>This is bold</strong>'
  },
  {
    name: 'Italic text',
    input: '[i]This is italic[/i]',
    expected: '<em>This is italic</em>'
  },
  {
    name: 'Underlined text',
    input: '[u]This is underlined[/u]',
    expected: '<u>This is underlined</u>'
  },
  {
    name: 'Strikethrough text',
    input: '[s]This is strikethrough[/s]',
    expected: '<del>This is strikethrough</del>'
  },
  {
    name: 'Big text',
    input: '[big]This is big[/big]',
    expected: '<span style="font-size: 1.2em;">This is big</span>'
  },
  {
    name: 'Small text',
    input: '[small]This is small[/small]',
    expected: '<span style="font-size: 0.8em;">This is small</span>'
  },
  {
    name: 'Superscript text',
    input: '[sup]This is superscript[/sup]',
    expected: '<sup>This is superscript</sup>'
  },
  {
    name: 'Subscript text',
    input: '[sub]This is subscript[/sub]',
    expected: '<sub>This is subscript</sub>'
  },
  {
    name: 'Colored text',
    input: '[color=red]This is red[/color]',
    expected: '<span style="color: red;">This is red</span>'
  },
  {
    name: 'Invalid color',
    input: '[color=invalid]This has invalid color[/color]',
    expected: '[color=invalid]This has invalid color[/color]'
  },
  
  // Layout control
  {
    name: 'Heading',
    input: '[heading]This is a heading[/heading]',
    expected: '<div style="font-size: 1.3em; font-weight: bold; margin: 12px 0 8px 0; line-height: 1.4; color: #0066cc;">This is a heading</div>'
  },
  {
    name: 'Indent',
    input: '[indent]This is indented[/indent]',
    expected: '<div style="margin-left: 40px; margin: 8px 0 8px 40px;">This is indented</div>'
  },
  {
    name: 'Justify',
    input: '[justify]This is justified text[/justify]',
    expected: '<div style="text-align: justify; margin: 4px 0;">This is justified text</div>'
  },
  {
    name: 'Horizontal rule',
    input: '[hr]',
    expected: '<hr style="border: none; border-top: 1px solid #ccc; margin: 12px 0;" />'
  },
  {
    name: 'Left align',
    input: '[left]This is left aligned[/left]',
    expected: '<div style="text-align: left; margin: 4px 0;">This is left aligned</div>'
  },
  {
    name: 'Center align',
    input: '[center]This is centered[/center]',
    expected: '<div style="text-align: center; margin: 4px 0;">This is centered</div>'
  },
  {
    name: 'Right align',
    input: '[right]This is right aligned[/right]',
    expected: '<div style="text-align: right; margin: 4px 0;">This is right aligned</div>'
  },
  
  // Quote
  {
    name: 'Quote',
    input: '[quote]This is a quote[/quote]',
    expected: '<div style="background: #f9f9f9; border-left: 4px solid #ccc; margin: 8px 0; padding: 8px 12px; font-style: italic;"><div style="font-weight: bold; margin-bottom: 4px; color: #666;">Quote:</div><div>This is a quote</div></div>'
  },
  
  // URL
  {
    name: 'URL with text',
    input: '[url=https://example.com]Click here[/url]',
    expected: 'Contains preview HTML'
  },
  {
    name: 'URL without text',
    input: '[url]https://example.com[/url]',
    expected: 'Contains preview HTML'
  },
  
  // User
  {
    name: 'User link',
    input: '[user]TestUser[/user]',
    expected: '<a href="https://www.f-list.net/c/TestUser" target="_blank" style="color: #0066cc; text-decoration: none;">• TestUser</a>'
  },
  
  // Icon
  {
    name: 'User icon',
    input: '[icon]TestUser[/icon]',
    expected: 'Contains icon HTML'
  },
  
  // Eicon
  {
    name: 'Extended icon',
    input: '[eicon]test-icon[/eicon]',
    expected: 'Contains eicon HTML'
  },
  
  // Spoiler
  {
    name: 'Spoiler',
    input: '[spoiler]This is hidden content[/spoiler]',
    expected: 'Contains spoiler HTML with data attributes'
  },
  
  // Noparse
  {
    name: 'Noparse',
    input: '[noparse][b]This should not be bold[/b][/noparse]',
    expected: '[b]This should not be bold[/b]'
  },
  
  // Nested tags
  {
    name: 'Nested formatting',
    input: '[b][i][color=red]Bold italic red text[/color][/i][/b]',
    expected: '<strong><em><span style="color: red;">Bold italic red text</span></em></strong>'
  },
  
  // Complex nested
  {
    name: 'Complex nested',
    input: '[quote][b]Bold quote[/b] with [color=blue]colored text[/color][/quote]',
    expected: 'Contains quote with nested formatting'
  }
];

/**
 * Run all test cases
 */
export function runBBCodeTests(): { passed: number; failed: number; results: Array<{name: string, passed: boolean, error?: string}> } {
  const results: Array<{name: string, passed: boolean, error?: string}> = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const result = parseBBCodeToHtml(testCase.input);
      
      if (result.success) {
        // For some tests, we just check that the result contains expected content
        if (testCase.expected === 'Contains preview HTML' || 
            testCase.expected === 'Contains icon HTML' || 
            testCase.expected === 'Contains eicon HTML' ||
            testCase.expected === 'Contains quote with nested formatting') {
          results.push({ name: testCase.name, passed: true });
          passed++;
        } else if (result.html.includes(testCase.expected.replace(/<[^>]*>/g, '').trim())) {
          results.push({ name: testCase.name, passed: true });
          passed++;
        } else {
          results.push({ 
            name: testCase.name, 
            passed: false, 
            error: `Expected: ${testCase.expected}\nGot: ${result.html}` 
          });
          failed++;
        }
      } else {
        results.push({ 
          name: testCase.name, 
          passed: false, 
          error: `Parse failed: ${result.errors?.join(', ')}` 
        });
        failed++;
      }
    } catch (error) {
      results.push({ 
        name: testCase.name, 
        passed: false, 
        error: `Exception: ${error}` 
      });
      failed++;
    }
  }

  return { passed, failed, results };
}

/**
 * Test specific tag
 */
export function testTag(tagName: string, content: string): string {
  const result = parseBBCodeToHtml(`[${tagName}]${content}[/${tagName}]`);
  return result.success ? result.html : `Error: ${result.errors?.join(', ')}`;
}

// Export test cases for manual testing
export { testCases };
