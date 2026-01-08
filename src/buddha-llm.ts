import { appendFile } from "fs/promises";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import OpenAI from "openai";

import { formatEmojis, normalizeEmojis } from "@/utils";

import type { Message, User } from "discord.js";

const BUDDHA_BASE_URL = process.env.BUDDHA_BASE_URL!;

const MAX_TOKENS = 256;
const TEMPERATURE = 0.8;

const client = new OpenAI({ baseURL: BUDDHA_BASE_URL, apiKey: "sk-no-key-required" });

const createResponse = async (msg: string, num: number) => {
  const res = await client.chat.completions.create({
    model: "buddha",
    messages: [{ role: "user", content: msg }],
    n: num,
    max_completion_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });
  return res.choices.map((choice) => choice.message.content as string);
};

const formatResponse = (response: string, user: User) => {
  response = formatEmojis(response);
  return response.replaceAll("@user", `<@${user.id}>`);
};

const preprocessInput = (input: string, mention: boolean) => {
  if (mention) input = input.replace(/<@!?(\d{18,})>/g, "").trim();
  return normalizeEmojis(input);
};

const DATASET_FILE = "data/dpo_dataset.jsonl";
const recordChoice = async (prompt: string, chosen: string, rejected: string) => {
  appendFile(DATASET_FILE, JSON.stringify({ prompt, chosen, rejected }) + "\n");
};

const SELECT_A_ID = "llm_select_a";
const SELECT_B_ID = "llm_select_b";
const buildResponse = (resA: string, resB: string) => {
  const content = `**Response A**:
\`\`\`
${resA}
\`\`\`**Response B**:
\`\`\`
${resB}
\`\`\``;

  const btnA = new ButtonBuilder()
    .setCustomId(SELECT_A_ID)
    .setLabel("A is better")
    .setStyle(ButtonStyle.Success);
  const btnB = new ButtonBuilder()
    .setCustomId(SELECT_B_ID)
    .setLabel("B is better")
    .setStyle(ButtonStyle.Success);
  const btnCustom = new ButtonBuilder()
    .setCustomId(CUSTOM_OUTPUT_ID)
    .setLabel("Custom Output")
    .setStyle(ButtonStyle.Secondary);
  const actionRow = new ActionRowBuilder().addComponents(btnA, btnB, btnCustom).toJSON();

  return { content, components: [actionRow] };
};

const CUSTOM_OUTPUT_ID = "llm_custom_output";
const CUSTOM_RESPONSE_INPUT_ID = "custom_response_input";
const buildCustomOutputResponse = () => {
  const modal = new ModalBuilder().setCustomId(CUSTOM_OUTPUT_ID).setTitle("Custom Output");

  const customInput = new TextInputBuilder()
    .setRequired(true)
    .setMaxLength(4000)
    .setPlaceholder("Enter your custom response here...")
    .setCustomId(CUSTOM_RESPONSE_INPUT_ID)
    .setStyle(TextInputStyle.Paragraph);

  const customInputLabel = new LabelBuilder()
    .setLabel("Please provide your custom response:")
    .setTextInputComponent(customInput);

  modal.addLabelComponents(customInputLabel);

  return modal;
};

const handleChatMessage = async (msg: Message, mention = false) => {
  if (msg.channel.type == ChannelType.GroupDM) return;
  const content = preprocessInput(msg.content, mention);

  const responses = await createResponse(content, 2);
  if (responses.some((res) => res.length > 4000)) {
    await msg.reply("One of the generated responses is too long to display.");
    return;
  }

  const res = buildResponse(responses[0], responses[1]);
  const reply = await msg.reply(res);

  try {
    const i = await reply.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000,
    });

    switch (i.customId) {
      case SELECT_A_ID:
      case SELECT_B_ID:
        const [chosen, rejected] =
          i.customId === SELECT_A_ID ? responses : [responses[1], responses[0]];
        await i.update({ content: formatResponse(chosen, msg.author), components: [] });
        await recordChoice(content, chosen, rejected);
        break;
      case CUSTOM_OUTPUT_ID:
        await i.showModal(buildCustomOutputResponse());
        const modalSubmit = await i.awaitModalSubmit({
          time: 5 * 60 * 1000,
        });
        if (modalSubmit.customId !== CUSTOM_OUTPUT_ID) return;
        if (!modalSubmit.isFromMessage()) return;

        const customResponse = modalSubmit.fields.getTextInputValue(CUSTOM_RESPONSE_INPUT_ID);
        await modalSubmit.update({
          content: formatResponse(customResponse, msg.author),
          components: [],
        });
        await recordChoice(content, customResponse, responses[Math.random() < 0.5 ? 1 : 0]);
        break;
    }
  } catch {}
};

export { createResponse };
export default handleChatMessage;
