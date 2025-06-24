import { REST, Routes } from "discord.js";
import logger from "./logger.ts";
import lottery from "./commands/lottery.ts";
import crypto from "./commands/crypto.ts";
import fortune from "./commands/fortune.ts";
import rule from "./commands/rule.ts";
import { TOKEN, CLIENT_ID } from "./env.ts";
import type {
  SharedSlashCommand,
  ChatInputCommandInteraction,
} from "discord.js";

type CmdHandler = [
  SharedSlashCommand,
  (interaction: ChatInputCommandInteraction) => Promise<void>,
];

const commands: {
  [key: string]: CmdHandler;
} = {
  ...lottery,
  ...crypto,
  ...fortune,
  ...rule,
};

const handleCommands = async (interaction: ChatInputCommandInteraction) => {
  if (!Object.keys(commands).includes(interaction.commandName)) {
    logger.debug(`Unknown command: ${interaction.commandName}`);
    return;
  }

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
