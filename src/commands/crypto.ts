import { decrypt, encrypt } from "../crypto.ts";
import type { CmdHandler } from "../commands.ts";
import { SlashCommandBuilder } from "discord.js";

const handleEncrypt: CmdHandler = [
  new SlashCommandBuilder()
    .setName("encrypt")
    .setDescription("Encrypt a message")
    .addStringOption((opt) =>
      opt.setName("text").setDescription("Text to encrypt").setRequired(true),
    ),
  async (interaction) => {
    const text = interaction.options.getString("text", true);
    const encrypted = encrypt(text);

    await interaction.reply(encrypted);
  },
];

const handleDecrypt: CmdHandler = [
  new SlashCommandBuilder()
    .setName("decrypt")
    .setDescription("Decrypt a message")
    .addStringOption((opt) =>
      opt.setName("text").setDescription("Text to decrypt").setRequired(true),
    ),
  async (interaction) => {
    const text = interaction.options.getString("text", true);

    try {
      const decrypted = decrypt(text);
      await interaction.reply(decrypted);
    } catch (e) {
      await interaction.reply("Invalid encrypted text");
    }
  },
];

export default {
  encrypt: handleEncrypt,
  decrypt: handleDecrypt,
};
