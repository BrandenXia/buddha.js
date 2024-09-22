import { decrypt, encrypt } from "../crypto.ts";
import type { CmdHandler } from "../commands.ts";

const handleEncrypt: CmdHandler = async (msg, args) => {
  const text = args.join(" ");
  const encrypted = encrypt(text);

  await msg.reply(encrypted);
};

const handleDecrypt: CmdHandler = async (msg, args) => {
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
