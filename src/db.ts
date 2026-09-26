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

class CustomCommand extends Model {}
CustomCommand.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    guildId: { type: DataTypes.STRING, allowNull: false },
    commandId: { type: DataTypes.STRING, allowNull: true },
    name: { type: DataTypes.STRING(32), allowNull: false },
    description: { type: DataTypes.STRING(100), allowNull: false },
    language: { type: DataTypes.STRING(16), allowNull: false },
    code: { type: DataTypes.TEXT, allowNull: false },
    includeInput: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.STRING, allowNull: false },
  },
  {
    sequelize,
    modelName: "custom_command",
    indexes: [{ unique: true, fields: ["guildId", "name"] }],
  },
);

class CustomCommandParameter extends Model {}
CustomCommandParameter.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customCommandId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: CustomCommand, key: "id" },
      onDelete: "CASCADE",
    },
    name: { type: DataTypes.STRING(32), allowNull: false },
    type: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "string" },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    defaultValue: { type: DataTypes.TEXT, allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: "custom_command_parameter",
    indexes: [{ unique: true, fields: ["customCommandId", "name"] }],
  },
);

CustomCommand.hasMany(CustomCommandParameter, {
  foreignKey: "customCommandId",
  onDelete: "CASCADE",
});
CustomCommandParameter.belongsTo(CustomCommand, { foreignKey: "customCommandId" });

export default sequelize;
export { CustomCommand, CustomCommandParameter, LotteryLeaderboard, Rules };
