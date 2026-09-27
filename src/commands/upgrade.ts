import { SlashCommandBuilder } from "discord.js";

import type { CmdHandler } from "@/commands";

const upgrade: CmdHandler = [
  new SlashCommandBuilder().setName("upgrade").setDescription("Upgrade the bot!"),
  async (interaction) => {
    const proc = Bun.spawn({ cmd: ["git", "pull"] });
    await proc.exited;

    if (proc.exitCode !== 0)
      await interaction.reply("Upgrade failed. Please check the logs for details.");
    else await interaction.reply("Upgrade successful!");
  },
];

const version: CmdHandler = [
  new SlashCommandBuilder()
    .setName("version")
    .setDescription("Get the current version of the bot."),
  async (interaction) => {
    const proc = Bun.spawn({ cmd: ["git", "log", "-1", "--pretty=format:%h %s (%ci)"] });
    await proc.exited;

    if (proc.exitCode !== 0)
      await interaction.reply("Failed to get version. Please check the logs for details.");
    else await interaction.reply(`Current version: ${proc.stdout.toString()}`);
  },
];

export default { upgrade, version };
