import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

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
    const proc = Bun.spawn({
      cmd: ["git", "log", "-1", "--format=%h%n%s%n%ci"],
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode !== 0)
      await interaction.reply("Failed to get version. Please check the logs for details.");
    else {
      const output = await new Response(proc.stdout).text();
      const [hash, message, date] = output.trim().split("\n");

      const embed = new EmbedBuilder()
        .setTitle("Buddha Version")
        .setDescription(`**${message}**`)
        .addFields(
          {
            name: "Commit",
            value: `[\`${hash}\`](https://github.com/BrandenXia/buddha.js/commit/${hash})`,
            inline: true,
          },
          {
            name: "Updated",
            value: date,
            inline: true,
          },
        )
        .setColor(0x5865f2)
        .setFooter({ text: "Running version" });

      await interaction.reply({ embeds: [embed] });
    }
  },
];

export default { upgrade, version };
