import { Rules } from "../db.ts";
import type { CmdHandler } from "../commands.ts";
import { Op } from "sequelize";

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

const handleRule: CmdHandler = async (msg, args) => {
  switch (args[0]) {
    case "add":
      await Rules.create({ regex: args[1], reaction: args[2] });
      await msg.reply("Rule added!");
      break;
    case "list": {
      let page = args.length > 1 ? parseInt(args[1]) : 1;
      const rules = await Rules.findAll({
        order: [["id", "ASC"]],
        limit: 10,
        offset: (page - 1) * 10,
      });
      const rulesStr = await buildRulesList(rules);
      await msg.reply(rulesStr);
      break;
    }
    case "delete":
      await Rules.destroy({
        where: { id: parseInt(args[1]) },
      });
      await msg.reply("Rule deleted!");
      break;
    case "search": {
      const similar = { [Op.iLike]: `%${args[1]}%` };
      let page = args.length > 2 ? parseInt(args[2]) : 1;
      const rules = await Rules.findAll({
        where: {
          [Op.or]: [{ regex: similar }, { reaction: similar }],
        },
        order: [["id", "ASC"]],
        limit: 10,
        offset: (page - 1) * 10,
      });
      const rulesStr = await buildRulesList(rules);
      await msg.reply(rulesStr);
      break;
    }
  }
};

export default {
  rule: handleRule,
};
