import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { UniqueConstraintError } from "sequelize";

import {
  createCustomCommand,
  parseCustomCommandParameters,
  validateCustomCommandName,
} from "@/custom-commands";
import { CustomCommand, CustomCommandParameter } from "@/db";
import logger from "@/logger";
import { validateSandboxSource } from "@/sandbox";

import type { CmdHandler } from "@/commands";
import type { CustomCommandParameterDefinition } from "@/custom-commands";
import type { SandboxLanguage } from "@/sandbox";

const managementCommand: CmdHandler = [
  new SlashCommandBuilder()
    .setName("custom-command")
    .setDescription("Manage this server's sandboxed custom commands")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a sandboxed command")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Lowercase command name without the slash")
            .setMinLength(1)
            .setMaxLength(32)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Description shown in Discord")
            .setMinLength(1)
            .setMaxLength(100)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("language")
            .setDescription("Sandbox language")
            .addChoices(
              { name: "JavaScript", value: "javascript" },
              { name: "Python", value: "python" },
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("code")
            .setDescription("Code using arguments, input, user_name, and print()")
            .setMinLength(1)
            .setMaxLength(4_000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("parameters")
            .setDescription("Comma-separated names; add ? for optional (topic,count?)")
            .setMaxLength(400),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a custom command")
        .addStringOption((option) =>
          option.setName("name").setDescription("Command name").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List this server's custom commands")
        .addIntegerOption((option) =>
          option.setName("page").setDescription("Page number").setMinValue(1),
        ),
    ),
  async (interaction) => {
    if (
      !interaction.inGuild() ||
      !interaction.guild ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: "You need the Manage Server permission to manage custom commands.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      const name = interaction.options.getString("name", true);
      const nameError = validateCustomCommandName(name);
      if (nameError) {
        await interaction.editReply(nameError);
        return;
      }

      const code = interaction.options.getString("code", true);
      const language = interaction.options.getString("language", true) as SandboxLanguage;
      const parsedParameters = parseCustomCommandParameters(
        interaction.options.getString("parameters"),
      );
      if (!parsedParameters.ok) {
        await interaction.editReply(`Parameters rejected: ${parsedParameters.error}`);
        return;
      }

      const validation = await validateSandboxSource(
        language,
        code,
        parsedParameters.parameters.map((parameter) => parameter.name),
      );
      if (!validation.ok) {
        await interaction.editReply(`Code rejected: ${validation.error}`);
        return;
      }

      try {
        await createCustomCommand({
          guild: interaction.guild,
          createdBy: interaction.user.id,
          name,
          description: interaction.options.getString("description", true),
          language,
          code,
          parameters: parsedParameters.parameters,
        });
        await interaction.editReply(`Created /${name}.`);
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          await interaction.editReply(`/${name} already exists in this server.`);
          return;
        }
        logger.error({ error, guildId: interaction.guildId, name }, "Failed to create command");
        await interaction.editReply("Discord could not create that command. No code was saved.");
      }
      return;
    }

    if (subcommand === "delete") {
      const name = interaction.options.getString("name", true);
      const record = await CustomCommand.findOne({
        where: { guildId: interaction.guildId, name },
      });
      if (!record) {
        await interaction.editReply(`/${name} does not exist in this server.`);
        return;
      }

      try {
        const registered = await interaction.guild.commands.fetch();
        const commandId = record.get("commandId") as string | null;
        const match = registered.find(
          (command) => command.id === commandId || command.name === name,
        );
        if (match) await match.delete();
        await CustomCommandParameter.destroy({
          where: { customCommandId: record.get("id") as number },
        });
        await record.destroy();
        await interaction.editReply(`Deleted /${name}.`);
      } catch (error) {
        logger.error({ error, guildId: interaction.guildId, name }, "Failed to delete command");
        await interaction.editReply("Discord could not delete that command. Please try again.");
      }
      return;
    }

    const page = interaction.options.getInteger("page") ?? 1;
    const commands = await CustomCommand.findAll({
      where: { guildId: interaction.guildId },
      order: [["name", "ASC"]],
      limit: 20,
      offset: (page - 1) * 20,
    });
    const parametersByCommand = new Map<number, CustomCommandParameterDefinition[]>();
    await Promise.all(
      commands.map(async (command) => {
        const commandId = command.get("id") as number;
        const parameters = await CustomCommandParameter.findAll({
          where: { customCommandId: commandId },
          order: [["position", "ASC"]],
        });
        parametersByCommand.set(
          commandId,
          parameters.map((parameter) => ({
            name: parameter.get("name") as string,
            type: parameter.get("type") as CustomCommandParameterDefinition["type"],
            required: parameter.get("required") as boolean,
            defaultValue: (() => {
              const value = parameter.get("defaultValue") as string | null;
              return value === null ? null : (JSON.parse(value) as never);
            })(),
            position: parameter.get("position") as number,
          })),
        );
      }),
    );
    await interaction.editReply(
      commands.length === 0
        ? "No custom commands on this page."
        : commands
            .map((command) => {
              const parameters = parametersByCommand.get(command.get("id") as number) ?? [];
              const signature = parameters
                .map((parameter) =>
                  parameter.required
                    ? `<${parameter.name}:${parameter.type}>`
                    : `[${parameter.name}:${parameter.type}]`,
                )
                .join(" ");
              return `/${command.get("name") as string}${signature ? ` ${signature}` : ""} — ${command.get("language") as string}`;
            })
            .join("\n"),
    );
  },
];

export default { "custom-command": managementCommand };
