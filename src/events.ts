import { Events } from "discord.js";

import client from "@/client";
import { handleCommands, registerCommands } from "@/commands";
import sequelize from "@/db";
import logger from "@/logger";
import handleRules from "@/rules";

import type { ClientEvents } from "discord.js";

export default {
  [Events.ClientReady]: async () => {
    logger.info(`Logged in as ${client.user?.tag}!`);
    logger.info(`Preparing database...`);
    await sequelize.sync();
    await registerCommands();
  },
  [Events.MessageCreate]: async (msg) => {
    if (msg.author.bot) return;

    logger.debug(`Received message: ${msg.content} from ${msg.author.tag}`);

    await handleRules(msg);
  },
  [Events.InteractionCreate]: async (interaction) =>
    interaction.isChatInputCommand() && (await handleCommands(interaction)),
  [Events.Error]: logger.error.bind(logger),
} satisfies {
  [E in keyof ClientEvents]?: (...args: ClientEvents[E]) => void;
};
