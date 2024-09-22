import type { CmdHandler } from "../commands.ts";
import { getDateStr, hash } from "../utils.ts";

const fortune: CmdHandler = async (msg) => {
  const day = new Date(getDateStr(new Date())).getDay();
  const hashcode = hash(`${day}${msg.author.id}`);
  const fortune = hashcode % 100;

  await msg.reply(`Your fortune for today is ${fortune}%`);
};

export default { fortune };
