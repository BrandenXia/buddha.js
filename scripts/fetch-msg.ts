import { DataTypes, Model, Op, Sequelize } from "sequelize";

import client from "@/client";
import { TOKEN } from "@/env";

import type { Collection, Message as DiscordMsg } from "discord.js";

const ACTIONS = ["fetchNew", "fetchPrev"];
const action = process.argv[2];
if (!ACTIONS.includes(action)) throw new Error(`Action must be one of: ${ACTIONS.join(", ")}`);

const chanID = process.argv[3];
if (!chanID) throw new Error("Channel ID is required as the first argument");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "data/msg.sqlite",
  logging: false,
});

class Message extends Model {}
Message.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    editedAt: { type: DataTypes.DATE, allowNull: true },
    authorId: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    chanId: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    modelName: "message",
    indexes: [{ fields: ["createdAt"] }, { fields: ["authorId"] }, { fields: ["chanId"] }],
  },
);
await sequelize.sync();

const mapMsg = (msg: DiscordMsg) => ({
  id: msg.id,
  createdAt: msg.createdAt,
  editedAt: msg.editedAt,
  authorId: msg.author.id,
  content: msg.content,
  chanId: msg.channelId,
});

const msgFilter = (msg: DiscordMsg) => !msg.author.bot && !msg.system && msg.content.trim() !== "";

await client.login(TOKEN);

console.log("Logged in as", client.user?.tag);
console.log("Fetching channel", chanID);

const chan = await client.channels.fetch(chanID);

if (!chan) throw new Error("Channel not found");
if (!chan.isTextBased()) throw new Error("Channel is not a text-based channel");

if ((await Message.count({ where: { chanId: { [Op.eq]: chanID } } })) == 0) {
  console.log("No messages found in the database, fetching the last message...");

  let lastMsg = (await chan.messages.fetch({ limit: 1 })).first();
  if (!lastMsg) throw new Error("No messages found in the channel");
  while (!msgFilter(lastMsg))
    lastMsg = (await chan.messages.fetch({ limit: 1, before: lastMsg.id })).first()!;
  Message.create(mapMsg(lastMsg));
}

console.log("Fetching messages...");

const isFetchNew = action == "fetchNew";
while (true) {
  let msgs: Collection<string, DiscordMsg<boolean>>;
  let filteredMsgs: typeof msgs;

  const msg = await Message.findOne({
    where: { chanId: { [Op.eq]: chanID } },
    order: [["createdAt", isFetchNew ? "DESC" : "ASC"]],
  });
  if (!msg) throw new Error("No messages found in the database");

  console.log("Reference message ID:", msg.get("id"));

  msgs = await chan.messages.fetch({
    limit: 100,
    [isFetchNew ? "after" : "before"]: msg.get("id") as string,
  });

  filteredMsgs = msgs.filter(msgFilter);
  console.log("Fetched", filteredMsgs.size, "messages");

  if (filteredMsgs.size == 0) break;
  await Message.bulkCreate(filteredMsgs.map(mapMsg));
}

console.log("Done fetching messages");
await client.destroy();
