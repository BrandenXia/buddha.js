import { type ClientEvents, Events } from "discord.js";
import client from "./client.ts";
import handleCommands from "./commands.ts";
import handleRules from "./rules.ts";
import logger from "./logger.ts";
import sequelize from "./db.ts";

export default {
  [Events.ClientReady]: async () => {
    logger.info(`Logged in as ${client.user?.tag}!`);
    logger.info(`Preparing database...`);
    await sequelize.sync();
  },
  [Events.MessageCreate]: async (msg) => {
    if (msg.author.bot) return;

    logger.debug(`Received message: ${msg.content} from ${msg.author.tag}`);

    if (!(await handleCommands(msg))) await handleRules(msg);
  },
  [Events.Error]: logger.error.bind(logger),
} satisfies {
  [E in keyof ClientEvents]?: (...args: ClientEvents[E]) => void;
};
