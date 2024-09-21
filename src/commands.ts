import type { Message } from "discord.js";
import logger from "./logger.ts";
import { decrypt, encrypt } from "./crypto.ts";
import { LotteryLeaderboard } from "./db.ts";

type CmdHandler = (msg: Message, args: string[]) => Promise<void>;

const commands: {
  [key: string]: string | CmdHandler;
} = {
  ping: "pong",
  lottery: async (msg) => {
    const [leaderboard] = await LotteryLeaderboard.findOrCreate({
      where: { userId: msg.author.id, guildId: msg.guild?.id },
      defaults: { tried: 0, won: 0, lastMessageAt: null },
    });

    const num = Math.floor(Math.random() * 1000); // 1/1000 chance of winning
    const win = num === 0;

    if (win)
      (await msg.reply("Congratulations! You won the lottery!")) &&
        logger.info("Lottery winner!");
    else await msg.reply("Better luck next time!");

    await leaderboard.increment({
      tried: 1,
      won: win ? 1 : 0,
      lastMessageAt: new Date(),
    });
  },
  leaderboard: async (msg) => {
    const leaderboard = await LotteryLeaderboard.findAll({
      where: { guildId: msg.guild?.id },
      order: [["won", "DESC"]],
      limit: 10,
    });

    const leaderboardStr =
      leaderboard.length > 0
        ? leaderboard
            .map((entry, i) => {
              const user = msg.guild?.members.cache.get(
                entry.get("userId") as string,
              )?.user;
              return `${i + 1}. ${user?.tag} - ${entry.get("won")} wins / ${entry.get("tried")} tries`;
            })
            .join("\n")
        : "No entries yet!";

    await msg.reply(leaderboardStr);
  },
  encrypt: async (msg, args) => {
    const text = args.join(" ");
    const encrypted = encrypt(text);

    await msg.reply(encrypted);
  },
  decrypt: async (msg, args) => {
    const text = args.join(" ");

    try {
      const decrypted = decrypt(text);
      await msg.reply(decrypted);
    } catch (e) {
      await msg.reply("Invalid encrypted text");
    }
  },
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
