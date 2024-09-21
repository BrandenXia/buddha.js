import type { Message } from "discord.js";
import logger from "./logger.ts";
import lottery from "./commands/lottery.ts";
import crypto from "./commands/crypto.ts";

type CmdHandler = (msg: Message, args: string[]) => Promise<void>;

const commands: {
  [key: string]: string | CmdHandler;
} = {
  ping: "pong",
  ...lottery,
  ...crypto,
};

const handleCommands = async (msg: Message): Promise<boolean> => {
  if (!msg.content.startsWith("!")) return false;

  const [cmd, ...args] = msg.content.slice(1).split(" ");
  logger.debug(`Received command: ${cmd}`);

  if (Object.keys(commands).includes(cmd)) {
    const reaction = commands[cmd];

    if (typeof reaction === "string") await msg.reply(reaction);
    else await (reaction as CmdHandler)(msg, args);
  }

  return true;
};

export default handleCommands;
