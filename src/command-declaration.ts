import { PermissionFlagsBits } from "discord.js";
import { UniqueConstraintError } from "sequelize";

import {
  createCustomCommand,
  validateCustomCommandName,
  validateCustomCommandParameters,
} from "@/custom-commands";
import logger from "@/logger";
import { parseSandboxDeclaration, validateSandboxSource } from "@/sandbox";

import type { SandboxLanguage } from "@/sandbox";
import type { Message } from "discord.js";

const DECLARATION_PREFIX = ";declare-command";
const DECLARATION_PATTERN =
  /^;declare-command[ \t]*\r?\n```([^\r\n]+)\r?\n([\s\S]*?)\r?\n```[ \t]*$/;

type DeclarationMessageResult =
  | { ok: true; language: SandboxLanguage; code: string }
  | { ok: false; error: string };

const parseDeclarationMessage = (content: string): DeclarationMessageResult => {
  const match = DECLARATION_PATTERN.exec(content.trim());
  if (!match)
    return {
      ok: false,
      error:
        "Use `;declare-command` followed by one fenced `py`, `python`, `js`, or `javascript` function.",
    };

  const languageName = match[1]!.trim().toLowerCase();
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
  return { ok: true, language, code: match[2]! };
};

const replyWithoutMentions = (message: Message, content: string) =>
  message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });

const handleCommandDeclaration = async (message: Message) => {
  if (!message.content.trimStart().startsWith(DECLARATION_PREFIX)) return false;

  if (!message.guild || !message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await replyWithoutMentions(
      message,
      "You need the Manage Server permission to declare custom commands.",
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
  } catch (error) {
    if (error instanceof UniqueConstraintError)
      await replyWithoutMentions(message, `/${declaration.name} already exists in this server.`);
    else {
      logger.error(
        { error, guildId: message.guild.id, name: declaration.name },
        "Failed to create declared command",
      );
      await replyWithoutMentions(
        message,
        "Discord could not create that command. No code was saved.",
      );
    }
  }

  return true;
};

export { parseDeclarationMessage };
export default handleCommandDeclaration;
