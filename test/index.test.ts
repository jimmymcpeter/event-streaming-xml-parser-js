import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseXml,
  createTagOpenXml,
  escapeXmlElement,
  escapeXmlAttribute,
} from '../src/index.js';

const TEST_DIR = path.join(import.meta.dirname, 'temp', 'fixtures');

describe('parseXml', () => {
  before(() => {
    // Create test fixtures directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    // Clean up test fixtures
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should parse a simple XML file', async () => {
    const xmlContent = `<?xml version="1.0"?>
<root>
  <item>Hello World</item>
</root>`;
    const testFile = path.join(TEST_DIR, 'simple.xml');
    fs.writeFileSync(testFile, xmlContent);

    const events: any[] = [];

    await parseXml({
      filename: testFile,
      listeners: {
        opentag: (tag) => {
          events.push({ type: 'opentag', name: tag.name });
        },
        text: (text) => {
          const trimmed = text.trim();
          if (trimmed) events.push({ type: 'text', text: trimmed });
        },
        closetag: (tag) => {
          events.push({ type: 'closetag', name: tag.name });
        },
        end: () => {
          events.push({ type: 'end' });
        },
      },
    });

    assert.deepStrictEqual(events, [
      { type: 'opentag', name: 'root' },
      { type: 'opentag', name: 'item' },
      { type: 'text', text: 'Hello World' },
      { type: 'closetag', name: 'item' },
      { type: 'closetag', name: 'root' },
      { type: 'end' },
    ]);
  });

  it('should parse XML with attributes', async () => {
    const xmlContent = `<?xml version="1.0"?>
<root version="1.0" hello="world">
  <item id="123" type="test">Content</item>
</root>`;
    const testFile = path.join(TEST_DIR, 'attributes.xml');
    fs.writeFileSync(testFile, xmlContent);

    const tags: any[] = [];

    await parseXml({
      filename: testFile,
      listeners: {
        opentag: (tag) => {
          tags.push({
            name: tag.name,
            attributes: tag.attributes,
          });
        },
        text: () => {},
        closetag: () => {},
        end: () => {},
      },
    });

    assert.strictEqual(tags[0].name, 'root');
    assert.strictEqual(tags[0].attributes.version, '1.0');
    assert.strictEqual(tags[0].attributes.hello, 'world');

    assert.strictEqual(tags[1].name, 'item');
    assert.strictEqual(tags[1].attributes.id, '123');
    assert.strictEqual(tags[1].attributes.type, 'test');
  });

  it('should parse nested XML structure in order', async () => {
    const xmlContent = `<?xml version="1.0"?>
<catalog>
  <book>
    <title>Test Book</title>
    <author>John Doe</author>
  </book>
</catalog>`;
    const testFile = path.join(TEST_DIR, 'nested.xml');
    fs.writeFileSync(testFile, xmlContent);

    const structure: string[] = [];

    await parseXml({
      filename: testFile,
      listeners: {
        opentag: (tag) => {
          structure.push(`open:${tag.name}`);
        },
        text: (text) => {
          const trimmed = text.trim();
          if (trimmed) structure.push(`text:${trimmed}`);
        },
        closetag: (tag) => {
          structure.push(`close:${tag.name}`);
        },
        end: () => {
          structure.push('end');
        },
      },
    });

    assert.deepStrictEqual(structure, [
      'open:catalog',
      'open:book',
      'open:title',
      'text:Test Book',
      'close:title',
      'open:author',
      'text:John Doe',
      'close:author',
      'close:book',
      'close:catalog',
      'end',
    ]);
  });

  it('should handle self-closing tags', async () => {
    const xmlContent = `<?xml version="1.0"?>
<root>
  <item id="1" />
  <item id="2"/>
</root>`;
    const testFile = path.join(TEST_DIR, 'self-closing.xml');
    fs.writeFileSync(testFile, xmlContent);

    const tags: any[] = [];

    await parseXml({
      filename: testFile,
      listeners: {
        opentag: (tag) => {
          tags.push({
            name: tag.name,
            isSelfClosing: tag.isSelfClosing,
            attributes: tag.attributes,
          });
        },
        text: () => {},
        closetag: () => {},
        end: () => {},
      },
    });

    assert.strictEqual(tags.length, 3);
    assert.strictEqual(tags[0].name, 'root');
    assert.strictEqual(tags[0].isSelfClosing, false);

    assert.strictEqual(tags[1].name, 'item');
    assert.strictEqual(tags[1].isSelfClosing, true);
    assert.strictEqual(tags[1].attributes.id, '1');

    assert.strictEqual(tags[2].name, 'item');
    assert.strictEqual(tags[2].isSelfClosing, true);
    assert.strictEqual(tags[2].attributes.id, '2');
  });

  it('should handle large XML files with streaming', async () => {
    // Create a large XML file
    const testFile = path.join(TEST_DIR, 'large.xml');
    const writeStream = fs.createWriteStream(testFile);
    const totalCount = 100000;

    writeStream.write('<?xml version="1.0"?>\n<items>\n');
    for (let i = 0; i < totalCount; i++) {
      writeStream.write(`  <item id="${i}">Content ${i}</item>\n`);
    }
    writeStream.write('</items>');
    writeStream.end();

    await new Promise<void>((resolve) => writeStream.on('finish', resolve));

    let itemCount = 0;
    let textCount = 0;

    await parseXml({
      filename: testFile,
      listeners: {
        opentag: (tag) => {
          if (tag.name === 'item') itemCount++;
        },
        text: (text) => {
          if (text.trim().startsWith('Content')) textCount++;
        },
        closetag: () => {},
        end: () => {},
      },
    });

    assert.strictEqual(itemCount, totalCount);
    assert.strictEqual(textCount, totalCount);
  });

  it('should decode special characters in text content', async () => {
    const xmlContent = `<?xml version="1.0"?>
<root>
  <item>&lt;special&gt; &amp; &quot;characters&quot;</item>
</root>`;
    const testFile = path.join(TEST_DIR, 'special-chars.xml');
    fs.writeFileSync(testFile, xmlContent);

    let textContent = '';

    await parseXml({
      filename: testFile,
      listeners: {
        opentag: () => {},
        text: (text) => {
          const trimmed = text.trim();
          if (trimmed) textContent = trimmed;
        },
        closetag: () => {},
        end: () => {},
      },
    });

    assert.strictEqual(textContent, '<special> & "characters"');
  });

  it('should support custom encoding', async () => {
    const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <item>Hello 世界 🌍</item>
</root>`;
    const testFile = path.join(TEST_DIR, 'encoding.xml');
    fs.writeFileSync(testFile, xmlContent, 'utf8');

    let textContent = '';

    await parseXml({
      filename: testFile,
      encoding: 'utf8',
      listeners: {
        opentag: () => {},
        text: (text) => {
          const trimmed = text.trim();
          if (trimmed) textContent = trimmed;
        },
        closetag: () => {},
        end: () => {},
      },
    });

    assert.strictEqual(textContent, 'Hello 世界 🌍');
  });

  it('should process events serially in order', async () => {
    const xmlContent = `<?xml version="1.0"?>
<root>
  <a>1</a>
  <b>2</b>
  <c>3</c>
</root>`;
    const testFile = path.join(TEST_DIR, 'serial.xml');
    fs.writeFileSync(testFile, xmlContent);

    const order: string[] = [];

    await parseXml({
      filename: testFile,
      listeners: {
        opentag: async (tag) => {
          order.push(`open:${tag.name}`);
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 1));
        },
        text: async (text) => {
          const trimmed = text.trim();
          if (trimmed) {
            order.push(`text:${trimmed}`);
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
        },
        closetag: async (tag) => {
          order.push(`close:${tag.name}`);
          await new Promise((resolve) => setTimeout(resolve, 1));
        },
        end: () => {
          order.push('end');
        },
      },
    });

    // Verify events are processed in strict order
    assert.deepStrictEqual(order, [
      'open:root',
      'open:a',
      'text:1',
      'close:a',
      'open:b',
      'text:2',
      'close:b',
      'open:c',
      'text:3',
      'close:c',
      'close:root',
      'end',
    ]);
  });
});

describe('createTagOpenXml', () => {
  it('should create opening tag without attributes', () => {
    const tag = {
      name: 'div',
      attributes: {},
      isSelfClosing: false,
    };

    const result = createTagOpenXml(tag);
    assert.strictEqual(result, '<div>');
  });

  it('should create opening tag with attributes', () => {
    const tag = {
      name: 'div',
      attributes: {
        id: 'test',
        class: 'container',
      },
      isSelfClosing: false,
    };

    const result = createTagOpenXml(tag);
    assert.strictEqual(result, '<div id="test" class="container">');
  });

  it('should handle self-closing tags', () => {
    const tag = {
      name: 'img',
      attributes: {
        src: 'image.jpg',
        alt: 'Test',
      },
      isSelfClosing: true,
    };

    const result = createTagOpenXml(tag);
    assert.strictEqual(result, '<img src="image.jpg" alt="Test"');
  });

  it('should escape special characters in attributes', () => {
    const tag = {
      name: 'div',
      attributes: {
        title: 'Test "quoted" & <special>',
      },
      isSelfClosing: false,
    };

    const result = createTagOpenXml(tag);
    assert.strictEqual(
      result,
      '<div title="Test &quot;quoted&quot; &amp; &lt;special&gt;">'
    );
  });
});

describe('escapeXmlElement', () => {
  it('should escape ampersand', () => {
    assert.strictEqual(escapeXmlElement('Tom & Jerry'), 'Tom &amp; Jerry');
  });

  it('should escape less than', () => {
    assert.strictEqual(escapeXmlElement('x < y'), 'x &lt; y');
  });

  it('should escape greater than', () => {
    assert.strictEqual(escapeXmlElement('x > y'), 'x &gt; y');
  });

  it('should escape multiple special characters', () => {
    assert.strictEqual(
      escapeXmlElement('<tag> & </tag>'),
      '&lt;tag&gt; &amp; &lt;/tag&gt;'
    );
  });

  it('should not escape quotes in element content', () => {
    assert.strictEqual(escapeXmlElement('Say "hello"'), 'Say "hello"');
  });

  it('should handle empty string', () => {
    assert.strictEqual(escapeXmlElement(''), '');
  });

  it('should handle string without special characters', () => {
    assert.strictEqual(escapeXmlElement('Hello World'), 'Hello World');
  });
});

describe('escapeXmlAttribute', () => {
  it('should escape ampersand', () => {
    assert.strictEqual(escapeXmlAttribute('Tom & Jerry'), 'Tom &amp; Jerry');
  });

  it('should escape less than', () => {
    assert.strictEqual(escapeXmlAttribute('x < y'), 'x &lt; y');
  });

  it('should escape greater than', () => {
    assert.strictEqual(escapeXmlAttribute('x > y'), 'x &gt; y');
  });

  it('should escape double quotes', () => {
    assert.strictEqual(
      escapeXmlAttribute('Say "hello"'),
      'Say &quot;hello&quot;'
    );
  });

  it('should escape single quotes', () => {
    assert.strictEqual(escapeXmlAttribute("It's fine"), 'It&apos;s fine');
  });

  it('should escape all special characters', () => {
    assert.strictEqual(
      escapeXmlAttribute(`<tag attr="value" other='val'> & text`),
      '&lt;tag attr=&quot;value&quot; other=&apos;val&apos;&gt; &amp; text'
    );
  });

  it('should handle empty string', () => {
    assert.strictEqual(escapeXmlAttribute(''), '');
  });

  it('should handle string without special characters', () => {
    assert.strictEqual(escapeXmlAttribute('Hello World'), 'Hello World');
  });
});
