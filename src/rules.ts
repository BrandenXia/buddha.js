import type { Message } from "discord.js";
import { Rules } from "./db.ts";

const handleRules = async (msg: Message) => {
  const rules = await Rules.findAll();
  const matches = rules.filter((rule) =>
    RegExp(rule.get("regex") as string, "i").test(msg.content),
  );
  const reaction = matches[Math.floor(Math.random() * matches.length)];
  await msg.reply(reaction.get("reaction") as string);
};

export default handleRules;
