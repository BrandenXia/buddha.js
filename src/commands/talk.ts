import { SlashCommandBuilder } from "discord.js";

import type { CmdHandler } from "@/commands";

const handleTalk: CmdHandler = [
  new SlashCommandBuilder().setName("talk").setDescription("Talk to the bot!"),
  async (interaction) => {
    const proc = Bun.spawn({ cmd: ["python", "./data/load_model.py"] });
    await proc.exited;
    const output = await new Response(proc.stdout).text();
    await interaction.reply(output);
  },
];

export default {
  talk: handleTalk,
};
