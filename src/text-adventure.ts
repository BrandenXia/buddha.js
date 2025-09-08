import { ChannelType } from "discord.js";
import OpenAI from "openai";

import logger from "@/logger";

import type { AnyThreadChannel } from "discord.js";
import type { ChatCompletionMessageParam } from "openai/resources";

const TEXT_ADVENTURE_CHANNEL_ID = process.env.TEXT_ADVENTURE_CHANNEL_ID!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const systemPrompt =
  "Create a text adventure game based on the user-provided text. You are the computer and I am the player.";

const aiClient = new OpenAI({ apiKey: OPENAI_API_KEY });

const handleTextAdventure = async (thread: AnyThreadChannel) => {
  if (thread.parent?.type != ChannelType.GuildForum) return;
  if (thread.parentId !== TEXT_ADVENTURE_CHANNEL_ID) return;

  const startingMessage = await thread.fetchStarterMessage();

  if (!startingMessage) return;

  logger.info(`Starting text adventure in thread ${thread.id}`);

  let messages: ChatCompletionMessageParam[] = [
    { role: "developer" as const, content: systemPrompt },
    { role: "user" as const, content: startingMessage.content },
  ];

  while (messages.length < 10000) {
    await thread.sendTyping();
    const aiResponse = await aiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages,
    });
    const aiMessage = aiResponse.choices[0].message.content;
    await thread.send(aiMessage ?? "Error occurred when generating response.");
    messages.push({ role: "assistant", content: aiMessage ?? "" });

    try {
      const userReply = await thread.awaitMessages({
        max: 1,
        filter: (m) => !m.author.bot,
        time: 24 * 60 * 60 * 1000, // 24 hours
        errors: ["time"],
      });
      const reply = userReply.first()!.content;
      messages.push({ role: "user", content: reply });
    } catch {
      thread.send("No reaction received in 24 hours. Ending the game.");
      logger.info(`Ending text adventure in thread ${thread.id} due to timeout.`);
      return;
    }
  }
};

export default handleTextAdventure;
