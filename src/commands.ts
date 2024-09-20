import type { Message } from "discord.js";

type Handler = (msg: Message) => Promise<void>;

const commands: {
  [key: string]: string | Handler;
} = {
  ping: "pong",
  lottery: async (msg: Message) => {
    const num = Math.floor(Math.random() * 1000); // 1/1000 chance of winning

    if (num === 0) await msg.reply("Congratulations! You won the lottery!");
    else await msg.reply("Better luck next time!");
  },
};

const handleCommands = async (msg: Message) => {
  if (!msg.content.startsWith("!")) return;

  const command = msg.content.slice(1);

  if (Object.keys(commands).includes(command)) {
    const reaction = commands[command];

    if (typeof reaction === "string") {
      await msg.reply(reaction);
    } else {
      await (reaction as Handler)(msg);
    }
  }
};

export default handleCommands;
