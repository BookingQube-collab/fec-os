/**
 * Executes a SQL migration file statement-by-statement so PostgreSQL enum
 * ADD VALUE commits before the new values are referenced.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let buf = "";
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];

    if (dollarTag) {
      buf += ch;
      if (ch === "$") {
        const maybe = sql.slice(i, i + dollarTag.length);
        if (maybe === dollarTag) {
          buf += dollarTag.slice(1);
          i += dollarTag.length - 1;
          dollarTag = null;
        }
      }
      continue;
    }

    if (ch === "$") {
      const match = sql.slice(i).match(/^(\$[A-Za-z0-9_]*\$)/);
      if (match) {
        dollarTag = match[1];
        buf += match[1];
        i += match[1].length - 1;
        continue;
      }
    }

    if (ch === ";") {
      const stmt = stripLeadingComments(buf).trim();
      if (stmt) statements.push(stmt);
      buf = "";
      continue;
    }

    buf += ch;
  }

  const tail = stripLeadingComments(buf).trim();
  if (tail) statements.push(tail);
  return statements;
}

function stripLeadingComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

export { splitSqlStatements };
