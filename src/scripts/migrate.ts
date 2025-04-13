import { Rules } from "../db";

const rules: [RegExp, string | string[]][] = [];

await Promise.all(
  rules.map(async (rule) => {
    if (typeof rule[1] === "string")
      await Rules.create({
        regex: rule[0].source,
        reaction: rule[1],
      });
    else
      await Promise.all(
        rule[1].map((reaction) =>
          Rules.create({
            regex: rule[0].source,
            reaction,
          }),
        ),
      );
  }),
);
