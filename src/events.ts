import { type ClientEvents, Events } from "discord.js";
import client from "./client.ts";
import handleCommands from "./commands.ts";
import handleRules from "./rules.ts";
import logger from "./logger.ts";

export default {
  [Events.ClientReady]: () => logger.info(`Logged in as ${client.user?.tag}!`),
  [Events.MessageCreate]: async (msg) => {
    if (msg.author.bot) return;

    logger.debug(`Received message: ${msg.content}`);

    await handleCommands(msg);
    await handleRules(msg);
  },
  [Events.Error]: logger.error,
} satisfies {
  [E in keyof ClientEvents]?: (...args: ClientEvents[E]) => void;
};
