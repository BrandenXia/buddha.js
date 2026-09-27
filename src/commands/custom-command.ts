import { Buffer } from "node:buffer";
import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { getCustomCommandParameters, renderCustomCommandDeclaration } from "@/custom-commands";
import { CustomCommand, CustomCommandParameter } from "@/db";
import logger from "@/logger";

import type { CmdHandler } from "@/commands";
import type { CustomCommandParameterDefinition } from "@/custom-commands";

const managementCommand: CmdHandler = [
  new SlashCommandBuilder()
    .setName("custom-command")
    .setDescription("Manage this server's sandboxed custom commands")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("code")
        .setDescription("Show a custom command's declaration")
        .addStringOption((option) =>
          option.setName("name").setDescription("Command name").setRequired(true),
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

    if (subcommand === "code") {
      const name = interaction.options.getString("name", true);
      const record = await CustomCommand.findOne({
        where: { guildId: interaction.guildId, name },
      });
      if (!record) {
        await interaction.editReply(`/${name} does not exist in this server.`);
        return;
      }

      const parameters = await getCustomCommandParameters(record);
      const source = renderCustomCommandDeclaration(record, parameters);
      const language = record.get("language") as string;
      const fencedSource = `\`\`\`${language === "python" ? "py" : "js"}\n${source}\n\`\`\``;
      if (fencedSource.length <= 2_000 && !source.includes("```")) {
        await interaction.editReply({
          content: fencedSource,
          allowedMentions: { parse: [] },
        });
      } else {
        const extension = language === "python" ? "py" : "js";
        await interaction.editReply({
          content: `Source for /${name}:`,
          files: [
            new AttachmentBuilder(Buffer.from(source, "utf8"), {
              name: `${name}.${extension}`,
            }),
          ],
          allowedMentions: { parse: [] },
        });
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

const helpCommand: CmdHandler = [
  new SlashCommandBuilder()
    .setName("create-command")
    .setDescription("Learn how to declare a sandboxed custom command")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("help").setDescription("Show declaration syntax and sandbox features"),
    ),
  async (interaction) => {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
      content: [
        "Send `;declare-command` followed by one fenced Python or JavaScript function.",
        "",
        "```py",
        "def test(good: str):",
        '    \"\"\"Turn text into emojis\"\"\"',
        "    print(' '.join(f':regional_indicator_{c}:' for c in good))",
        "```",
        "The function name, docstring, typed parameters, and literal defaults define the command.",
        "Python types: `str`, `int`, `float`, `bool`. Safe imports: `math`, `random`, `statistics`, `re`, `json`.",
        "Comprehensions, generators, and safe string methods such as `join`, `split`, `replace`, `lower`, and `upper` are supported.",
        "Useful built-ins include `len`, `range`, `enumerate`, `zip`, `sorted`, `all`, `any`, `min`, `max`, and `sum`.",
        "Higher-order helpers include Python `map`/`filter` with lambdas, and JavaScript `map`/`filter`/`join` with single-expression arrow callbacks.",
        "View saved source with `/custom-command code`; manage declarations with `/custom-command list` and `/custom-command delete`.",
      ].join("\n"),
    });
  },
];

export default {
  "custom-command": managementCommand,
  "create-command": helpCommand,
};
