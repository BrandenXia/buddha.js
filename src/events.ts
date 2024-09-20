import { type ClientEvents, Events } from "discord.js";
import client from "./client.ts";
import handleCommands from "./commands.ts";
import handleRules from "./rules.ts";

export default {
  [Events.ClientReady]: () => console.log(`Logged in as ${client.user?.tag}!`),
  [Events.MessageCreate]: async (msg) => {
    if (msg.author.bot) return;

    console.debug(`Received message: ${msg.content}`);

    await handleCommands(msg);
    await handleRules(msg);
  },
} satisfies {
  [E in keyof ClientEvents]?: (...args: ClientEvents[E]) => void;
};
