import buddhism from "./constants/buddhism.ts";
import math from "./constants/math.ts";
import oes from "./constants/oes.ts";
import type { Message } from "discord.js";
import macbeth from "./constants/macbeth.ts";
import memes from "./constants/memes.ts";

const rules: [RegExp, string | string[]][] = [
  [/\b(2|two)\b/i, buddhism.TWO_TRUTHS],
  [/\b(3|three)\b/i, buddhism.THREE_POISONS],
  [/\b(4|four)\b/i, buddhism.FOUR_NOBLE_TRUTHS],
  [/\b(5|five)\b/i, [buddhism.FIVE_AGGREGATES, buddhism.FIVE_DUSTS]],
  [/\b(6|six)\b/i, buddhism.SIX_REALMS],
  [/\b(7|seven)\b/i, buddhism.SEVEN_FACTORS_OF_ENLIGHTENMENT],
  [/\b(8|eight)\b/i, buddhism.EIGHTFOLD_PATH],
  [/\b(9|nine)\b/i, buddhism.NINE_GRADES_OF_SAMADHI],
  [/\b(10|ten)\b/i, buddhism.TEN_PARAMITAS],
  [/\b(11|eleven)\b/i, buddhism.ELEVEN_WAYS_OF_TRANSFORMING_BODHISATTVA],
  [/\b(12|twelve)\b/i, buddhism.TWELVE_LINKS_OF_DEPENDENT_ORIGINATION],
  [/\b(13|thirteen)\b/i, buddhism.THIRTEEN_REALMS],
  [/\b(18|eighteen)\b/i, buddhism.EIGHTEEN_REALMS_OF_PHENOMENA],
  [/\b(buddha|buddhism)\b/i, Object.values(buddhism)],
  [/\b(Gowri|Meda|concept|Peano)\b/i, math.PEANO_AXIOMS],
  [/\b(Jesse|Chara|640550361853198348)\b/i, oes.JESSE],
  [/\bOES\b/i, oes.OES],
  [/\bDustin\b/i, oes.DUSTIN_IMG],
  [/\b(McKale|Butler)\b/i, oes.BUTLER],
  [/\bshits?\b/i, oes.EAT_SHIT],
  [/屎/, oes.EAT_SHIT],
  [/\benergy( +)?bubble\b/i, oes.PASSWORDS],
  [/\bmacbeth\b/i, macbeth.TO_BE_THUS],
  [/\bbanquo\b/i, macbeth.THOU_HAST_IT_NOW],
  [/\bman\b/i, memes.WHAT_CAN_I_SAY],
  [/\b(mamba|kobe)\b/i, memes.KOBE],
  [/坠机|肘击|科比/, memes.KOBE],
  [/\bwhat( +)?can( +)?i( +)?say\b/i, memes.MAMBA_OUT],
  [/\bgod\b/i, oes.DOG_IMG],
  [/\brichard\b/i, oes.RICHARD],
  [/\bgenshin\b/i, memes.GENSHIN],
  [/原神/, memes.GENSHIN],
  [/\b(bad|sad|unfortunate)\b/i, memes.BETTER_LUCK_NEXT_TIME],
  [/惨/, memes.BETTER_LUCK_NEXT_TIME],
  [/\bcoconut\b/i, memes.COCONUT],
  [/椰子/, memes.COCONUT],
  [/\bHungry( +)?Ghosts?\b/i, memes.HUNGRY_CAT],
  [/\bHell( +)?Beings?\b/i, oes.EAT_SHIT],
  [/\b724690248600256553\b/i, memes.BARK],
  [/\botto\b/i, memes.OTTO],
  [/轮椅|:wheelchair:/, memes.OTTO],
];

const handleRules = async (msg: Message) => {
  const matched = rules.find(([regex]) => regex.test(msg.content));
  if (!matched) return;

  let reply: string;
  const reaction = matched[1];

  if (Array.isArray(reaction))
    reply = reaction[Math.floor(Math.random() * reaction.length)];
  else reply = reaction;

  await msg.reply(reply);
};

export default handleRules;
