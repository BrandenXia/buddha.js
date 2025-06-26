import { Message as DiscordMsg } from "discord.js";
import { DataTypes, Model, Op, Sequelize } from "sequelize";

import client from "@/client";
import { TOKEN } from "@/env";

const ACTIONS = ["fetchLast", "fetchPrev"];
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
console.log("Fetching messages...");

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

switch (action) {
  case "fetchLast":
    while (true) {
      const latestMsg = await Message.findOne({
        where: { chanId: { [Op.eq]: chanID } },
        order: [["createdAt", "DESC"]],
      });
      if (!latestMsg) throw new Error("No messages found in the database");

      const msgs = await chan.messages.fetch({
        limit: 100,
        after: latestMsg.get("id") as string,
      });

      if (msgs.size == 0) break;
      await Message.bulkCreate(msgs.filter(msgFilter).map(mapMsg));
    }
    break;
  case "fetchPrev":
    while (true) {
      const earliestMsg = await Message.findOne({
        where: { chanId: { [Op.eq]: chanID } },
        order: [["createdAt", "ASC"]],
      });
      if (!earliestMsg) throw new Error("No messages found in the database");

      const msgs = await chan.messages.fetch({
        limit: 100,
        before: earliestMsg.get("id") as string,
      });

      if (msgs.size == 0) break;
      await Message.bulkCreate(msgs.filter(msgFilter).map(mapMsg));
    }
    break;
}

console.log("Done fetching messages");
