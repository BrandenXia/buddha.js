import { SlashCommandBuilder } from "discord.js";

import { LotteryLeaderboard } from "@/db";
import logger from "@/logger";
import { getDateStr } from "@/utils";

import type { CmdHandler } from "@/commands";
import type { ChatInputCommandInteraction } from "discord.js";

const handleLottery: CmdHandler = [
  new SlashCommandBuilder().setName("lottery").setDescription("Lottery!"),
  async (interaction) => {
    const num = Math.floor(Math.random() * 1000); // 1/1000 chance of winning
    const win = num === 0;

    if (win)
      (await interaction.reply("Congratulations! You won the lottery!")) &&
        logger.info("Lottery winner!");
    else await interaction.reply("Better luck next time!");

    const [leaderboard] = await LotteryLeaderboard.findOrCreate({
      where: { userId: interaction.user.id, guildId: interaction.guild?.id },
      defaults: { tried: 0, won: 0, lastMessageAt: null },
    });

    await leaderboard.increment({
      tried: 1,
      won: win ? 1 : 0,
    });
    await leaderboard.update({ lastMessageAt: new Date() });
  },
];

const buildLeaderboardEntry = async (
  interaction: ChatInputCommandInteraction,
  entry: LotteryLeaderboard,
  i: number,
) => {
  const username = (
    interaction.guild?.members.cache.get(entry.get("userId") as string) ??
    (await interaction.guild?.members.fetch(entry.get("userId") as string))
  )?.user.tag;
  const won = entry.get("won") as number;
  const tried = entry.get("tried") as number;
  const winRate = (tried > 0 ? (won / tried) * 100 : 0).toFixed(2);
  const lastMessageAt = entry.get("lastMessageAt") as Date;
  const dateStr = lastMessageAt ? getDateStr(lastMessageAt) : "N/A";

  return `${i + 1}. ${username} - ${won} wins / ${tried} tries (${winRate}%) - Last try at: ${dateStr}`;
};

const handleLeaderboard: CmdHandler = [
  new SlashCommandBuilder().setName("leaderboard").setDescription("Lottery leaderboard!"),
  async (interaction) => {
    const leaderboard = await LotteryLeaderboard.findAll({
      where: { guildId: interaction.guild?.id },
      order: [["won", "DESC"]],
      limit: 10,
    });

    const leaderboardStr =
      leaderboard.length > 0
        ? (
            await Promise.all(
              leaderboard.map((entry, i) => buildLeaderboardEntry(interaction, entry, i)),
            )
          ).join("\n")
        : "No entries yet!";

    await interaction.reply(leaderboardStr);
  },
];

export default {
  lottery: handleLottery,
  leaderboard: handleLeaderboard,
};
