import { readFileSync } from "node:fs";

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

export function decodeJsonText(text, source = "JSON") {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid JSON: ${error.message}`);
  }
  return value;
}

export function decodeJsonFile(path) {
  return decodeJsonText(readFileSync(path, "utf8"), path);
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

export function validateSchema(value, schema, path = "$") {
  if (hasOwn(schema, "const") && value !== schema.const) {
    fail(path, `must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    fail(path, `must be one of ${schema.enum.join(", ")}`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      fail(path, `must have type ${types.join("|")}`);
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(path, `must have at least ${schema.minLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      fail(path, `does not match ${schema.pattern}`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      fail(path, "must be an RFC3339 date-time");
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined) {
    if (value < schema.minimum) fail(path, `must be >= ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(path, `must contain at least ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      fail(path, `must contain at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      const unique = new Set(value.map((item) => JSON.stringify(item)));
      if (unique.size !== value.length) fail(path, "must contain unique items");
    }
    if (schema.prefixItems) {
      schema.prefixItems.forEach((itemSchema, index) => {
        if (index < value.length) {
          validateSchema(value[index], itemSchema, `${path}[${index}]`);
        }
      });
      if (schema.items === false && value.length > schema.prefixItems.length) {
        fail(path, "contains unexpected items");
      }
    } else if (schema.items && schema.items !== false) {
      value.forEach((item, index) =>
        validateSchema(item, schema.items, `${path}[${index}]`)
      );
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (
      schema.minProperties !== undefined &&
      Object.keys(value).length < schema.minProperties
    ) {
      fail(path, `must contain at least ${schema.minProperties} properties`);
    }
    for (const key of schema.required ?? []) {
      if (!hasOwn(value, key)) fail(path, `missing required property ${key}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, entry] of Object.entries(value)) {
      if (hasOwn(properties, key)) {
        validateSchema(entry, properties[key], `${path}.${key}`);
      } else if (schema.additionalProperties === false) {
        fail(path, `unexpected property ${key}`);
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        validateSchema(entry, schema.additionalProperties, `${path}.${key}`);
      }
    }
  }
  return value;
}

export function decodeWithSchema(value, schema, source = "$") {
  return validateSchema(value, schema, source);
}

export function decodeJsonl(text, schema, source = "JSONL") {
  const lines = text.split(/\r?\n/);
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "") continue;
    const record = decodeJsonText(line, `${source}:${index + 1}`);
    records.push(validateSchema(record, schema, `${source}:${index + 1}`));
  }
  return records;
}
