import buddhism from "./constants/buddhism.ts";
import math from "./constants/math.ts";
import oes from "./constants/oes.ts";
import type { Message } from "discord.js";
import macbeth from "./constants/macbeth.ts";
import logger from "./logger.ts";
import memes from "./constants/memes.ts";

const rules = {
  "(2|two)": buddhism.TWO_TRUTHS,
  "(3|three)": buddhism.THREE_POISONS,
  "(4|four)": buddhism.FOUR_NOBLE_TRUTHS,
  "(5|five)": [buddhism.FIVE_AGGREGATES, buddhism.FIVE_DUSTS],
  "(6|six)": buddhism.SIX_REALMS,
  "(7|seven)": buddhism.SEVEN_FACTORS_OF_ENLIGHTENMENT,
  "(8|eight)": buddhism.EIGHTFOLD_PATH,
  "(9|nine)": buddhism.NINE_GRADES_OF_SAMADHI,
  "(10|ten)": buddhism.TEN_PARAMITAS,
  "(11|eleven)": buddhism.ELEVEN_WAYS_OF_TRANSFORMING_BODHISATTVA,
  "(12|twelve)": buddhism.TWELVE_LINKS_OF_DEPENDENT_ORIGINATION,
  "(13|thirteen)": buddhism.THIRTEEN_REALMS,
  Peano: math.PEANO_AXIOMS,
  "(Gowri|Meda|concept)": math.PEANO_AXIOMS,
  "(Jesse|Chara|640550361853198348)": oes.JESSE,
  OES: oes.OES,
  Dustin: oes.DUSTIN_IMG,
  "(McKale|Butler)": oes.BUTLER,
  shit: "我爱吃屎",
  "energy ?bubble": oes.PASSWORDS,
  macbeth: macbeth.TO_BE_THUS,
  banquo: macbeth.THOU_HAST_IT_NOW,
  man: memes.WHAT_CAN_I_SAY,
  mamba: memes.KOBE,
  "what can i say": memes.MAMBA_OUT,
  kobe: memes.KOBE,
  god: oes.DOG_IMG,
  richard: oes.RICHARD,
  genshin: memes.GENSHIN,
  "原神": memes.GENSHIN,
};

const handleRules = async (msg: Message) => {
  for (const [pattern, text] of Object.entries(rules)) {
    if (new RegExp(`\\b${pattern}\\b`, "i").test(msg.content)) {
      logger.debug(`Pattern ${pattern} matched`);

      let reply: string = "";

      if (Array.isArray(text))
        reply = text[Math.floor(Math.random() * text.length)];
      else reply = text;

      await msg.reply(reply);
    }
  }
};

export default handleRules;
