import { readFileSync } from "fs";

const getDateStr = (date: Date) =>
  date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

const hash = (str: string, seed: number = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

const EMOJIS_FILE = "data/emojis.txt";
const emojis = readFileSync(EMOJIS_FILE, "utf-8")
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => line.split(" -> "))
  .map(([original, formatted]) => [formatted, original] as [string, string]);
const emojiMap = new Map<string, string>(emojis);
const formattedEmojiRegex = /(:[a-zA-Z0-9_+-]+:)/g;
const formatEmojis = (text: string) =>
  text.replace(formattedEmojiRegex, (match) => emojiMap.get(match) ?? match);

const originalEmojiRegex = /<a?(:[a-zA-Z0-9_+-]+:)\d{18,}>/g;
const normalizeEmojis = (text: string) => text.replace(originalEmojiRegex, (_, p1) => p1);

export { getDateStr, hash, formatEmojis, normalizeEmojis };
