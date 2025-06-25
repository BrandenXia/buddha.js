import { DataTypes, Model, Sequelize } from "sequelize";

import logger from "@/logger";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "data/db.sqlite",
  logging: logger.debug.bind(logger),
});

class LotteryLeaderboard extends Model {}
LotteryLeaderboard.init(
  {
    guildId: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false },
    tried: { type: DataTypes.INTEGER, allowNull: false },
    won: { type: DataTypes.INTEGER, allowNull: false },
    lastMessageAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: "lottery_leaderboard" },
);

class Rules extends Model {}
Rules.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    regex: { type: DataTypes.STRING, allowNull: false },
    reaction: { type: DataTypes.STRING, allowNull: false },
  },
  { sequelize, modelName: "rules" },
);

export default sequelize;
export { LotteryLeaderboard, Rules };
