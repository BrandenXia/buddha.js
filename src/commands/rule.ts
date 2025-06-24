import { Rules } from "../db.ts";
import type { CmdHandler } from "../commands.ts";
import { Op } from "sequelize";
import { SlashCommandBuilder } from "discord.js";

const buildRuleEntry = async (rule: Rules) => {
  const id = (await rule.get("id")) as number;
  const regex = (await rule.get("regex")) as string;
  const reaction = (await rule.get("reaction")) as string;
  return `${id}. \`${regex}\` - \`${reaction}\``;
};

const buildRulesList = async (rules: Rules[]) =>
  rules.length > 0
    ? (await Promise.all(rules.map((entry) => buildRuleEntry(entry)))).join(
        "\n",
      )
    : "No rules yet!";

const handleRule: CmdHandler = [
  new SlashCommandBuilder()
    .setName("rule")
    .setDescription("Manage rules")
    .addSubcommand((subcmd) =>
      subcmd
        .setName("add")
        .setDescription("Add a new rule")
        .addStringOption((opt) =>
          opt
            .setName("regex")
            .setDescription("Regex to match the rule with")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("reaction")
            .setDescription("Reaction to apply when the rule matches")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName("list")
        .setDescription("List all rules")
        .addIntegerOption((opt) =>
          opt.setName("page").setDescription("Page number when listing rules"),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName("delete")
        .setDescription("Delete specific rule")
        .addIntegerOption((opt) =>
          opt
            .setName("id")
            .setDescription("ID of the rule to delete")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcmd) =>
      subcmd
        .setName("search")
        .setDescription("Search rules")
        .addStringOption((opt) =>
          opt
            .setName("query")
            .setDescription("Term to search for")
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName("page").setDescription("Page number when listing rules"),
        ),
    ),
  async (interaction) => {
    switch (interaction.options.getSubcommand()) {
      case "add":
        await Rules.create({
          regex: interaction.options.getString("regex", true),
          reaction: interaction.options.getString("reaction", true),
        });
        await interaction.reply("Rule added!");
        break;
      case "list": {
        let page = interaction.options.getInteger("page") || 1;
        const rules = await Rules.findAll({
          order: [["id", "ASC"]],
          limit: 10,
          offset: (page - 1) * 10,
        });
        const rulesStr = await buildRulesList(rules);
        await interaction.reply(rulesStr);
        break;
      }
      case "delete":
        await Rules.destroy({
          where: { id: interaction.options.getInteger("id", true) },
        });
        await interaction.reply("Rule deleted!");
        break;
      case "search": {
        const similar = {
          [Op.like]: `%${interaction.options.getString("query", true)}%`,
        };
        let page = interaction.options.getInteger("page") || 1;
        const rules = await Rules.findAll({
          where: {
            [Op.or]: [{ regex: similar }, { reaction: similar }],
          },
          order: [["id", "ASC"]],
          limit: 10,
          offset: (page - 1) * 10,
        });
        const rulesStr = await buildRulesList(rules);
        await interaction.reply(rulesStr);
        break;
      }
    }
  },
];

export default {
  rule: handleRule,
};
