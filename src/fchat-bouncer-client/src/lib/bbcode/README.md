# BBCode Implementation Documentation

This document describes the complete BBCode implementation for F-ChatBouncer, based on the [F-List BBCode reference](https://wiki.f-list.net/List_of_BBCode_tags).

## Supported BBCode Tags

### Text Formatting

| Tag | Description | Example | HTML Output |
|-----|-------------|---------|-------------|
| `[b]` | **Bold text** | `[b]Bold[/b]` | `<strong>Bold</strong>` |
| `[i]` | *Italic text* | `[i]Italic[/i]` | `<em>Italic</em>` |
| `[u]` | <u>Underlined text</u> | `[u]Underlined[/u]` | `<u>Underlined</u>` |
| `[s]` | ~~Strikethrough text~~ | `[s]Strikethrough[/s]` | `<del>Strikethrough</del>` |
| `[big]` | Enlarged text | `[big]Big[/big]` | `<span style="font-size: 1.2em;">Big</span>` |
| `[small]` | Reduced text | `[small]Small[/small]` | `<span style="font-size: 0.8em;">Small</span>` |
| `[sup]` | Superscript text | `[sup]Superscript[/sup]` | `<sup>Superscript</sup>` |
| `[sub]` | Subscript text | `[sub]Subscript[/sub]` | `<sub>Subscript</sub>` |
| `[color]` | Colored text | `[color=red]Red text[/color]` | `<span style="color: red;">Red text</span>` |

#### Supported Colors
The `[color]` tag supports the following F-List colors:
- `red`, `blue`, `white`, `yellow`, `pink`, `gray`, `green`
- `orange`, `purple`, `black`, `brown`, `cyan`

### Layout Control

| Tag | Description | Example | HTML Output |
|-----|-------------|---------|-------------|
| `[heading]` | Heading text | `[heading]Title[/heading]` | `<div style="font-size: 1.3em; font-weight: bold; color: #0066cc;">Title</div>` |
| `[indent]` | Indented text | `[indent]Indented[/indent]` | `<div style="margin-left: 40px;">Indented</div>` |
| `[justify]` | Justified text | `[justify]Justified[/justify]` | `<div style="text-align: justify;">Justified</div>` |
| `[left]` | Left-aligned text | `[left]Left[/left]` | `<div style="text-align: left;">Left</div>` |
| `[center]` | Center-aligned text | `[center]Center[/center]` | `<div style="text-align: center;">Center</div>` |
| `[right]` | Right-aligned text | `[right]Right[/right]` | `<div style="text-align: right;">Right</div>` |
| `[hr]` | Horizontal rule | `[hr]` | `<hr style="border-top: 1px solid #ccc;" />` |

### Interactive Elements

| Tag | Description | Example | Behavior |
|-----|-------------|---------|----------|
| `[spoiler]` | Click-to-reveal content | `[spoiler]Hidden text[/spoiler]` | Shows "Click here for spoiler" button, reveals content on click |
| `[collapse]` | Collapsible section | `[collapse=Title]Content[/collapse]` | Shows collapsible section with custom header |
| `[quote]` | Quoted text block | `[quote]Quoted text[/quote]` | Displays text in a styled quote box |

### Links and References

| Tag | Description | Example | HTML Output |
|-----|-------------|---------|-------------|
| `[url]` | Hyperlink | `[url=https://example.com]Link[/url]` | `<a href="https://example.com">Link</a>` with preview |
| `[user]` | User profile link | `[user]Username[/user]` | `<a href="https://www.f-list.net/c/Username">• Username</a>` |
| `[icon]` | User avatar | `[icon]Username[/icon]` | `<img src="https://static.f-list.net/images/avatar/Username.png" />` |
| `[eicon]` | Extended icon | `[eicon]icon-name[/eicon]` | `<img src="https://static.f-list.net/images/eicon/icon-name.gif" />` |

### Special Tags

| Tag | Description | Example | Behavior |
|-----|-------------|---------|----------|
| `[noparse]` | Prevent BBCode parsing | `[noparse][b]Not bold[/b][/noparse]` | Displays BBCode tags as literal text |

## Features

### Security
- **HTML Sanitization**: All content is sanitized using the `he` library to prevent XSS attacks
- **URL Validation**: URLs are validated to ensure they use safe protocols (http/https)
- **Input Cleaning**: Usernames and icon names are cleaned to prevent path traversal attacks

### Nested Tags
The parser supports nested BBCode tags:
```
[b][i][color=red]Bold italic red text[/color][/i][/b]
```
Results in: **<em><span style="color: red;">Bold italic red text</span></em>**

### Self-Closing Tags
Some tags are self-closing and don't require closing tags:
- `[hr]` - Horizontal rule

### Interactive Elements
- **Spoilers**: Click-to-reveal functionality with unique IDs for each instance
- **Collapse**: Expandable sections with custom headers
- **URL Previews**: Automatic preview generation for links

### Error Handling
- Invalid BBCode tags are left as-is in the output
- Invalid colors fall back to displaying the original BBCode
- Malformed tags are handled gracefully without breaking the parser

## Usage

### Basic Parsing
```typescript
import { parseBBCodeToHtml } from './lib/bbcode/parser';

const result = parseBBCodeToHtml('[b]Hello[/b] [color=red]World[/color]!');
console.log(result.html); // <strong>Hello</strong> <span style="color: red;">World</span>!
console.log(result.success); // true
```

### HTML to BBCode Conversion
```typescript
import { parseHtmlToBBCode } from './lib/bbcode/parser';

const bbcode = parseHtmlToBBCode('<strong>Bold</strong> <em>italic</em>');
console.log(bbcode); // [b]Bold[/b] [i]italic[/i]
```

### Testing
```typescript
import { runBBCodeTests } from './lib/bbcode/test';

const results = runBBCodeTests();
console.log(`Passed: ${results.passed}, Failed: ${results.failed}`);
```

## Implementation Details

### Tag Registry
All BBCode tags are registered in the `BBCodeTagRegistry` class, which provides:
- Tag registration and retrieval
- Validation of tag names
- Support for custom tag implementations

### Parser Architecture
The parser uses a stack-based approach to handle nested tags:
1. Find all opening and closing tags
2. Match them using a stack to handle nesting
3. Process tags from innermost to outermost
4. Handle self-closing tags separately

### Preview System
URLs are processed through a preview system that:
- Generates appropriate previews for different URL types
- Supports images, Discord links, and F-List links
- Falls back gracefully for unsupported URLs

## Browser Compatibility

The implementation uses modern JavaScript features and CSS:
- ES6+ features (arrow functions, template literals, etc.)
- CSS3 properties (flexbox, transitions, etc.)
- Modern DOM APIs

For older browser support, consider adding polyfills for:
- `Array.from()`
- `String.includes()`
- CSS Grid/Flexbox

## Performance Considerations

- Tags are processed in a single pass for efficiency
- HTML sanitization is performed only when necessary
- Preview generation is lazy-loaded
- Interactive elements use unique IDs to prevent conflicts

## Future Enhancements

Potential improvements for future versions:
- Custom CSS themes for different tag styles
- Additional preview types (YouTube, Twitter, etc.)
- BBCode editor with live preview
- Export/import functionality for BBCode templates
- Accessibility improvements for screen readers
