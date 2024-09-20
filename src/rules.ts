import buddhism from "./constants/buddhism.ts";
import math from "./constants/math.ts";
import oes from "./constants/oes.ts";
import type { Message } from "discord.js";

const rules = {
  "(2|two)": buddhism.TWO_TRUTHS,
  "(3|three)": buddhism.THREE_POISONS,
  "(4|four)": buddhism.FOUR_NOBLE_TRUTHS,
  "(5|five)": buddhism.FIVE_AGGREGATES,
  "(6|six)": buddhism.SIX_REALMS,
  "(7|seven)": buddhism.SEVEN_FACTORS_OF_ENLIGHTENMENT,
  "(8|eight)": buddhism.EIGHTFOLD_PATH,
  "(9|nine)": buddhism.NINE_GRADES_OF_SAMADHI,
  "(10|ten)": buddhism.TEN_PARAMITAS,
  "(11|eleven)": buddhism.ELEVEN_WAYS_OF_TRANSFORMING_BODHISATTVA,
  "(12|twelve)": buddhism.TWELVE_LINKS_OF_DEPENDENT_ORIGINATION,
  "(13|thirteen)": buddhism.THIRTEEN_REALMS,
  "[P|p]eano": math.PEANO_AXIOMS,
  "([G|g]owri|[M|m]eda|[C|c]oncept)": math.PEANO_AXIOMS,
  "([J|j]esse|[C|c]hara|640550361853198348)": oes.JESSE,
  "[O|o][E|e][S|s]": oes.OES,
  "[D|d]ustin": oes.DUSTIN_IMAGE,
  "([M|m]c[K|k]ale|[B|b]utler)": oes.BUTLER,
};

const handleRules = async (msg: Message) => {
  for (const [pattern, text] of Object.entries(rules)) {
    if (new RegExp(`\\b${pattern}\\b`, "i").test(msg.content)) {
      let reply: string = "";

      if (Array.isArray(text))
        reply = text[Math.floor(Math.random() * text.length)];
      else reply = text;

      await msg.reply(reply);
    }
  }
};

export default handleRules;
