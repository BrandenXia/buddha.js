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

export default { upgrade };
