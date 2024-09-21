import { CRYPTO_KEY } from "./env.ts";
import crypto from "crypto";

const DICT: {
  [key: string]: string;
} = {
  e: "啰",
  E: "羯",
  t: "婆",
  T: "提",
  a: "摩",
  A: "埵",
  o: "诃",
  O: "迦",
  i: "耶",
  I: "吉",
  n: "娑",
  N: "佛",
  s: "夜",
  S: "驮",
  h: "那",
  H: "谨",
  r: "悉",
  R: "墀",
  d: "阿",
  D: "呼",
  l: "萨",
  L: "尼",
  c: "陀",
  C: "唵",
  u: "唎",
  U: "伊",
  m: "卢",
  M: "喝",
  w: "帝",
  W: "烁",
  f: "醯",
  F: "蒙",
  g: "罚",
  G: "沙",
  y: "嚧",
  Y: "他",
  p: "南",
  P: "豆",
  b: "无",
  B: "孕",
  v: "菩",
  V: "伽",
  k: "怛",
  K: "俱",
  j: "哆",
  J: "度",
  x: "皤",
  X: "阇",
  q: "室",
  Q: "地",
  z: "利",
  Z: "遮",
  "0": "穆",
  "1": "参",
  "2": "舍",
  "3": "苏",
  "4": "钵",
  "5": "曳",
  "6": "数",
  "7": "写",
  "8": "栗",
  "9": "楞",
  "\\": "咩",
  "/": "输",
  "=": "漫",
};

const encrypt = (text: string): string => {
  const key = crypto.createCipher("aes-128-cbc", CRYPTO_KEY);
  key.update(text, "utf8", "hex");
  let res = key.final("hex");

  for (const [k, v] of Object.entries(DICT))
    res = res.replaceAll(k, v);

  return res;
};

const decrypt = (text: string): string => {
  for (const [k, v] of Object.entries(DICT))
    text = text.replaceAll(v, k);

  const key = crypto.createDecipher("aes-128-cbc", CRYPTO_KEY);
  key.update(text, "hex", "utf8");

  return key.final("utf8");
};

export { encrypt, decrypt };
