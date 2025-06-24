import { SlashCommandBuilder } from "discord.js";
import type { CmdHandler } from "../commands.ts";
import { getDateStr, hash } from "../utils.ts";

const fortune: CmdHandler = [
  new SlashCommandBuilder()
    .setName("fortune")
    .setDescription("Get your fortune for today!"),
  async (interaction) => {
    const day = new Date(getDateStr(new Date())).getDay();
    const hashcode = hash(`${day}${interaction.user.id}`);
    const fortune = hashcode % 100;

    await interaction.reply(`Your fortune for today is ${fortune}%`);
  },
];

export default { fortune };
