import client from "./client.ts";
import { TOKEN } from "./env.ts";
import events from "./events.ts";

for (const [event, handler] of Object.entries(events))
  client.on(event, handler);

client.login(TOKEN).then();
