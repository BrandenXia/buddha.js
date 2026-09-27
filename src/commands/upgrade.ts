import { SlashCommandBuilder } from "discord.js";

import type { CmdHandler } from "@/commands";

const upgrade: CmdHandler = [
  new SlashCommandBuilder().setName("upgrade").setDescription("Upgrade the bot!"),
  async (_) => {
    const proc = Bun.spawn({ cmd: ["git", "pull"] });
    await proc.exited;
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
    else {
      const output = await new Response(proc.stdout).text();
      await interaction.reply(`Current version: ${output}`);
    }
  },
];

export default { upgrade, version };
