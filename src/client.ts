import { ActivityType, Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  presence: {
    activities: [
      {
        name: "Siddhartha",
        state: "Eating shit",
        type: ActivityType.Custom,
      },
    ],
  },
});

export default client;
