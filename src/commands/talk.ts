import { SlashCommandBuilder } from "discord.js";

import logger from "@/logger";

import type { CmdHandler } from "@/commands";

const handleTalk: CmdHandler = [
  new SlashCommandBuilder().setName("talk").setDescription("Talk to the bot!"),
  async (interaction) => {
    try {
      const proc = Bun.spawn({ cmd: ["python3", "./data/load_model.py"] });
      await proc.exited;
      
      if (proc.exitCode !== 0) {
        const errorOutput = await new Response(proc.stderr).text();
        logger.error({ exitCode: proc.exitCode, errorOutput }, "Python subprocess failed");
        await interaction.reply("Sorry, I encountered an error while processing your request.");
        return;
      }
      
      const output = await new Response(proc.stdout).text();
      await interaction.reply(output);
    } catch (error) {
      logger.error({ error }, "Error in talk command");
      await interaction.reply("Sorry, I encountered an error while processing your request.");
    }
  },
];

export default {
  talk: handleTalk,
};
