import { DataTypes, Model, Sequelize } from "sequelize";
import logger from "./logger.ts";

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

export default sequelize;
export { LotteryLeaderboard };
