import logger from "../logger.ts";
import { LotteryLeaderboard } from "../db.ts";
import type { Message } from "discord.js";

const handleLottery = async (msg: Message) => {
  const num = Math.floor(Math.random() * 1000); // 1/1000 chance of winning
  const win = num === 0;

  if (win)
    (await msg.reply("Congratulations! You won the lottery!")) &&
      logger.info("Lottery winner!");
  else await msg.reply("Better luck next time!");

  const [leaderboard] = await LotteryLeaderboard.findOrCreate({
    where: { userId: msg.author.id, guildId: msg.guild?.id },
    defaults: { tried: 0, won: 0, lastMessageAt: null },
  });

  await leaderboard.increment({
    tried: 1,
    won: win ? 1 : 0,
  });
  await leaderboard.update({ lastMessageAt: new Date() });
};

const buildLeaderboardEntry = async (
  msg: Message,
  entry: LotteryLeaderboard,
  i: number,
) => {
  const username = (
    msg.guild?.members.cache.get(entry.get("userId") as string) ??
    (await msg.guild?.members.fetch(entry.get("userId") as string))
  )?.user.tag;
  const won = entry.get("won") as number;
  const tried = entry.get("tried") as number;
  const winRate = (tried > 0 ? (won / tried) * 100 : 0).toFixed(2);
  const lastMessageAt = entry.get("lastMessageAt") as Date;
  const dateStr = lastMessageAt?.toLocaleString() ?? "N/A";

  return `${i + 1}. ${username} - ${won} wins / ${tried} tries (${winRate}%) - Last try at: ${dateStr}`;
};

const handleLeaderboard = async (msg: Message) => {
  const leaderboard = await LotteryLeaderboard.findAll({
    where: { guildId: msg.guild?.id },
    order: [["won", "DESC"]],
    limit: 10,
  });

  const leaderboardStr =
    leaderboard.length > 0
      ? (
          await Promise.all(
            leaderboard.map((entry, i) => buildLeaderboardEntry(msg, entry, i)),
          )
        ).join("\n")
      : "No entries yet!";

  await msg.reply(leaderboardStr);
};

export default {
  lottery: handleLottery,
  leaderboard: handleLeaderboard,
}
