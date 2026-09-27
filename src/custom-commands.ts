import { REST, Routes, SlashCommandBuilder } from "discord.js";

import { CustomCommand, CustomCommandParameter } from "@/db";
import logger from "@/logger";
import { executeSandbox } from "@/sandbox";

import type { SandboxLanguage, SandboxParameterType } from "@/sandbox";
import type { ChatInputCommandInteraction, Guild } from "discord.js";

const RESERVED_COMMAND_NAMES = new Set([
  "create-command",
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
const CUSTOM_PARAMETER_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_CUSTOM_PARAMETERS = 10;
const RESERVED_PARAMETER_NAMES = new Set([
  "abs",
  "and",
  "arguments",
  "as",
  "async",
  "await",
  "bool",
  "boolean",
  "break",
  "case",
  "catch",
  "ceil",
  "class",
  "const",
  "continue",
  "debugger",
  "def",
  "del",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "except",
  "export",
  "extends",
  "false",
  "finally",
  "float",
  "floor",
  "for",
  "from",
  "function",
  "global",
  "if",
  "import",
  "in",
  "input",
  "instanceof",
  "int",
  "is",
  "lambda",
  "len",
  "let",
  "match",
  "max",
  "min",
  "new",
  "none",
  "nonlocal",
  "not",
  "null",
  "number",
  "of",
  "or",
  "parsefloat",
  "parseint",
  "pass",
  "print",
  "raise",
  "random",
  "range",
  "return",
  "round",
  "sorted",
  "str",
  "string",
  "sum",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "user_name",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

type CustomCommandParameterDefinition = {
  name: string;
  type: SandboxParameterType;
  required: boolean;
  defaultValue: string | number | boolean | null;
  position: number;
};

const getString = (command: CustomCommand, key: string) => command.get(key) as string;

const parameterFromModel = (
  parameter: CustomCommandParameter,
): CustomCommandParameterDefinition => {
  const storedDefault = parameter.get("defaultValue") as string | null;
  return {
    name: parameter.get("name") as string,
    type: parameter.get("type") as SandboxParameterType,
    required: parameter.get("required") as boolean,
    defaultValue: storedDefault === null ? null : (JSON.parse(storedDefault) as never),
    position: parameter.get("position") as number,
  };
};

const validateCustomCommandParameters = (
  parameters: CustomCommandParameterDefinition[],
): string | null => {
  if (parameters.length > MAX_CUSTOM_PARAMETERS)
    return `Custom commands support at most ${MAX_CUSTOM_PARAMETERS} named parameters.`;
  if (new Set(parameters.map((parameter) => parameter.name)).size !== parameters.length)
    return "Parameter names must be unique.";

  for (const parameter of parameters) {
    if (!CUSTOM_PARAMETER_NAME.test(parameter.name))
      return `Invalid parameter '${parameter.name}'. Use lowercase letters, numbers, and underscores, starting with a letter.`;
    if (RESERVED_PARAMETER_NAMES.has(parameter.name.toLowerCase()))
      return `Parameter '${parameter.name}' is reserved.`;
    if (!["string", "integer", "number", "boolean"].includes(parameter.type))
      return `Parameter '${parameter.name}' has an unsupported type.`;
    if (parameter.required && parameter.defaultValue !== null)
      return `Required parameter '${parameter.name}' cannot have a default value.`;
    if (parameter.defaultValue !== null) {
      const matchesType =
        (parameter.type === "string" && typeof parameter.defaultValue === "string") ||
        (parameter.type === "integer" && Number.isSafeInteger(parameter.defaultValue)) ||
        (parameter.type === "number" &&
          typeof parameter.defaultValue === "number" &&
          Number.isFinite(parameter.defaultValue)) ||
        (parameter.type === "boolean" && typeof parameter.defaultValue === "boolean");
      if (!matchesType) return `Default value for '${parameter.name}' does not match its type.`;
    }
  }
  return null;
};

const buildCustomCommand = (
  command: CustomCommand,
  parameters: CustomCommandParameterDefinition[] = [],
) => {
  const builder = new SlashCommandBuilder()
    .setName(getString(command, "name"))
    .setDescription(getString(command, "description"))
    .setDMPermission(false);

  for (const parameter of [...parameters].sort(
    (left, right) =>
      Number(right.required) - Number(left.required) || left.position - right.position,
  )) {
    const configure = <
      T extends {
        setName(name: string): T;
        setDescription(value: string): T;
        setRequired(required: boolean): T;
      },
    >(
      option: T,
    ) =>
      option
        .setName(parameter.name)
        .setDescription(`Value for ${parameter.name}`)
        .setRequired(parameter.required);

    switch (parameter.type) {
      case "integer":
        builder.addIntegerOption(configure);
        break;
      case "number":
        builder.addNumberOption(configure);
        break;
      case "boolean":
        builder.addBooleanOption(configure);
        break;
      default:
        builder.addStringOption((option) => configure(option).setMaxLength(1_000));
    }
  }

  if (command.get("includeInput") !== false)
    builder.addStringOption((option) =>
      option.setName("input").setDescription("General text input").setMaxLength(1_000),
    );
  return builder;
};

const defaultArgumentValue = (parameter: CustomCommandParameterDefinition) => {
  if (parameter.defaultValue !== null) return parameter.defaultValue;
  switch (parameter.type) {
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return "";
  }
};

const getInteractionArgument = (
  interaction: ChatInputCommandInteraction,
  parameter: CustomCommandParameterDefinition,
) => {
  let value: string | number | boolean | null;
  switch (parameter.type) {
    case "integer":
      value = interaction.options.getInteger(parameter.name);
      break;
    case "number":
      value = interaction.options.getNumber(parameter.name);
      break;
    case "boolean":
      value = interaction.options.getBoolean(parameter.name);
      break;
    default:
      value = interaction.options.getString(parameter.name);
  }
  return value ?? defaultArgumentValue(parameter);
};

const createCustomCommand = async ({
  guild,
  createdBy,
  name,
  description,
  language,
  code,
  parameters,
  includeInput = true,
}: {
  guild: Guild;
  createdBy: string;
  name: string;
  description: string;
  language: SandboxLanguage;
  code: string;
  parameters: CustomCommandParameterDefinition[];
  includeInput?: boolean;
}) => {
  let record: CustomCommand | null = null;
  let registeredId: string | null = null;
  try {
    record = await CustomCommand.create({
      guildId: guild.id,
      commandId: null,
      name,
      description,
      language,
      code,
      includeInput,
      createdBy,
    });
    await CustomCommandParameter.bulkCreate(
      parameters.map((parameter) => ({
        customCommandId: record!.get("id") as number,
        ...parameter,
        defaultValue:
          parameter.defaultValue === null ? null : JSON.stringify(parameter.defaultValue),
      })),
    );
    const registered = await guild.commands.create(buildCustomCommand(record, parameters));
    registeredId = registered.id;
    await record.update({ commandId: registered.id });
    return record;
  } catch (error) {
    if (record) {
      await CustomCommandParameter.destroy({
        where: { customCommandId: record.get("id") as number },
      }).catch(() => undefined);
      await record.destroy().catch(() => undefined);
    }
    if (registeredId) await guild.commands.delete(registeredId).catch(() => undefined);
    throw error;
  }
};

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

  const parameters = await CustomCommandParameter.findAll({
    where: { customCommandId: command.get("id") as number },
    order: [["position", "ASC"]],
  });
  const parameterDefinitions = parameters.map(parameterFromModel);

  await interaction.deferReply();
  const result = await executeSandbox(
    getString(command, "language") as SandboxLanguage,
    getString(command, "code"),
    {
      input: interaction.options.getString("input") ?? "",
      user_name: interaction.user.displayName,
      arguments: Object.fromEntries(
        parameterDefinitions.map((parameter) => [
          parameter.name,
          getInteractionArgument(interaction, parameter),
        ]),
      ),
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
  const parameters = await CustomCommandParameter.findAll({ order: [["position", "ASC"]] });
  const parametersByCommand = new Map<number, CustomCommandParameterDefinition[]>();
  for (const parameter of parameters) {
    const commandId = parameter.get("customCommandId") as number;
    const definitions = parametersByCommand.get(commandId) ?? [];
    definitions.push(parameterFromModel(parameter));
    parametersByCommand.set(commandId, definitions);
  }
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
        const body = buildCustomCommand(
          command,
          parametersByCommand.get(command.get("id") as number) ?? [],
        ).toJSON();
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

export {
  buildCustomCommand,
  createCustomCommand,
  handleCustomCommand,
  syncCustomCommands,
  validateCustomCommandName,
  validateCustomCommandParameters,
};
export type { CustomCommandParameterDefinition };
