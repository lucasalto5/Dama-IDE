function stripMarkdownFence(value) {
  const text = String(value || "").replace(/^\uFEFF/, "").trim();
  const fenced = text.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || text).trim();
}

function objectCandidate(value) {
  const clean = stripMarkdownFence(value);
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("O modelo não devolveu um objeto JSON.");
  return clean.slice(start, end + 1);
}

function closingQuoteAhead(text, index) {
  let cursor = index + 1;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  if (text[cursor] === '"' || text[cursor] === "'") {
    const nextQuote = text[cursor];
    let keyEnd = cursor + 1;
    while (keyEnd < text.length && text[keyEnd] !== nextQuote && text[keyEnd] !== "\r" && text[keyEnd] !== "\n") keyEnd += 1;
    let afterKey = keyEnd + 1;
    while (afterKey < text.length && /\s/.test(text[afterKey])) afterKey += 1;
    if (text[afterKey] === ":") return true;
  }
  return cursor >= text.length || [":", ",", "}", "]"].includes(text[cursor]);
}

function normalizeStringsAndComments(value) {
  const text = String(value || "");
  let output = "";
  let quote = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (!quote) {
      if (character === "/" && next === "/") {
        while (index < text.length && text[index] !== "\n") index += 1;
        output += "\n";
        continue;
      }
      if (character === "/" && next === "*") {
        index += 2;
        while (index < text.length - 1 && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
        index += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        escaped = false;
        output += '"';
        continue;
      }
      output += character;
      continue;
    }
    if (escaped) {
      if ('"\\/bfnrtu'.includes(character)) output += `\\${character}`;
      else output += `\\\\${character}`;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r" && next === "\n") index += 1;
      output += "\\n";
      continue;
    }
    if (character === quote) {
      if (closingQuoteAhead(text, index)) {
        output += '"';
        quote = null;
      } else {
        output += quote === '"' ? '\\"' : "'";
      }
      continue;
    }
    if (quote === "'" && character === '"') output += '\\"';
    else if (character.charCodeAt(0) < 0x20) output += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    else output += character;
  }
  if (escaped) output += "\\\\";
  if (quote) output += '"';
  return output;
}

function replaceLiteralsOutsideStrings(value) {
  let output = "";
  let buffer = "";
  let inString = false;
  let escaped = false;
  const flush = () => {
    output += buffer
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b|\bundefined\b|\bNaN\b/g, "null");
    buffer = "";
  };
  for (const character of String(value || "")) {
    if (!inString && character === '"') { flush(); inString = true; output += character; continue; }
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else buffer += character;
  }
  flush();
  return output;
}

function repairJson(value) {
  let candidate = normalizeStringsAndComments(objectCandidate(value));
  candidate = replaceLiteralsOutsideStrings(candidate);
  candidate = candidate.replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
  candidate = candidate.replace(/([}\]"])(\s*)(?="[^"\r\n]{1,160}"\s*:)/g, "$1,$2");
  candidate = candidate.replace(/}(\s*){/g, "},$1{").replace(/](\s*)\[/g, "],$1[");
  candidate = candidate.replace(/,(\s*[}\]])/g, "$1");
  return candidate;
}

function parseModelJson(content) {
  const candidate = objectCandidate(content);
  try { return JSON.parse(candidate); }
  catch (firstError) {
    try { return JSON.parse(repairJson(candidate)); }
    catch (secondError) {
      const error = new Error(`O modelo respondeu em um formato que a Dama não conseguiu corrigir: ${secondError.message}`);
      error.cause = firstError;
      error.invalidContent = String(content || "").slice(0, 100000);
      throw error;
    }
  }
}

async function parseModelJsonWithRepair(content, repair, maxAttempts = 2) {
  try { return { value: parseModelJson(content), repaired: false, attempts: 0 }; }
  catch (initialError) {
    let candidate = String(content || "");
    let lastError = initialError;
    for (let attempt = 1; attempt <= Math.max(0, Number(maxAttempts) || 0); attempt += 1) {
      candidate = String(await repair(candidate, attempt, lastError) || "");
      try { return { value: parseModelJson(candidate), repaired: true, attempts: attempt }; }
      catch (error) { lastError = error; }
    }
    const finalError = new Error(`O modelo continuou respondendo em formato inválido após ${maxAttempts} tentativa(s) de correção.`);
    finalError.cause = lastError;
    throw finalError;
  }
}

module.exports = { stripMarkdownFence, objectCandidate, repairJson, parseModelJson, parseModelJsonWithRepair };
