import { decrypt, encrypt } from "../crypto.ts";
import type { Message } from "discord.js";

const handleEncrypt = async (msg: Message, args: string[]) => {
  const text = args.join(" ");
  const encrypted = encrypt(text);

  await msg.reply(encrypted);
};

const handleDecrypt = async (msg: Message, args: string[]) => {
  const text = args.join(" ");

  try {
    const decrypted = decrypt(text);
    await msg.reply(decrypted);
  } catch (e) {
    await msg.reply("Invalid encrypted text");
  }
};

export default {
  encrypt: handleEncrypt,
  decrypt: handleDecrypt,
};
