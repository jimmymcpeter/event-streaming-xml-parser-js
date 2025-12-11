import fs from 'node:fs';
import { Readable } from 'node:stream';
import Emittery from 'emittery';
import { SaxesParser, SaxesTagPlain } from 'saxes';

export type EmitterListenerOpenTag = (
  tag: SaxesTagPlain
) => void | Promise<void>;
export type EmitterListenerText = (text: string) => void | Promise<void>;
export type EmitterListenerCloseTag = (
  tag: SaxesTagPlain
) => void | Promise<void>;
export type EmitterListenerEnd = () => void | Promise<void>;

export type ParseXmlFileOptions = {
  filename: string;
  encoding?: BufferEncoding;
  listeners: ParseXmlFileListeners;
};

export type ParseXmlFileListeners = {
  opentag?: EmitterListenerOpenTag;
  text?: EmitterListenerText;
  closetag?: EmitterListenerCloseTag;
  end?: EmitterListenerEnd;
};

export async function parseXml(options: ParseXmlFileOptions) {
  const eventEmitter = new Emittery();

  eventEmitter.on('opentag', options.listeners.opentag ?? (() => {}));
  eventEmitter.on('text', options.listeners.text ?? (() => {}));
  eventEmitter.on('closetag', options.listeners.closetag ?? (() => {}));
  eventEmitter.on('end', options.listeners.end ?? (() => {}));

  const readable = fs.createReadStream(options.filename);
  readable.setEncoding(options.encoding || 'utf8'); // Enable string reading mode

  // Read stream chunks
  for await (const saxesEvents of parseChunk(readable) ?? []) {
    // Process batch of events
    for (const saxesEvent of saxesEvents ?? []) {
      // Emit ordered events and process them in the event handlers strictly one-by-one
      // See https://github.com/sindresorhus/emittery#emitserialeventname-data
      await eventEmitter.emitSerial(
        saxesEvent.type,
        saxesEvent.tag || saxesEvent.text
      );
    }
  }
}

interface SaxesEvent {
  type: 'opentag' | 'text' | 'closetag' | 'end';
  tag?: SaxesTagPlain;
  text?: string;
}

// Adapted from https://github.com/lddubeau/saxes/issues/32#issuecomment-770375996
async function* parseChunk(
  iterable: Iterable<string> | Readable
): AsyncGenerator<SaxesEvent[], void, undefined> {
  const saxesParser = new SaxesParser<{}>();
  let error;
  saxesParser.on('error', (_error) => {
    error = _error;
  });

  // As a performance optimization, we gather all events instead of passing
  // them one by one, which would cause each event to go through the event queue
  let events: SaxesEvent[] = [];
  saxesParser.on('opentag', (tag) => {
    events.push({
      type: 'opentag',
      tag,
    });
  });

  saxesParser.on('text', (text) => {
    events.push({
      type: 'text',
      text,
    });
  });

  saxesParser.on('closetag', (tag) => {
    events.push({
      type: 'closetag',
      tag,
    });
  });

  for await (const chunk of iterable) {
    saxesParser.write(chunk as string);
    if (error) {
      throw error;
    }

    yield events;
    events = [];
  }

  yield [
    {
      type: 'end',
    },
  ];
}

/**
 * Helper function to get the XML string representing the opening tag
 */
export function createTagOpenXml(tag: SaxesTagPlain) {
  let output = `<${tag.name}`;
  for (const [key, value] of Object.entries(tag.attributes)) {
    output += ` ${key}="${escapeXmlAttribute(value)}"`;
  }
  if (!tag.isSelfClosing) {
    output += `>`;
  }
  return output;
}

/**
 * Helper function to get the XML string representing the closing tag
 */
export function createTagCloseXml(tag: SaxesTagPlain) {
  const output = tag.isSelfClosing ? `/>` : `</${tag.name}>`;
  return output;
}

/**
 * Helper function to escape XML special characters in element value
 */
export function escapeXmlElement(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Helper function to escape XML special characters in attribute value
 */
export function escapeXmlAttribute(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
