import { PermissionFlagsBits } from "discord.js";
import { UniqueConstraintError } from "sequelize";

import {
  createCustomCommand,
  updateCustomCommand,
  validateCustomCommandName,
  validateCustomCommandParameters,
} from "@/custom-commands";
import logger from "@/logger";
import { parseSandboxDeclaration, validateSandboxSource } from "@/sandbox";

import type { SandboxLanguage } from "@/sandbox";
import type { Message } from "discord.js";

const DECLARATION_PREFIXES = [";declare-command", ";update-command"] as const;
const DECLARATION_PATTERN =
  /^;(declare|update)-command[ \t]*\r?\n```([^\r\n]+)\r?\n([\s\S]*?)\r?\n```[ \t]*$/;

type DeclarationMessageResult =
  | {
      ok: true;
      operation: "create" | "update";
      language: SandboxLanguage;
      code: string;
    }
  | { ok: false; error: string };

const parseDeclarationMessage = (content: string): DeclarationMessageResult => {
  const match = DECLARATION_PATTERN.exec(content.trim());
  const command = content.trimStart().startsWith(";update-command")
    ? ";update-command"
    : ";declare-command";
  if (!match)
    return {
      ok: false,
      error: `Use \`${command}\` followed by one fenced \`py\`, \`python\`, \`js\`, or \`javascript\` function.`,
    };

  const languageName = match[2]!.trim().toLowerCase();
  const language =
    languageName === "py" || languageName === "python"
      ? "python"
      : languageName === "js" || languageName === "javascript"
        ? "javascript"
        : null;
  if (!language)
    return {
      ok: false,
      error: "The code fence language must be `py`, `python`, `js`, or `javascript`.",
    };
  return {
    ok: true,
    operation: match[1] === "update" ? "update" : "create",
    language,
    code: match[3]!,
  };
};

const replyWithoutMentions = (message: Message, content: string) =>
  message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });

const handleCommandDeclaration = async (message: Message) => {
  if (!DECLARATION_PREFIXES.some((prefix) => message.content.trimStart().startsWith(prefix)))
    return false;

  if (!message.guild || !message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await replyWithoutMentions(
      message,
      "You need the Manage Server permission to manage custom commands.",
    );
    return true;
  }

  const parsedMessage = parseDeclarationMessage(message.content);
  if (!parsedMessage.ok) {
    await replyWithoutMentions(message, parsedMessage.error);
    return true;
  }

  const parsedDeclaration = await parseSandboxDeclaration(
    parsedMessage.language,
    parsedMessage.code,
  );
  if (!parsedDeclaration.ok) {
    await replyWithoutMentions(message, `Declaration rejected: ${parsedDeclaration.error}`);
    return true;
  }

  const { declaration } = parsedDeclaration;
  const nameError = validateCustomCommandName(declaration.name);
  if (nameError) {
    await replyWithoutMentions(message, nameError);
    return true;
  }
  const parameterError = validateCustomCommandParameters(declaration.parameters);
  if (parameterError) {
    await replyWithoutMentions(message, `Parameters rejected: ${parameterError}`);
    return true;
  }

  const validation = await validateSandboxSource(
    parsedMessage.language,
    declaration.code,
    declaration.parameters.map((parameter) => parameter.name),
  );
  if (!validation.ok) {
    await replyWithoutMentions(message, `Code rejected: ${validation.error}`);
    return true;
  }

  try {
    if (parsedMessage.operation === "update") {
      const updated = await updateCustomCommand({
        guild: message.guild,
        name: declaration.name,
        description: declaration.description,
        language: parsedMessage.language,
        code: declaration.code,
        parameters: declaration.parameters,
      });
      await replyWithoutMentions(
        message,
        updated
          ? `Updated /${declaration.name} from the declaration.`
          : `/${declaration.name} does not exist in this server. Use \`;declare-command\` to create it.`,
      );
    } else {
      await createCustomCommand({
        guild: message.guild,
        createdBy: message.author.id,
        name: declaration.name,
        description: declaration.description,
        language: parsedMessage.language,
        code: declaration.code,
        parameters: declaration.parameters,
        includeInput: false,
      });
      await replyWithoutMentions(message, `Created /${declaration.name} from the declaration.`);
    }
  } catch (error) {
    if (parsedMessage.operation === "create" && error instanceof UniqueConstraintError)
      await replyWithoutMentions(message, `/${declaration.name} already exists in this server.`);
    else {
      logger.error(
        {
          error,
          guildId: message.guild.id,
          name: declaration.name,
          operation: parsedMessage.operation,
        },
        "Failed to save declared command",
      );
      await replyWithoutMentions(
        message,
        parsedMessage.operation === "update"
          ? "Discord could not update that command. The stored declaration was not changed."
          : "Discord could not create that command. No code was saved.",
      );
    }
  }

  return true;
};

export { parseDeclarationMessage };
export default handleCommandDeclaration;
