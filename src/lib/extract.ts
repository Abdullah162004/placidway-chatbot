import * as cheerio from 'cheerio';
import type { AnyNode, Element, Text } from 'domhandler';

export interface Section {
  heading: string;
  text: string;
}

export interface Page {
  url: string;
  title: string;
  sections: Section[];
}

const STRIP = 'script,style,noscript,svg,iframe,form,button,nav,header,footer,select,input,textarea,[aria-hidden="true"],[class*="modal"]';
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'main', 'ol', 'p', 'section', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'ul']);
const HEADING = /^h[1-4]$/;

const BOILERPLATE_HEADINGS = /^(follow placidway|about placidway|customize your experience|for providers|the placidway network|language sites|regional hubs|procedure hubs|news & media|consulting|request a video call|confirm your virtual consultation|request your free quote|trusted medical tourism platform|jci|iso|cofepris|turkey moh|dhcc|nabh|korea mohw|location)\b/i;
const NOISE_LINES = /^(chat with center|read more|show more|view more|get (a )?(free )?quote|request a quote|contact (us|center)|book now|share|watch video|play)$/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function tableText($: cheerio.CheerioAPI, table: Element): string {
  return $(table)
    .find('tr')
    .toArray()
    .map((tr) => {
      const cells = $(tr).children('th,td').toArray().map((c) => clean($(c).text())).filter(Boolean);
      return cells.filter((c, i) => c !== cells[i - 1]).join(' | ');
    })
    .filter((row) => row && !NOISE_LINES.test(row))
    .join('\n');
}

export function extractPage(url: string, html: string): Page {
  const $ = cheerio.load(html);
  const title = clean($('h1').first().text()) || clean($('title').text());
  const root = $('main').length ? $('main').first() : $('body');
  root.find(STRIP).remove();

  const sections: Section[] = [];
  let current: Section = { heading: title, text: '' };
  const seen = new Set<string>();

  const titlesOnly: string[] = [];

  const push = (block: string) => {
    for (const raw of block.split('\n')) {
      const text = clean(raw);
      if (!text || NOISE_LINES.test(text) || seen.has(text)) continue;
      seen.add(text);
      current.text += (current.text ? '\n' : '') + text;
    }
  };

  const walk = (node: AnyNode) => {
    if (node.type === 'text') {
      push(clean((node as Text).data));
      return;
    }
    if (node.type !== 'tag') return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (HEADING.test(tag)) {
      if (current.text) sections.push(current);
      else if (current.heading !== title && !BOILERPLATE_HEADINGS.test(current.heading)) titlesOnly.push(current.heading);
      current = { heading: clean($(el).text()), text: '' };
      return;
    }
    if (tag === 'table') {
      push(tableText($, el));
      return;
    }
    const blockChildren = el.children.filter((c) => c.type === 'tag' && BLOCK.has((c as Element).tagName.toLowerCase()));
    if (blockChildren.length === 0) {
      push(clean($(el).text()));
      return;
    }
    for (const child of el.children) walk(child);
  };

  for (const child of root.get(0)?.children ?? []) walk(child);
  if (current.text) sections.push(current);
  if (titlesOnly.length >= 5) sections.push({ heading: `${title}: listed titles`, text: titlesOnly.join('\n') });

  return {
    url,
    title,
    sections: sections.filter((s) => !BOILERPLATE_HEADINGS.test(s.heading) && s.text.length > 40),
  };
}
