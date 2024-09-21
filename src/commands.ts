import type { Message } from "discord.js";
import logger from "./logger.ts";
import { decrypt, encrypt } from "./crypto.ts";

type CmdHandler = (msg: Message, args: string[]) => Promise<void>;

const commands: {
  [key: string]: string | CmdHandler;
} = {
  ping: "pong",
  lottery: async (msg) => {
    const num = Math.floor(Math.random() * 1000); // 1/1000 chance of winning

    if (num === 0)
      (await msg.reply("Congratulations! You won the lottery!")) &&
        logger.info("Lottery winner!");
    else await msg.reply("Better luck next time!");
  },
  encrypt: async (msg, args) => {
    const text = args.join(" ");
    const encrypted = await encrypt(text);

    await msg.reply(encrypted);
  },
  decrypt: async (msg, args) => {
    const text = args.join(" ");
    const decrypted = await decrypt(text);

    await msg.reply(decrypted);
  },
};

const handleCommands = async (msg: Message) => {
  if (!msg.content.startsWith("!")) return;

  const [cmd, ...args] = msg.content.slice(1).split(" ");
  logger.debug(`Received command: ${cmd}`);

  if (Object.keys(commands).includes(cmd)) {
    const reaction = commands[cmd];

    if (typeof reaction === "string") await msg.reply(reaction);
    else await (reaction as CmdHandler)(msg, args);
  }
};

export default handleCommands;
