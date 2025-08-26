import { REST, Routes } from "discord.js";

import crypto from "@/commands/crypto";
import fortune from "@/commands/fortune";
import lottery from "@/commands/lottery";
import rule from "@/commands/rule";
import talk from "@/commands/talk";
import { CLIENT_ID, TOKEN } from "@/env";
import logger from "@/logger";

import type { ChatInputCommandInteraction, SharedSlashCommand } from "discord.js";

type CmdHandler = [SharedSlashCommand, (interaction: ChatInputCommandInteraction) => Promise<void>];

const commands: {
  [key: string]: CmdHandler;
} = {
  ...lottery,
  ...crypto,
  ...fortune,
  ...rule,
  ...talk,
};

const handleCommands = async (interaction: ChatInputCommandInteraction) => {
  if (!Object.keys(commands).includes(interaction.commandName)) {
    logger.error(`Unknown command: ${interaction.commandName}`);
    return;
  }

  logger.debug(`Received command: ${interaction.commandName} from ${interaction.user.tag}`);

  const reaction = commands[interaction.commandName];
  await reaction[1](interaction);
};

const registerCommands = async () => {
  const rest = new REST().setToken(TOKEN);

  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: Object.values(commands).map((h) => h[0].toJSON()),
  });

  logger.info("Commands successfully registered.");
};

export { handleCommands, registerCommands };
export type { CmdHandler };
