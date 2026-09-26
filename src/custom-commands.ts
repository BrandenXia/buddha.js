import { REST, Routes, SlashCommandBuilder } from "discord.js";

import { CustomCommand } from "@/db";
import logger from "@/logger";
import { executeSandbox } from "@/sandbox";

import type { SandboxLanguage } from "@/sandbox";
import type { ChatInputCommandInteraction } from "discord.js";

const RESERVED_COMMAND_NAMES = new Set([
  "custom-command",
  "decrypt",
  "encrypt",
  "fortune",
  "leaderboard",
  "lottery",
  "rule",
  "talk",
]);

const CUSTOM_COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;

const getString = (command: CustomCommand, key: string) => command.get(key) as string;

const buildCustomCommand = (command: CustomCommand) =>
  new SlashCommandBuilder()
    .setName(getString(command, "name"))
    .setDescription(getString(command, "description"))
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName("input").setDescription("Text to pass to the command").setMaxLength(1_000),
    );

const validateCustomCommandName = (name: string) => {
  if (!CUSTOM_COMMAND_NAME.test(name))
    return "Names must be 1–32 lowercase letters, numbers, hyphens, or underscores.";
  if (RESERVED_COMMAND_NAMES.has(name)) return `/${name} is a built-in command.`;
  return null;
};

const handleCustomCommand = async (interaction: ChatInputCommandInteraction) => {
  if (!interaction.guildId) return false;

  const command = await CustomCommand.findOne({
    where: { guildId: interaction.guildId, name: interaction.commandName },
  });
  if (!command) return false;

  await interaction.deferReply();
  const result = await executeSandbox(
    getString(command, "language") as SandboxLanguage,
    getString(command, "code"),
    {
      input: interaction.options.getString("input") ?? "",
      user_name: interaction.user.displayName,
    },
  );

  if (result.ok)
    await interaction.editReply({
      content: result.output,
      allowedMentions: { parse: [] },
    });
  else {
    logger.warn(
      {
        guildId: interaction.guildId,
        commandName: interaction.commandName,
        error: result.error,
      },
      "Custom command failed",
    );
    await interaction.editReply({
      content: `Command failed: ${result.error}`,
      allowedMentions: { parse: [] },
    });
  }

  return true;
};

const syncCustomCommands = async (rest: REST, clientId: string) => {
  const commands = await CustomCommand.findAll({ order: [["id", "ASC"]] });
  const byGuild = new Map<string, CustomCommand[]>();

  for (const command of commands) {
    const guildId = getString(command, "guildId");
    const guildCommands = byGuild.get(guildId) ?? [];
    guildCommands.push(command);
    byGuild.set(guildId, guildCommands);
  }

  for (const [guildId, guildCommands] of byGuild) {
    try {
      const registered = (await rest.get(Routes.applicationGuildCommands(clientId, guildId))) as {
        id: string;
        name: string;
      }[];

      for (const command of guildCommands) {
        const commandId = command.get("commandId") as string | null;
        const match = registered.find(
          (registeredCommand) =>
            registeredCommand.id === commandId ||
            registeredCommand.name === getString(command, "name"),
        );
        const body = buildCustomCommand(command).toJSON();
        const saved = match
          ? ((await rest.patch(Routes.applicationGuildCommand(clientId, guildId, match.id), {
              body,
            })) as { id: string })
          : ((await rest.post(Routes.applicationGuildCommands(clientId, guildId), {
              body,
            })) as { id: string });
        await command.update({ commandId: saved.id });
      }
    } catch (error) {
      logger.error({ error, guildId }, "Failed to synchronize custom commands for guild");
    }
  }
};

export { buildCustomCommand, handleCustomCommand, syncCustomCommands, validateCustomCommandName };
