# Event Streaming XML Parser

This package utilizes an event streaming parser to quickly and efficiently
process XML files. Some XML files tend to be quite large and many XML tools I
found on npm try to load everything into memory which took too long.

Most of this was cobbled together from
https://github.com/lddubeau/saxes/issues/32#issuecomment-770375996. I've simply
wrapped it up in a package to reuse easier :gift:

## Requirements

- Node.js >= v20
- ESM

## Install

`npm install event-streaming-xml-parser`

## Usage

```js
import { parseXml } from 'event-streaming-xml-parser';

await parseXml({
  filename: 'example.xml',
  listeners: {
    opentag: (tag) => {
      // code here
    },
    text: (text) => {
      // code here
    },
    closetag: (tag) => {
      // code here
    },
    end: () => {
      // code here
    },
  },
});
```

## API

This package exports the primary function `parseXml`, along with various helper
functions for writing new streams `createTagOpenXml`, `createTagCloseXml`,
`escapeXmlElement`, `escapeXmlAttribute`. There is no default export.

### `parseXml(options: ParseXmlFileOptions)`

options

- `filename` (`string`) -- XML file to parse
- `encoding` (`string`, default: `utf8`) -- sets the character encoding for data
  read from the Readable stream
- `listeners` (`ParseXmlFileListeners`) -- event listeners

Returns `Promise<void>`

#### Types

```ts
type ParseXmlFileOptions = {
  filename: string;
  encoding?: BufferEncoding;
  listeners: ParseXmlFileListeners;
};

type ParseXmlFileListeners = {
  opentag?: EmitterListenerOpenTag;
  text?: EmitterListenerText;
  closetag?: EmitterListenerCloseTag;
  end?: EmitterListenerEnd;
};

type EmitterListenerOpenTag = (tag: SaxesTagPlain) => void | Promise<void>;
type EmitterListenerText = (text: string) => void | Promise<void>;
type EmitterListenerCloseTag = (tag: SaxesTagPlain) => void | Promise<void>;
type EmitterListenerEnd = () => void | Promise<void>;
```

## Examples

### Count body tu elements

```js
import { parseXml } from 'event-streaming-xml-parser';

async function countBodyTuElements(filepath) {
  let count = 0;
  let inBody = false;
  await parseXml({
    filename: filepath,
    listeners: {
      opentag: (tag) => {
        if (tag.name === 'body') inBody = true;
        if (tag.name === 'tu' && inBody) count++;
      },
      text: (text) => {},
      closetag: (tag) => {
        if (tag.name === 'body') inBody = false;
      },
      end: () => {},
    },
  });
  return count;
}

const count = await countBodyTuElements('temp/huge.tmx');
console.log(`Total <tu> elements in <body>: ${count}`);
```

### Search and replace within attributes and save as a new file

This example will search for `en-us` in any `xml:lang` or `srclang` attribute,
and replace it with `en-US`. It uses both `escapeXmlElement` and
`escapeXmlAttribute` helper functions for writing to the new output stream.

```js
import fs from 'node:fs';
import {
  parseXml,
  escapeXmlElement,
  escapeXmlAttribute,
} from 'event-streaming-xml-parser';

const outputEncoding = 'utf-8';
const outputStream = fs.createWriteStream('temp/output.xml', {
  flags: 'w',
  outputEncoding,
});
outputStream.write(`<?xml version="1.0" encoding="${outputEncoding}"?>`);

const searchRegExp = new RegExp(`^en-us$`, 'i'); // case insensitive
const attributeNames = ['xml:lang', 'srclang'];

await parseXml({
  filename: 'temp/input.xml',
  listeners: {
    opentag: (tag) => {
      let output = `<${tag.name}`;
      for (const [key, value] of Object.entries(tag.attributes)) {
        let newValue = value;
        if (attributeNames.includes(key)) {
          newValue = value.replace(searchRegExp, `en-US`);
        }
        output += ` ${key}="${escapeXmlAttribute(newValue)}"`;
      }
      if (!tag.isSelfClosing) {
        output += `>`;
      }
      outputStream.write(output);
    },
    text: (text) => {
      outputStream.write(escapeXmlElement(text));
    },
    closetag: (tag) => {
      outputStream.write(tag.isSelfClosing ? `/>` : `</${tag.name}>`);
    },
    end: () => {
      outputStream.close();
    },
  },
});
```
