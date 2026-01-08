import { Rules } from "@/db.ts";

import type { Message } from "discord.js";

const handleRules = async (msg: Message) => {
  const rules = await Rules.findAll();
  const matches = rules.filter((rule) =>
    RegExp(rule.get("regex") as string, "i").test(msg.content),
  );
  if (matches.length === 0) return;

  const reaction = matches[Math.floor(Math.random() * matches.length)];
  const reactionStr = (reaction.get("reaction") as string).replaceAll(
    "{msg_username}",
    msg.author.displayName,
  );
  await msg.reply(reactionStr);
};

export default handleRules;
