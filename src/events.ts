import { type ClientEvents, Events } from "discord.js";
import client from "./client.ts";
import buddhism from "./buddhism.ts";
import math from "./math.ts";
import oes from "./oes.ts";

const reactions = {
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
  "([G|g]owri|[M|m]eda)": math.PEANO_AXIOMS.join("\n"),
  "([J|j]esse|[C|c]hara)": oes.JESSE_ESCAPE,
};

export default {
  [Events.ClientReady]: () => console.log(`Logged in as ${client.user?.tag}!`),
  [Events.MessageCreate]: async (message) => {
    if (message.author.bot) return;

    for (const [pattern, text] of Object.entries(reactions)) {
      if (new RegExp(`\\b${pattern}\\b`, "i").test(message.content)) {
        let reply: string = "";

        if (Array.isArray(text)) reply = text[Math.floor(Math.random() * text.length)];
        else reply = text;

        await message.reply(reply);
      }
    }
  },
} satisfies {
  [E in keyof ClientEvents]?: (...args: ClientEvents[E]) => void;
};
