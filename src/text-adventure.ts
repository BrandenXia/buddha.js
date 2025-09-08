import { ChannelType } from "discord.js";
import OpenAI from "openai";

import logger from "@/logger";

import type { AnyThreadChannel } from "discord.js";

const TEXT_ADVENTURE_CHANNEL_ID = process.env.TEXT_ADVENTURE_CHANNEL_ID!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const systemPrompt =
  "Create a text adventure game based on the user-provided text. You are the computer and I am the player. Each round I will have 3 choices: A, B, and C.";

const aiClient = new OpenAI({ apiKey: OPENAI_API_KEY });

const EMOJI_A = "🇦";
const EMOJI_B = "🇧";
const EMOJI_C = "🇨";
const EMOJIS_MAP = new Map([
  [EMOJI_A, "A"],
  [EMOJI_B, "B"],
  [EMOJI_C, "C"],
]);
const EMOJIS = [EMOJI_A, EMOJI_B, EMOJI_C];

const handleTextAdventure = async (thread: AnyThreadChannel) => {
  if (thread.parent?.type != ChannelType.GuildForum) return;
  if (thread.parentId !== TEXT_ADVENTURE_CHANNEL_ID) return;

  const startingMessage = await thread.fetchStarterMessage();

  if (!startingMessage) return;

  await startingMessage.react("👍");

  logger.info(`Starting text adventure in thread ${thread.id}`);

  let messages = [
    { role: "developer" as const, content: systemPrompt },
    { role: "user" as const, content: startingMessage.content },
  ];

  while (messages.length < 10000) {
    await thread.sendTyping();
    const aiResponse = await aiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    });
    const msg = await thread.send(
      aiResponse.choices[0].message.content ?? "Error occurred when generating response.",
    );
    await Promise.all(EMOJIS.map(msg.react.bind(msg)));

    try {
      console.log(1);
      const reactions = await msg.awaitReactions({
        max: 1,
        filter: (reaction, user) => EMOJIS.includes(reaction.emoji.name!) && !user.bot,
        time: 24 * 60 * 60 * 1000, // 24 hours
        errors: ["time"],
      });
      console.log(2);
      const choice = reactions.find((value) => EMOJIS.includes(value.emoji.name!));
      console.log(3);
      messages.push({ role: "user", content: EMOJIS_MAP.get(choice!.emoji.name!)! });
    } catch {
      thread.send("No reaction received in 24 hours. Ending the game.");
      logger.info(`Ending text adventure in thread ${thread.id} due to timeout.`);
      return;
    }
  }
};

export default handleTextAdventure;
