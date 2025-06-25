import client from "@/client";
import { TOKEN } from "@/env";
import events from "@/events";

for (const [event, handler] of Object.entries(events)) client.on(event, handler);

client.login(TOKEN).then();
