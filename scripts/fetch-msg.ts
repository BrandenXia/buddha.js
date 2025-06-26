import client from "@/client";
import { TOKEN } from "@/env";

const guildId = process.argv[2];
if (!guildId) throw new Error("Guild ID is required as the first argument");

await client.login(TOKEN);

console.log("Logged in as", client.user?.tag);
console.log("Fetching messages...");

const guild = await client.guilds.fetch(guildId);

if (!guild.available) throw new Error(`Guild with ID ${guildId} not found`);
console.log(`Fetching messages from guild: ${guild.name} (${guild.id})`);

guild.channels.cache.forEach((chan) => {
  if (!chan.isTextBased()) return;
  chan.messages
    .fetch({ limit: 100 })
    .then((msgs) => msgs.forEach((msg) => console.log(msg.content)));
});
