import { SlashCommandBuilder } from "discord.js";

import type { CmdHandler } from "@/commands";

const handleTalk: CmdHandler = [
  new SlashCommandBuilder().setName("talk").setDescription("Talk to the bot!"),
  async (interaction) => {
    const { stdout } = Bun.spawnSync({ cmd: ["python3", "./data/load_model.py"] });
    await interaction.reply(stdout.toString());
  },
];

export default {
  talk: handleTalk,
};
