import { Events } from "discord.js";

import handleChatMessage from "@/buddha-llm";
import client from "@/client";
import { handleCommands, registerCommands } from "@/commands";
import sequelize from "@/db";
import logger from "@/logger";
import handleRules from "@/rules";
import handleTextAdventure from "@/text-adventure";

import type { ClientEvents } from "discord.js";

const LLM_TEST_CHANNEL_ID = process.env.LLM_TEST_CHANNEL_ID!;

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

    if (Math.random() < 0.05)
      await handleChatMessage(msg); // random 5% chance
    else if (msg.mentions.has(client.user!.id)) {
      if (!msg.content.includes("@here") && !msg.content.includes("@everyone"))
        // mention
        await handleChatMessage(msg, true);
    } else if (msg.channelId === LLM_TEST_CHANNEL_ID) await handleChatMessage(msg);
  },
  [Events.InteractionCreate]: async (interaction) =>
    interaction.isChatInputCommand() && (await handleCommands(interaction)),
  [Events.ThreadCreate]: async (thread, newlyCreated) => {
    if (newlyCreated) handleTextAdventure(thread);
  },
  [Events.Error]: logger.error.bind(logger),
} satisfies {
  [E in keyof ClientEvents]?: (...args: ClientEvents[E]) => void;
};
